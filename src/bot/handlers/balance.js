// src/bot/handlers/balance.js
import { InlineKeyboard }        from 'grammy';
import { getTransactionsByUser } from '../../collections/transactions.js';
import { fmt, safeEdit }         from '../helpers.js';

export async function balanceHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const user = ctx.user;
  const txns = await getTransactionsByUser(user.telegramId);

  const typeEmoji = { deposit: '⬆️', purchase: '⬇️', recharge: '⬇️' };

  let txText = '';
  if (txns.length) {
    txText = '\n\n📜 *Recent Transactions:*\n' +
      txns.map(t =>
        `${typeEmoji[t.type] || '•'} ${t.description}  ${t.amount > 0 ? '+' : ''}${fmt.usdt(t.amount)}`
      ).join('\n');
  }

  const text =
    `💼 *My Balance*\n\n` +
    `💰 Available: *${fmt.usdt(user.balance)}*\n` +
    `📈 Total Deposited: ${fmt.usdt(user.totalDeposited)}\n` +
    `🛒 Total Spent: ${fmt.usdt(user.totalSpent)}` +
    txText;

  const keyboard = new InlineKeyboard()
    .text('💰  Load Balance', 'deposit').row()
    .text('⬅️  Back',         'start');

  await safeEdit(ctx, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}