// src/bot/handlers/start.js
import { fmt, kb } from '../helpers.js';
import { getConfig } from '../../config.js';

export async function startHandler(ctx) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});

  const user    = ctx.user;
  const { ADMIN_IDS } = getConfig();
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);

  const text =
    `👋 Welcome${user.firstName ? `, *${user.firstName}*` : ''}!\n\n` +
    `🏪 *Digital Shop Bot*\n` +
    `Buy digital products instantly.\n\n` +
    `💼 Your Balance: *${fmt.usd(user.balance)}*`;

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