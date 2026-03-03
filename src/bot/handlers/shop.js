// src/bot/handlers/shop.js
import { InlineKeyboard } from 'grammy';
import { getActiveProducts, getProductById, getStockCount, reserveKey } from '../../collections/products.js';
import { createOrder }   from '../../collections/orders.js';
import { debit }         from '../../services/balance.js';
import { getClient }     from '../../db/client.js';
import { getConfig }     from '../../config.js';
import { fmt, kb, safeEdit } from '../helpers.js';

export async function shopHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const products = await getActiveProducts();

  if (!products.length) {
    await safeEdit(ctx, '😕 No products available yet. Check back soon!', {
      reply_markup: kb.backToMain(),
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const p of products) {
    keyboard.text(`${p.name}  —  ${fmt.usd(p.price)}`, `prod_${p._id}`).row();
  }
  keyboard.text('⬅️  Back', 'start');

  await safeEdit(ctx, '🛍 *Shop* — Choose a product:', {
    parse_mode:   'Markdown',
    reply_markup: keyboard,
  });
}

export async function productHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const productId = ctx.match[1];
  const product   = await getProductById(productId);

  if (!product) {
    await ctx.answerCallbackQuery({ text: 'Product not found.', show_alert: true }).catch(() => {});
    return;
  }

  const stock    = await getStockCount(productId);
  const hasStock = stock > 0;

  const text =
    `📦 *${product.name}*\n\n` +
    `${product.description}\n\n` +
    `💰 Price: *${fmt.usd(product.price)}*\n` +
    `📊 Stock: ${hasStock ? `✅ In Stock (${stock})` : '❌ Out of Stock'}`;

  const keyboard = new InlineKeyboard();
  if (hasStock) keyboard.text(`💳  Buy  ${fmt.usd(product.price)}`, `buy_${productId}`).row();
  keyboard.text('⬅️  Back', 'shop');

  await safeEdit(ctx, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

export async function buyHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});

  const productId = ctx.match[1];
  const product   = await getProductById(productId);
  const user      = ctx.user;

  if (!product) return;

  const canAfford = user.balance >= product.price;

  const text =
    `🛒 *Confirm Purchase*\n\n` +
    `Product: *${product.name}*\n` +
    `Price: *${fmt.usd(product.price)}*\n` +
    `Your Balance: *${fmt.usd(user.balance)}*\n\n` +
    (canAfford
      ? `✅ Tap confirm to complete your purchase.`
      : `❌ Insufficient balance. You need *${fmt.usd(product.price - user.balance)}* more.`
    );

  const keyboard = new InlineKeyboard();
  if (canAfford) {
    keyboard.text('✅  Confirm', `confirm_${productId}`).row();
  } else {
    keyboard.text('💰  Load Balance', 'deposit').row();
  }
  keyboard.text('⬅️  Back', `prod_${productId}`);

  await safeEdit(ctx, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

export async function confirmBuyHandler(ctx) {
  await ctx.answerCallbackQuery({ text: 'Processing...' }).catch(() => {});

  const productId = ctx.match[1];
  const user      = ctx.user;
  const product   = await getProductById(productId);
  if (!product) return;

  const mongoClient = getClient();
  const session     = mongoClient.startSession();

  try {
    let licenseKey;
    let orderId;

    await session.withTransaction(async () => {
      // 1. Reserve key first to check stock
      const tempOrderId = new (await import('mongodb')).ObjectId().toString();
      licenseKey = await reserveKey(productId, user.telegramId, tempOrderId, session);

      // 2. Debit balance (throws INSUFFICIENT_BALANCE if not enough)
      await debit(user.telegramId, product.price, `Purchase: ${product.name}`, null, session);

      // 3. Create order with key embedded
      orderId = await createOrder({
        telegramId:    user.telegramId,
        productId,
        productName:   product.name,
        amountPaid:    product.price,
        rechargePrice: product.rechargePrice || product.price,
        licenseKey:    licenseKey.key,
      }, session);
    });

    // Success — deliver key
    await safeEdit(ctx,
      `✅ *Purchase Successful!*\n\n` +
      `Product: *${product.name}*\n` +
      `Paid: *${fmt.usd(product.price)}*`,
      { parse_mode: 'Markdown' }
    );

    await ctx.reply(
      `🔐 *Your Login Credentials:*\n\n\`${licenseKey.key}\`\n\n` +
      `_You can view this anytime in 📦 My Orders._`,
      { parse_mode: 'Markdown', reply_markup: kb.mainMenu() }
    );

    // Notify admins
    const { ADMIN_IDS } = getConfig();
    const buyerName = user.username ? `@${user.username}` : user.firstName || `#${user.telegramId}`;
    for (const adminId of ADMIN_IDS) {
      await ctx.api.sendMessage(
        adminId,
        `🛒 *New Sale!*\n\n👤 Buyer: ${buyerName}\n📦 Product: ${product.name}\n💰 Amount: ${fmt.usd(product.price)}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      await ctx.reply('❌ Insufficient balance. Please load your balance first.', {
        reply_markup: new InlineKeyboard().text('💰  Load Balance', 'deposit'),
      });
    } else if (err.message === 'OUT_OF_STOCK') {
      await ctx.reply('❌ This product just went out of stock. Sorry!', {
        reply_markup: kb.backToMain(),
      });
    } else {
      console.error('[PURCHASE]', err.message);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  } finally {
    await session.endSession();
  }
}