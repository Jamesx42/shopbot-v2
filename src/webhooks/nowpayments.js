// src/webhooks/nowpayments.js
import { verifyWebhookSignature }  from '../services/nowpayments.js';
import { getDepositByNowPaymentId, getDepositById, updateDepositStatus } from '../collections/deposits.js';
import { credit } from '../services/balance.js';

// Simple in-memory rate limiter (per IP, 30 req/min)
const reqCounts = new Map();
function isRateLimited(ip) {
  const count = reqCounts.get(ip) || 0;
  if (count >= 30) return true;
  reqCounts.set(ip, count + 1);
  setTimeout(() => reqCounts.delete(ip), 60_000);
  return false;
}

export async function handleNowPaymentsWebhook(req, res, bot) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    console.warn('[WEBHOOK] Rate limited:', ip);
    return res.status(429).send('Too Many Requests');
  }

  // Parse body — raw string already collected by app.js
  let payload;
  try {
    payload = JSON.parse(req.body);
  } catch (err) {
    console.error('[WEBHOOK] Bad JSON:', err.message);
    return res.status(400).send('Bad JSON');
  }

  console.log('[WEBHOOK] Payload:', JSON.stringify(payload));

  // Verify HMAC signature
  const sig = req.headers['x-nowpayments-sig'];
  if (!sig) {
    console.warn('[WEBHOOK] Missing signature');
    return res.status(401).send('Unauthorized');
  }

  try {
    const isValid = await verifyWebhookSignature(payload, sig);
    if (!isValid) {
      console.warn('[WEBHOOK] Invalid signature');
      return res.status(401).send('Unauthorized');
    }
  } catch (err) {
    console.error('[WEBHOOK] Signature error:', err.message);
    return res.status(401).send('Signature error');
  }

  const { payment_id, payment_status, order_id, outcome_amount } = payload;
  console.log(`[WEBHOOK] payment_id=${payment_id} status=${payment_status}`);

  // Find deposit — try by payment_id first, then order_id fallback
  let deposit = await getDepositByNowPaymentId(String(payment_id)).catch(() => null);
  if (!deposit && order_id) {
    deposit = await getDepositById(String(order_id)).catch(() => null);
  }

  if (!deposit) {
    console.error('[WEBHOOK] Deposit not found — payment_id:', payment_id);
    return res.status(404).send('Not found');
  }

  // Idempotency — never double-credit
  if (deposit.status === 'finished') {
    console.log('[WEBHOOK] Already processed — ignoring');
    return res.status(200).send('OK');
  }

  if (payment_status === 'confirming' || payment_status === 'confirmed') {
    await updateDepositStatus(String(payment_id), 'confirming');
    await bot.api.sendMessage(
      deposit.telegramId,
      `🔄 *Payment Detected!*\n\nConfirming on blockchain. Your balance will be credited shortly.`,
      { parse_mode: 'Markdown' }
    ).catch(e => console.error('[WEBHOOK] Notify error:', e.message));
  }

  else if (payment_status === 'finished') {
    const reportedUsd = outcome_amount
      ? Math.floor(Number(outcome_amount) * 100)
      : deposit.priceUsd;

    // Cap at 10% over requested amount to handle minor crypto fluctuations
    const actualUsd = Math.min(reportedUsd, Math.floor(deposit.priceUsd * 1.1));

    await updateDepositStatus(String(payment_id), 'finished', actualUsd);

    const user = await credit(
      deposit.telegramId,
      actualUsd,
      `Crypto deposit (${deposit.payCurrency.toUpperCase()})`,
      deposit._id
    );

    console.log('[WEBHOOK] ✅ Credited', actualUsd, 'cents — new balance:', user.balance);

    await bot.api.sendMessage(
      deposit.telegramId,
      `✅ *Balance Credited!*\n\n` +
      `💰 Amount: *$${(actualUsd / 100).toFixed(2)}*\n` +
      `💼 New Balance: *$${(user.balance / 100).toFixed(2)}*\n\n` +
      `You can now purchase products!`,
      { parse_mode: 'Markdown' }
    ).catch(e => console.error('[WEBHOOK] Notify error:', e.message));
  }

  else if (payment_status === 'expired' || payment_status === 'failed') {
    await updateDepositStatus(String(payment_id), payment_status);
    await bot.api.sendMessage(
      deposit.telegramId,
      `❌ *Payment ${payment_status === 'expired' ? 'Expired' : 'Failed'}*\n\nPlease try again from Load Balance.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  return res.status(200).send('OK');
}