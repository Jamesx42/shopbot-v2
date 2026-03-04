// src/bot/helpers.js
import { InlineKeyboard } from 'grammy';

export const fmt = {
  usdt: (cents) => `${(cents / 100).toFixed(2)} USDT`,
  date: (d) => new Date(d).toISOString().slice(0, 10),
};

export const kb = {
  mainMenu: () =>
    new InlineKeyboard()
      .text('🛍  Shop', 'shop').row()
      .text('💰  Load Balance', 'deposit').row()
      .text('💼  My Balance', 'balance').row()
      .text('📦  My Orders', 'orders'),

  mainMenuAdmin: () =>
    new InlineKeyboard()
      .text('🛍  Shop', 'shop').row()
      .text('💰  Load Balance', 'deposit').row()
      .text('💼  My Balance', 'balance').row()
      .text('📦  My Orders', 'orders').row()
      .text('👑  Admin Panel', 'admin'),

  backToMain: () =>
    new InlineKeyboard().text('🏠  Main Menu', 'start'),

  back: (action) =>
    new InlineKeyboard().text('⬅️  Back', action),
};

// Safe edit — falls back to reply if message can't be edited
export async function safeEdit(ctx, text, extra = {}) {
  try {
    await ctx.editMessageText(text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}