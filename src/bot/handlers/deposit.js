// src/bot/handlers/deposit.js
import { InlineKeyboard } from 'grammy';
import { InputFile } from 'grammy';
import { createDeposit, updateDepositPayment, getDepositById } from '../../collections/deposits.js';
import { createPayment, getPaymentStatus } from '../../services/nowpayments.js';
import { setSession, getSession, clearSession } from '../../collections/sessions.js';
import { getConfig } from '../../config.js';
import { fmt, safeEdit } from '../helpers.js';

// QR code API — no npm package needed
function qrUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`;
}

// Build crypto URI for pre-filled QR
function buildCryptoUri(ticker, address, amount) {
  if (ticker === 'usdttrc20') return `tron:${address}?amount=${amount}`;
  if (ticker === 'btc') return `bitcoin:${address}?amount=${amount}`;
  if (ticker === 'eth') return `ethereum:${address}?value=${amount}`;
  return address; // fallback — just address
}

// Step 1 — show preset USDT amount buttons
export async function depositHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const { MIN_DEPOSIT_USDT, MAX_DEPOSIT_USDT } = getConfig();

  const keyboard = new InlineKeyboard()
    .text('10 USDT', 'amt_1000').text('25 USDT', 'amt_2500').text('50 USDT', 'amt_5000').row()
    .text('100 USDT', 'amt_10000').text('200 USDT', 'amt_20000').row()
    .text('✏️  Custom Amount', 'amt_custom').row()
    .text('⬅️  Back', 'start');

  await safeEdit(ctx,
    `💰 *Load Balance*\n\n` +
    `Current Balance: *${fmt.usdt(ctx.user.balance)}*\n\n` +
    `Select USDT amount to deposit:\n` +
    `_(Min: ${MIN_DEPOSIT_USDT} USDT  Max: ${MAX_DEPOSIT_USDT} USDT)_`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// Step 1b — preset amount tapped or custom chosen
export async function amountHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const val = ctx.match[1];

  if (val === 'custom') {
    await setSession(ctx.from.id, { step: 'awaiting_amount' });
    await safeEdit(ctx,
      `✏️ *Enter USDT Amount*\n\nType how much USDT you want to deposit:`,
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('❌  Cancel', 'deposit') }
    );
    return;
  }

  const amountCents = Number(val);
  await createInvoice(ctx, amountCents);
}

// Handle custom USDT amount text input
export async function depositTextHandler(ctx) {
  const session = await getSession(ctx.from.id);
  if (!session || session.step !== 'awaiting_amount') return false;

  const { MIN_DEPOSIT_USDT, MAX_DEPOSIT_USDT } = getConfig();
  const input = parseFloat(ctx.message.text.replace(/[,\s]/g, ''));

  if (isNaN(input) || input < MIN_DEPOSIT_USDT || input > MAX_DEPOSIT_USDT) {
    await ctx.reply(`❌ Enter a number between ${MIN_DEPOSIT_USDT} and ${MAX_DEPOSIT_USDT} USDT.`);
    return true;
  }

  const amountCents = Math.round(input * 100);
  await createInvoice(ctx, amountCents);
  return true;
}

// Create NowPayments invoice and send QR + details
async function createInvoice(ctx, amountCents) {
  const { PAYMENT_EXPIRY_MIN } = getConfig();

  // Only USDT TRC20 for now
  const ticker = 'usdttrc20';
  const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MIN * 60 * 1000);

  const depositId = await createDeposit({
    telegramId: ctx.from.id,
    payCurrency: ticker,
    priceUsdt: amountCents, // stored as cents
    expiresAt,
  });

  let payment;
  try {
    payment = await createPayment({
      amountUsdt: amountCents,
      payCurrency: ticker,
      depositId: depositId.toString(),
    });
  } catch (err) {
    console.error('[DEPOSIT]', err.message);
    await ctx.reply('❌ Failed to create payment. Please try again later.');
    return;
  }

  await updateDepositPayment(depositId, {
    nowPaymentId: payment.payment_id,
    payAddress: payment.pay_address,
    payAmount: payment.pay_amount,
  });

  await clearSession(ctx.from.id);

  // Build pre-filled QR URI
  const cryptoUri = buildCryptoUri(ticker, payment.pay_address, payment.pay_amount);
  const qr = qrUrl(cryptoUri);

  const keyboard = new InlineKeyboard()
    .text('🔄  Check Status', `check_${depositId}`).row()
    .text('🏠  Main Menu', 'start');

  const caption =
    `💳 *USDT TRC20 Payment*\n\n` +
    `Scan QR with your wallet — amount is pre-filled.\n\n` +
    `📤 Send exactly:\n` +
    `*${payment.pay_amount} USDT*\n\n` +
    `📬 To address:\n` +
    `\`${payment.pay_address}\`\n\n` +
    `💰 You receive: *${fmt.usdt(amountCents)}*\n` +
    `⏱ Expires in: *${PAYMENT_EXPIRY_MIN} minutes*\n\n` +
    `⚠️ Send exact amount shown above.\n` +
    `Network fee is included in the amount.`;

  // Send QR as photo with payment details as caption
  try {
    await ctx.replyWithPhoto(qr, {
      caption,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } catch (err) {
    // Fallback to text if QR fetch fails
    console.error('[QR] Failed to send photo:', err.message);
    await ctx.reply(caption, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

// Manual status check
export async function checkDepositHandler(ctx) {
  await ctx.answerCallbackQuery({ text: 'Checking...' }).catch(() => { });

  const depositId = ctx.match[1];
  const deposit = await getDepositById(depositId);

  if (!deposit || deposit.telegramId !== ctx.from.id) {
    await ctx.answerCallbackQuery({ text: 'Deposit not found.', show_alert: true }).catch(() => { });
    return;
  }

  if (deposit.status === 'finished') {
    await ctx.answerCallbackQuery({ text: '✅ Already credited to your balance!', show_alert: true }).catch(() => { });
    return;
  }

  try {
    const status = await getPaymentStatus(deposit.nowPaymentId);
    const labels = {
      waiting: '⏳ Waiting for payment',
      confirming: '🔄 Confirming on blockchain',
      confirmed: '🔄 Confirmed — crediting soon',
      finished: '✅ Completed',
      failed: '❌ Failed',
      expired: '⏰ Expired',
    };
    await ctx.answerCallbackQuery({
      text: labels[status.payment_status] || status.payment_status,
      show_alert: true,
    }).catch(() => { });
  } catch {
    await ctx.answerCallbackQuery({ text: 'Could not fetch status.', show_alert: true }).catch(() => { });
  }
}