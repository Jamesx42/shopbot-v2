// src/bot/handlers/deposit.js
import { InlineKeyboard }  from 'grammy';
import { createDeposit, updateDepositPayment, getDepositById } from '../../collections/deposits.js';
import { createPayment, getPaymentStatus } from '../../services/nowpayments.js';
import { setSession, getSession, clearSession } from '../../collections/sessions.js';
import { getConfig }       from '../../config.js';
import { fmt, safeEdit }   from '../helpers.js';

// Step 1 — show amount options
export async function depositHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const { MIN_DEPOSIT_USD, MAX_DEPOSIT_USD } = getConfig();

  const keyboard = new InlineKeyboard()
    .text('$5',   'amt_500').text('$10',  'amt_1000').text('$25', 'amt_2500').row()
    .text('$50',  'amt_5000').text('$100', 'amt_10000').row()
    .text('✏️  Custom Amount', 'amt_custom').row()
    .text('⬅️  Back', 'start');

  await safeEdit(ctx,
    `💰 *Load Balance*\n\n` +
    `Current Balance: *${fmt.usd(ctx.user.balance)}*\n\n` +
    `Select an amount:\n` +
    `_(Min: $${MIN_DEPOSIT_USD}  Max: $${MAX_DEPOSIT_USD})_`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// Step 1b — amount button tapped
export async function amountHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const val = ctx.match[1];

  if (val === 'custom') {
    await setSession(ctx.from.id, { step: 'awaiting_amount' });
    await safeEdit(ctx,
      `✏️ *Enter Amount*\n\nType the USD amount you want to deposit:`,
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('❌  Cancel', 'deposit') }
    );
    return;
  }

  const amountCents = Number(val);
  await setSession(ctx.from.id, { step: 'select_crypto', amountCents });
  await showCryptoSelect(ctx, amountCents);
}

// Handle custom amount text input
export async function depositTextHandler(ctx) {
  const session = await getSession(ctx.from.id);
  if (!session || session.step !== 'awaiting_amount') return false;

  const { MIN_DEPOSIT_USD, MAX_DEPOSIT_USD } = getConfig();
  const input = parseFloat(ctx.message.text.replace(/[$,]/g, ''));

  if (isNaN(input) || input < MIN_DEPOSIT_USD || input > MAX_DEPOSIT_USD) {
    await ctx.reply(`❌ Enter a number between $${MIN_DEPOSIT_USD} and $${MAX_DEPOSIT_USD}.`);
    return true;
  }

  const amountCents = Math.round(input * 100);
  await setSession(ctx.from.id, { step: 'select_crypto', amountCents });
  await showCryptoSelect(ctx, amountCents);
  return true;
}

async function showCryptoSelect(ctx, amountCents) {
  const { SUPPORTED_CRYPTOS } = getConfig();

  const keyboard = new InlineKeyboard();
  for (const c of SUPPORTED_CRYPTOS) {
    keyboard.text(`${c.emoji}  ${c.name}`, `crypto_${c.ticker}`).row();
  }
  keyboard.text('❌  Cancel', 'deposit');

  await ctx.reply(
    `₿ *Select Crypto*\n\nAmount: *${fmt.usd(amountCents)}*\n\nPay with:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// Step 2 — crypto selected, create invoice
export async function cryptoHandler(ctx) {
  await ctx.answerCallbackQuery({ text: 'Generating address...' }).catch(() => {});

  const ticker  = ctx.match[1];
  const session = await getSession(ctx.from.id);

  if (!session?.amountCents) {
    await ctx.answerCallbackQuery({ text: 'Session expired. Start again.', show_alert: true }).catch(() => {});
    return;
  }

  const { PAYMENT_EXPIRY_MIN } = getConfig();
  const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MIN * 60 * 1000);

  const depositId = await createDeposit({
    telegramId:  ctx.from.id,
    payCurrency: ticker,
    priceUsd:    session.amountCents,
    expiresAt,
  });

  let payment;
  try {
    payment = await createPayment({
      priceUsd:    session.amountCents,
      payCurrency: ticker,
      depositId:   depositId.toString(),
    });
  } catch (err) {
    console.error('[DEPOSIT]', err.message);
    await ctx.reply('❌ Failed to create payment. Please try again later.');
    return;
  }

  await updateDepositPayment(depositId, {
    nowPaymentId: String(payment.payment_id),
    payAddress:   payment.pay_address,
    payAmount:    payment.pay_amount,
  });

  await clearSession(ctx.from.id);

  const keyboard = new InlineKeyboard()
    .text('🔄  Check Status', `check_${depositId}`).row()
    .text('🏠  Main Menu',    'start');

  await safeEdit(ctx,
    `💳 *Payment Address*\n\n` +
    `Send exactly:\n*${payment.pay_amount} ${ticker.toUpperCase()}*\n\n` +
    `To address:\n\`${payment.pay_address}\`\n\n` +
    `💰 USD Value: *${fmt.usd(session.amountCents)}*\n` +
    `⏱ Expires in: *${PAYMENT_EXPIRY_MIN} minutes*\n\n` +
    `⚠️ Send exact amount to exact address.\n` +
    `Your balance is credited automatically after confirmation.`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// Manual status check
export async function checkDepositHandler(ctx) {
  await ctx.answerCallbackQuery({ text: 'Checking...' }).catch(() => {});

  const depositId = ctx.match[1];
  const deposit   = await getDepositById(depositId);

  if (!deposit || deposit.telegramId !== ctx.from.id) {
    await ctx.answerCallbackQuery({ text: 'Deposit not found.', show_alert: true }).catch(() => {});
    return;
  }

  if (deposit.status === 'finished') {
    await ctx.answerCallbackQuery({ text: '✅ Already credited to your balance!', show_alert: true }).catch(() => {});
    return;
  }

  try {
    const status = await getPaymentStatus(deposit.nowPaymentId);
    const labels = {
      waiting:    '⏳ Waiting for payment',
      confirming: '🔄 Confirming on blockchain',
      confirmed:  '🔄 Confirmed — crediting soon',
      finished:   '✅ Completed',
      failed:     '❌ Failed',
      expired:    '⏰ Expired',
    };
    await ctx.answerCallbackQuery({
      text:       labels[status.payment_status] || status.payment_status,
      show_alert: true,
    }).catch(() => {});
  } catch {
    await ctx.answerCallbackQuery({ text: 'Could not fetch status.', show_alert: true }).catch(() => {});
  }
}