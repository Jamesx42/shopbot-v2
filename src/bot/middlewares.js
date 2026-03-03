// src/bot/middlewares.js
import { findOrCreateUser } from '../collections/users.js';
import { getConfig }        from '../config.js';

export async function userMiddleware(ctx, next) {
  if (!ctx.from) return next();
  ctx.user = await findOrCreateUser(ctx.from);
  if (ctx.user?.isBanned) {
    await ctx.reply('⛔ Your account has been banned.').catch(() => {});
    return;
  }
  return next();
}

export async function adminMiddleware(ctx, next) {
  const { ADMIN_IDS } = getConfig();
  if (!ADMIN_IDS.includes(ctx.from?.id)) {
    await ctx.answerCallbackQuery({ text: '⛔ Unauthorized', show_alert: true }).catch(() => {});
    return;
  }
  return next();
}