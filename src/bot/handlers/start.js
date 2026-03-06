// src/bot/handlers/start.js
import { fmt, kb } from '../helpers.js';
import { getConfig } from '../../config.js';

export async function startHandler(ctx) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => { });

  const user = ctx.user;
  const { ADMIN_IDS } = getConfig();
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);

  const text =
    `🎰 *Slots Buy Bot*\n` +
    `⚡ Instant game credits — best rates, 24/7.\n` +
    `_*Buy/Recharge - 1000 Credits_\n\n` +
    `💼 Your Balance: *${fmt.usdt(user.balance)}*`;

  const keyboard = isAdmin ? kb.mainMenuAdmin() : kb.mainMenu();

  // Always send a fresh message for /start command
  // For callback queries (Back buttons) edit the existing message
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}