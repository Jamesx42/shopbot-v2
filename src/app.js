// src/app.js — Railway entry point
import 'dotenv/config';
import http from 'http';
import { connectDB, closeDB } from './db/client.js';
import { createBot } from './bot/index.js';
import { handleNowPaymentsWebhook } from './webhooks/nowpayments.js';

const PORT = process.env.PORT || 8080;

// ── Startup ───────────────────────────────────────────────
console.log('🔌 Connecting to MongoDB...');
await connectDB();
console.log('✅ MongoDB connected');

const bot = createBot();

// Register bot command menu (shown in the "/" menu bar)
await bot.api.setMyCommands([
  { command: 'menu', description: '🏠 Main Menu' },
]);

// Delete any existing webhook — ensure long polling works cleanly
await bot.api.deleteWebhook({ drop_pending_updates: true });
console.log('✅ Webhook cleared — starting long polling');

// ── Long polling with 409 retry ───────────────────────────
async function startPolling(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await bot.start({ onStart: () => console.log('✅ Bot is running!') });
      return;
    } catch (err) {
      if (err.error_code === 409) {
        console.warn(`⚠️  Conflict — another instance running. Retry ${i + 1}/${retries} in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        throw err;
      }
    }
  }
  console.error('❌ Could not start after retries. Exiting.');
  process.exit(1);
}

startPolling();

// ── HTTP server — NOWPayments IPN only ───────────────────
const server = http.createServer(async (req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: Date.now() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/webhook/nowpayments') {
    // Collect raw body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      // Attach raw body string for the handler to parse
      req.body = body;

      // Build a minimal Express-like res wrapper
      const respond = {
        status: (code) => ({
          send: (msg) => {
            res.writeHead(code);
            res.end(String(msg));
          },
        }),
      };

      try {
        await handleNowPaymentsWebhook(req, respond, bot);
      } catch (err) {
        console.error('[WEBHOOK] Unhandled error:', err.message);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => console.log(`🚀 HTTP server listening on port ${PORT}`));

// ── Graceful shutdown (Railway sends SIGTERM on redeploy) ─
async function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  try {
    await bot.stop();
    console.log('✅ Bot stopped');
  } catch (e) {
    console.error('Bot stop error:', e.message);
  }
  try {
    server.close(() => console.log('✅ HTTP server closed'));
  } catch { }
  await closeDB();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));