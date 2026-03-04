// src/bot/handlers/recharge.js
import { InlineKeyboard }  from 'grammy';
import { getOrderById }    from '../../collections/orders.js';
import { createRecharge, completeRecharge } from '../../collections/recharges.js';
import { debit }           from '../../services/balance.js';
import { getConfig }       from '../../config.js';
import { fmt, safeEdit }   from '../helpers.js';

// User taps ⚡ Recharge on an order
export async function requestRechargeHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const orderId = ctx.match[1];
  const order   = await getOrderById(orderId, ctx.user.telegramId);

  if (!order) {
    await ctx.answerCallbackQuery({ text: 'Order not found.', show_alert: true }).catch(() => {});
    return;
  }

  const cost = order.rechargePrice || order.amountPaid;

  if (ctx.user.balance < cost) {
    await safeEdit(ctx,
      `❌ *Insufficient Balance*\n\n` +
      `Recharge costs: *${fmt.usdt(cost)}*\n` +
      `Your balance: *${fmt.usdt(ctx.user.balance)}*\n\n` +
      `Please load your balance first.`,
      {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard()
          .text('💰  Load Balance', 'deposit').row()
          .text('⬅️  Back', `order_${orderId}`),
      }
    );
    return;
  }

  await safeEdit(ctx,
    `⚡ *Request Recharge*\n\n` +
    `Product: *${order.productName}*\n` +
    `Account: \`${order.licenseKey}\`\n` +
    `Cost: *${fmt.usdt(cost)}*\n` +
    `Your Balance: *${fmt.usdt(ctx.user.balance)}*\n\n` +
    `Balance will be deducted now. Admin will be notified to recharge your account.`,
    {
      parse_mode:   'Markdown',
      reply_markup: new InlineKeyboard()
        .text('✅  Confirm Recharge', `confirm_recharge_${orderId}`).row()
        .text('❌  Cancel',           `order_${orderId}`),
    }
  );
}

// User confirms recharge
export async function confirmRechargeHandler(ctx) {
  await ctx.answerCallbackQuery({ text: 'Processing...' }).catch(() => {});

  const orderId = ctx.match[1];
  const order   = await getOrderById(orderId, ctx.user.telegramId);
  if (!order) return;

  const cost = order.rechargePrice || order.amountPaid;

  try {
    await debit(ctx.user.telegramId, cost, `Recharge: ${order.productName}`, orderId);

    const rechargeId = await createRecharge({
      telegramId:  ctx.user.telegramId,
      orderId,
      productName: order.productName,
      licenseKey:  order.licenseKey,
      amount:      cost,
    });

    await safeEdit(ctx,
      `✅ *Recharge Requested!*\n\n` +
      `Product: *${order.productName}*\n` +
      `Amount deducted: *${fmt.usdt(cost)}*\n\n` +
      `Admin has been notified and will recharge your account shortly.`,
      {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard().text('🏠  Main Menu', 'start'),
      }
    );

    // Notify admins
    const { ADMIN_IDS } = getConfig();
    const buyerName = ctx.user.username
      ? `@${ctx.user.username}`
      : ctx.user.firstName || `#${ctx.user.telegramId}`;

    const adminMsg =
      `⚡ *New Recharge Request*\n\n` +
      `👤 User: ${buyerName}\n` +
      `📦 Product: ${order.productName}\n` +
      `🔑 Account: \`${order.licenseKey}\`\n` +
      `💰 Amount: *${fmt.usdt(cost)}*`;

    for (const adminId of ADMIN_IDS) {
      await ctx.api.sendMessage(adminId, adminMsg, {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard()
          .text('✅  Mark Complete', `admin_recharge_done_${rechargeId}`),
      }).catch(e => console.error(`[RECHARGE] Admin notify failed ${adminId}:`, e.message));
    }

  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      await ctx.reply('❌ Insufficient balance.');
    } else {
      console.error('[RECHARGE]', err.message);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  }
}

// Admin marks recharge complete (from chat notification button)
export async function adminRechargeCompleteHandler(ctx) {
  await ctx.answerCallbackQuery({ text: 'Marking complete...' }).catch(() => {});

  const rechargeId = ctx.match[1];
  const recharge   = await completeRecharge(rechargeId);

  if (!recharge) {
    await ctx.answerCallbackQuery({ text: 'Already completed or not found.', show_alert: true }).catch(() => {});
    return;
  }

  // Update admin message
  await ctx.editMessageText(
    ctx.callbackQuery.message.text + '\n\n✅ *Completed!*',
    { parse_mode: 'Markdown' }
  ).catch(() => {});

  // Notify buyer
  await ctx.api.sendMessage(
    recharge.telegramId,
    `✅ *Your Account Has Been Recharged!*\n\n` +
    `📦 Product: *${recharge.productName}*\n` +
    `💰 Amount: *${fmt.usdt(recharge.amount)}*\n\n` +
    `You're all set! Enjoy.`,
    { parse_mode: 'Markdown' }
  ).catch(e => console.error('[RECHARGE] Buyer notify failed:', e.message));
}