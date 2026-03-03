// src/bot/index.js
import { Bot } from 'grammy';
import { getConfig } from '../config.js';
import { userMiddleware, adminMiddleware } from './middlewares.js';

import { startHandler }    from './handlers/start.js';
import { shopHandler, productHandler, buyHandler, confirmBuyHandler } from './handlers/shop.js';
import { balanceHandler }  from './handlers/balance.js';
import { ordersHandler, orderDetailHandler } from './handlers/orders.js';
import { depositHandler, amountHandler, depositTextHandler, cryptoHandler, checkDepositHandler } from './handlers/deposit.js';
import { requestRechargeHandler, confirmRechargeHandler, adminRechargeCompleteHandler } from './handlers/recharge.js';
import {
  adminHandler, adminProductsHandler, adminProductActionsHandler,
  adminToggleHandler, adminAddProductHandler, adminAddKeysHandler,
  adminTextHandler, adminConfirmProductHandler, adminStatsHandler,
  adminKeysMenuHandler, adminRechargesHandler, adminRechargeViewHandler,
} from './handlers/admin.js';

export function createBot() {
  const { BOT_TOKEN } = getConfig();
  const bot = new Bot(BOT_TOKEN);

  // ── Global middleware ────────────────────────────────────
  bot.use(userMiddleware);

  // ── Commands ─────────────────────────────────────────────
  bot.command('start', startHandler);
  bot.command('admin', adminMiddleware, adminHandler);

  // ── Main navigation ──────────────────────────────────────
  bot.callbackQuery('start',   startHandler);
  bot.callbackQuery('shop',    shopHandler);
  bot.callbackQuery('balance', balanceHandler);
  bot.callbackQuery('orders',  ordersHandler);
  bot.callbackQuery('deposit', depositHandler);
  bot.callbackQuery('admin',   adminMiddleware, adminHandler);

  // ── Orders ───────────────────────────────────────────────
  bot.callbackQuery(/^order_(.+)$/, orderDetailHandler);

  // ── Recharge (before confirm_ to avoid pattern conflict) ─
  bot.callbackQuery(/^recharge_(.+)$/,            requestRechargeHandler);
  bot.callbackQuery(/^confirm_recharge_(.+)$/,    confirmRechargeHandler);
  bot.callbackQuery(/^admin_recharge_done_(.+)$/, adminMiddleware, adminRechargeCompleteHandler);
  bot.callbackQuery('admin_recharges',            adminMiddleware, adminRechargesHandler);
  bot.callbackQuery(/^admin_recharge_view_(.+)$/, adminMiddleware, adminRechargeViewHandler);

  // ── Shop ─────────────────────────────────────────────────
  bot.callbackQuery(/^prod_(.+)$/,    productHandler);
  bot.callbackQuery(/^buy_(.+)$/,     buyHandler);
  bot.callbackQuery(/^confirm_(.+)$/, confirmBuyHandler);

  // ── Deposit ──────────────────────────────────────────────
  bot.callbackQuery(/^amt_(.+)$/,    amountHandler);
  bot.callbackQuery(/^crypto_(.+)$/, cryptoHandler);
  bot.callbackQuery(/^check_(.+)$/,  checkDepositHandler);

  // ── Admin ────────────────────────────────────────────────
  bot.callbackQuery('admin_products',        adminMiddleware, adminProductsHandler);
  bot.callbackQuery('admin_keys',            adminMiddleware, adminKeysMenuHandler);
  bot.callbackQuery('admin_stats',           adminMiddleware, adminStatsHandler);
  bot.callbackQuery('admin_add_product',     adminMiddleware, adminAddProductHandler);
  bot.callbackQuery('admin_confirm_product', adminMiddleware, adminConfirmProductHandler);
  bot.callbackQuery(/^admin_prod_(.+)$/,     adminMiddleware, adminProductActionsHandler);
  bot.callbackQuery(/^admin_toggle_(.+)$/,   adminMiddleware, adminToggleHandler);
  bot.callbackQuery(/^admin_addkeys_(.+)$/,  adminMiddleware, adminAddKeysHandler);

  // ── Text message router ───────────────────────────────────
  bot.on('message:text', async (ctx) => {
    const { ADMIN_IDS } = getConfig();
    const isAdmin = ADMIN_IDS.includes(ctx.from.id);

    if (await depositTextHandler(ctx)) return;
    if (isAdmin && await adminTextHandler(ctx)) return;
  });

  // ── Error handler ─────────────────────────────────────────
  bot.catch((err) => {
    console.error('[BOT ERROR]', err.message);
  });

  return bot;
}