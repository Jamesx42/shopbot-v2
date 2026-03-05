// src/bot/handlers/orders.js
import { InlineKeyboard }            from 'grammy';
import { getOrdersByUser, getOrderById } from '../../collections/orders.js';
import { fmt, safeEdit }             from '../helpers.js';

export async function ordersHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const orders = await getOrdersByUser(ctx.user.telegramId);

  if (!orders.length) {
    await safeEdit(ctx,
      `📦 *My Orders*\n\nYou haven't purchased anything yet.`,
      {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard()
          .text('🛍  Shop', 'shop').row()
          .text('⬅️  Back', 'start'),
      }
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const o of orders) {
    keyboard.text(`${o.productName}  —  ${fmt.date(o.createdAt)}`, `order_${o._id}`).row();
  }
  keyboard.text('⬅️  Back', 'start');

  await safeEdit(ctx,
    `📦 *My Orders* (${orders.length} ${orders.length === 1 ? 'account' : 'accounts'})\n\nTap an order to view credentials:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

export async function orderDetailHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const orderId = ctx.match[1];
  const order   = await getOrderById(orderId, ctx.user.telegramId);

  if (!order) {
    await ctx.answerCallbackQuery({ text: 'Order not found.', show_alert: true }).catch(() => {});
    return;
  }

  const text =
    `📦 *Order Details*\n\n` +
    `Product: *${order.productName}*\n` +
    `Paid: *${fmt.usdt(order.amountPaid)}*\n` +
    `Date: ${fmt.date(order.createdAt)}\n\n` +
    `🔐 *Login Credentials:*\n\`${order.licenseKey}\``;

  const keyboard = new InlineKeyboard()
    .text(`⚡  Recharge  ${fmt.usdt(order.rechargePrice)}`, `recharge_${orderId}`).row()
    .text('⬅️  Back', 'orders');

  await safeEdit(ctx, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}