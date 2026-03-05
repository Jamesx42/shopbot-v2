// src/bot/handlers/admin.js
import { InlineKeyboard } from 'grammy';
import { getAllProducts, createProduct, toggleProduct, addLicenseKeys, getStockCount } from '../../collections/products.js';
import { getUserCount, getUsersPaginated } from '../../collections/users.js';
import { getOrderCount, getRevenue } from '../../collections/orders.js';
import { getPendingRecharges, completeRecharge } from '../../collections/recharges.js';
import { setSession, getSession, clearSession } from '../../collections/sessions.js';
import { getTransactionsByUserPaginated } from '../../collections/transactions.js';
import { fmt, safeEdit } from '../helpers.js';
import { getBalance } from '../../services/nowpayments.js';

// ── Admin Menu ────────────────────────────────────────────
export async function adminHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const pending = await getPendingRecharges();
  const badge = pending.length ? ` (${pending.length})` : '';

  const keyboard = new InlineKeyboard()
    .text('📦  Products', 'admin_products').row()
    .text('🔑  Add Keys', 'admin_keys').row()
    .text(`⚡  Recharge Queue${badge}`, 'admin_recharges').row()
    .text('👥  Users', 'admin_users_0').row()
    .text('📊  Stats', 'admin_stats').row()
    .text('💰  Main Balance', 'admin_balance').row()
    .text('🌐  Server IP', 'admin_serverip').row()
    .text('🏠  Main Menu', 'start');

  await safeEdit(ctx, '👑 *Admin Panel*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// ── Product List ──────────────────────────────────────────
export async function adminProductsHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const products = await getAllProducts();

  const keyboard = new InlineKeyboard()
    .text('➕  Add Product', 'admin_add_product').row();

  for (const p of products) {
    const stock = await getStockCount(p._id.toString());
    const status = p.isActive ? '✅' : '❌';
    keyboard.text(`${status} ${p.name} — ${fmt.usdt(p.price)} (${stock})`, `admin_prod_${p._id}`).row();
  }
  keyboard.text('⬅️  Back', 'admin');

  await safeEdit(ctx, '📦 *Products*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// ── Product Actions ───────────────────────────────────────
export async function adminProductActionsHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const productId = ctx.match[1];
  const products = await getAllProducts();
  const product = products.find(p => p._id.toString() === productId);
  if (!product) return;

  const stock = await getStockCount(productId);

  await safeEdit(ctx,
    `📦 *${product.name}*\n` +
    `Price: ${fmt.usdt(product.price)}\n` +
    `Recharge Price: ${fmt.usdt(product.rechargePrice)}\n` +
    `Status: ${product.isActive ? '✅ Active' : '❌ Inactive'}\n` +
    `Stock: ${stock} keys  |  Sold: ${product.totalSold}`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text(product.isActive ? '❌  Deactivate' : '✅  Activate', `admin_toggle_${productId}`).row()
        .text('🔑  Add Keys', `admin_addkeys_${productId}`).row()
        .text('⬅️  Back', 'admin_products'),
    }
  );
}

// ── Toggle Active ─────────────────────────────────────────
export async function adminToggleHandler(ctx) {
  const productId = ctx.match[1];
  const newState = await toggleProduct(productId);
  await ctx.answerCallbackQuery({
    text: newState ? '✅ Product activated' : '❌ Product deactivated',
    show_alert: true,
  }).catch(() => { });
  await adminProductsHandler(ctx);
}

// ── Start Add Product Flow ────────────────────────────────
export async function adminAddProductHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });
  await setSession(ctx.from.id, { step: 'admin_name' });
  await safeEdit(ctx,
    '➕ *Add Product*\n\nStep 1: Enter the *product name*:',
    { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('❌  Cancel', 'admin_products') }
  );
}

// ── Start Add Keys Flow ───────────────────────────────────
export async function adminAddKeysHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });
  const productId = ctx.match[1];
  await setSession(ctx.from.id, { step: 'admin_keys', productId });
  await ctx.reply(
    `🔑 *Add License Keys*\n\nPaste your keys — *one key per line*:`,
    { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('❌  Cancel', 'admin_products') }
  );
}

// ── Admin Text Input Router ───────────────────────────────
export async function adminTextHandler(ctx) {
  const session = await getSession(ctx.from.id);
  if (!session?.step?.startsWith('admin_')) return false;

  const text = ctx.message.text.trim();

  if (session.step === 'admin_name') {
    await setSession(ctx.from.id, { ...session, step: 'admin_description', name: text });
    await ctx.reply('Step 2: Enter the *product description*:', { parse_mode: 'Markdown' });
    return true;
  }

  if (session.step === 'admin_description') {
    await setSession(ctx.from.id, { ...session, step: 'admin_price', description: text });
    await ctx.reply('Step 3: Enter the *price in USD* (e.g. 9.99):', { parse_mode: 'Markdown' });
    return true;
  }

  if (session.step === 'admin_price') {
    const price = parseFloat(text.replace('$', ''));
    if (isNaN(price) || price <= 0) {
      await ctx.reply('❌ Invalid price. Enter a number like 9.99');
      return true;
    }
    const priceCents = Math.round(price * 100);
    await setSession(ctx.from.id, { ...session, step: 'admin_recharge_price', price: priceCents });
    await ctx.reply('Step 4: Enter the *recharge price in USD* (e.g. 9.99):', { parse_mode: 'Markdown' });
    return true;
  }

  if (session.step === 'admin_recharge_price') {
    const rPrice = parseFloat(text.replace('$', ''));
    if (isNaN(rPrice) || rPrice <= 0) {
      await ctx.reply('❌ Invalid price. Enter a number like 9.99');
      return true;
    }
    const rPriceCents = Math.round(rPrice * 100);
    const s = { ...session, step: 'admin_confirm', rechargePrice: rPriceCents };
    await setSession(ctx.from.id, s);
    await ctx.reply(
      `✅ *Confirm New Product:*\n\n` +
      `Name: *${s.name}*\n` +
      `Description: ${s.description}\n` +
      `Price: *${fmt.usdt(s.price)}*\n` +
      `Recharge Price: *${fmt.usdt(s.rechargePrice)}*`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('✅  Create', 'admin_confirm_product').row()
          .text('❌  Cancel', 'admin_products'),
      }
    );
    return true;
  }

  if (session.step === 'admin_keys') {
    const keys = text.split('\n');
    try {
      const count = await addLicenseKeys(session.productId, keys);
      await clearSession(ctx.from.id);
      await ctx.reply(
        `✅ *${count} keys added successfully!*`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('⬅️  Back to Products', 'admin_products'),
        }
      );
    } catch (err) {
      await ctx.reply(`❌ Error: ${err.message}`);
    }
    return true;
  }

  return false;
}

// ── Confirm Create Product ────────────────────────────────
export async function adminConfirmProductHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const session = await getSession(ctx.from.id);
  if (!session?.name) {
    await ctx.reply('Session expired. Start again.');
    return;
  }

  await createProduct({
    name: session.name,
    description: session.description,
    price: session.price,
    rechargePrice: session.rechargePrice,
  });

  await clearSession(ctx.from.id);

  await safeEdit(ctx,
    `✅ *Product Created!*\n\n*${session.name}* — ${fmt.usdt(session.price)}\nRecharge: ${fmt.usdt(session.rechargePrice)}\n\nNow add license keys to it.`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('📦  View Products', 'admin_products'),
    }
  );
}

// ── Stats ─────────────────────────────────────────────────
export async function adminStatsHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const [userCount, orderCount, revenue] = await Promise.all([
    getUserCount(),
    getOrderCount(),
    getRevenue(),
  ]);

  await safeEdit(ctx,
    `📊 *Bot Stats*\n\n` +
    `👥 Total Users: ${userCount}\n` +
    `🛒 Total Orders: ${orderCount}\n` +
    `💰 Total Revenue: *${fmt.usdt(revenue)}*`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🔄  Refresh', 'admin_stats').row()
        .text('⬅️  Back', 'admin'),
    }
  );
}

// ── Keys Menu (select product) ────────────────────────────
export async function adminKeysMenuHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const products = await getAllProducts();
  if (!products.length) {
    await safeEdit(ctx, 'No products yet. Add a product first.', {
      reply_markup: new InlineKeyboard().text('⬅️  Back', 'admin'),
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const p of products) {
    keyboard.text(p.name, `admin_addkeys_${p._id}`).row();
  }
  keyboard.text('⬅️  Back', 'admin');

  await safeEdit(ctx, '🔑 *Add Keys — Select Product:*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// ── Recharge Queue ────────────────────────────────────────
export async function adminRechargesHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const recharges = await getPendingRecharges();

  if (!recharges.length) {
    await safeEdit(ctx,
      `⚡ *Recharge Queue*\n\nNo pending recharges.`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('⬅️  Back', 'admin'),
      }
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const r of recharges) {
    const label = `${r.productName} — ${fmt.usdt(r.amount)} — ${fmt.date(r.createdAt)}`;
    keyboard.text(label, `admin_recharge_view_${r._id}`).row();
  }
  keyboard.text('⬅️  Back', 'admin');

  await safeEdit(ctx,
    `⚡ *Recharge Queue* (${recharges.length} pending)`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// ── View Single Recharge ──────────────────────────────────
export async function adminRechargeViewHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const rechargeId = ctx.match[1];
  const { getRechargeById } = await import('../../collections/recharges.js');
  const recharge = await getRechargeById(rechargeId);

  if (!recharge) {
    await ctx.answerCallbackQuery({ text: 'Not found.', show_alert: true }).catch(() => { });
    return;
  }

  await safeEdit(ctx,
    `⚡ *Recharge Request*\n\n` +
    `📦 Product: *${recharge.productName}*\n` +
    `🔑 Account: \`${recharge.licenseKey}\`\n` +
    `💰 Amount: *${fmt.usdt(recharge.amount)}*\n` +
    `📅 Requested: ${fmt.date(recharge.createdAt)}\n` +
    `👤 User ID: \`${recharge.telegramId}\``,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('✅  Mark Complete', `admin_recharge_done_${rechargeId}`).row()
        .text('⬅️  Back', 'admin_recharges'),
    }
  );
}

// ── User List (paginated, load more) ─────────────────────
export async function adminUsersHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const skip = Number(ctx.match[1]) || 0;
  const limit = 20;
  const { users, total } = await getUsersPaginated(skip, limit);

  if (!users.length) {
    await safeEdit(ctx, '👥 *Users*\n\nNo users yet.', {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️  Back', 'admin'),
    });
    return;
  }

  // Build keyboard — append to existing if loading more
  const keyboard = new InlineKeyboard();
  for (const u of users) {
    const name = u.username ? `@${u.username}` : u.firstName || `#${u.telegramId}`;
    const label = `${name}  ·  ${fmt.usdt(u.balance)}`;
    keyboard.text(label, `admin_user_${u.telegramId}_0`).row();
  }

  const loaded = skip + users.length;
  if (loaded < total) {
    keyboard.text(`➕  Load More  (${loaded}/${total})`, `admin_users_${loaded}`).row();
  }
  keyboard.text('⬅️  Back', 'admin');

  const headerText = `👥 *Users* (${loaded}/${total})`;

  // First load — edit message. Load more — edit same message to append rows
  await safeEdit(ctx, headerText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// ── User Detail + Transactions ────────────────────────────
export async function adminUserDetailHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const telegramId = Number(ctx.match[1]);
  const txSkip = Number(ctx.match[2]) || 0;
  const txLimit = 10;

  const { getUserByTelegramId } = await import('../../collections/users.js');
  const user = await getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.answerCallbackQuery({ text: 'User not found.', show_alert: true }).catch(() => { });
    return;
  }

  const { txns, total } = await getTransactionsByUserPaginated(telegramId, txSkip, txLimit);
  const typeEmoji = { deposit: '⬆️', purchase: '⬇️', recharge: '⬇️' };

  const name = user.username ? `@${user.username}` : user.firstName || `#${user.telegramId}`;

  let txText = txns.length
    ? txns.map(t =>
      `${typeEmoji[t.type] || '•'} ${t.description}\n` +
      `   ${t.amount > 0 ? '+' : ''}${fmt.usdt(t.amount)}  _${fmt.date(t.createdAt)}_`
    ).join('\n')
    : '_No transactions yet._';

  const loaded = txSkip + txns.length;

  const text =
    `👤 *${name}*\n` +
    `ID: \`${user.telegramId}\`\n` +
    `Joined: ${fmt.date(user.createdAt)}\n\n` +
    `💰 Balance: *${fmt.usdt(user.balance)}*\n` +
    `📈 Deposited: ${fmt.usdt(user.totalDeposited)}\n` +
    `🛒 Spent: ${fmt.usdt(user.totalSpent)}\n\n` +
    `📜 *Transactions* (${loaded}/${total}):\n${txText}`;

  const keyboard = new InlineKeyboard();
  if (loaded < total) {
    keyboard.text(`➕  Load More Transactions`, `admin_user_${telegramId}_${loaded}`).row();
  }
  keyboard.text('⬅️  Back to Users', 'admin_users_0');

  await safeEdit(ctx, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}
// ── Server IP ─────────────────────────────────────────────
export async function adminServerIpHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  const [v4Result, v6Result] = await Promise.allSettled([
    fetch('https://api4.ipify.org?format=json').then(r => r.json()),
    fetch('https://api6.ipify.org?format=json').then(r => r.json()),
  ]);

  const ipv4 = v4Result.status === 'fulfilled' ? v4Result.value.ip : null;
  const ipv6 = v6Result.status === 'fulfilled' ? v6Result.value.ip : null;

  const lines = [
    `🌐 *Server Public IP*\n`,
    ipv4 ? `*IPv4:*\n\`${ipv4}\`` : `*IPv4:* _unavailable_`,
    ipv6 ? `*IPv6:*\n\`${ipv6}\`` : `*IPv6:* _unavailable_`,
    `\n_Tap an address to copy, then whitelist it in NowPayments._`,
  ].join('\n');

  await safeEdit(ctx, lines, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('⬅️  Back', 'admin'),
  });
}

// ── Main Balance (NowPayments) ────────────────────────────
export async function adminBalanceHandler(ctx) {
  await ctx.answerCallbackQuery().catch(() => { });

  let text;
  try {
    const data = await getBalance();
    // data.currencies is an object keyed by currency code
    const currencies = data.currencies ?? data;
    const lines = Object.entries(currencies)
      .map(([cur, info]) => `• \`${cur.toUpperCase()}\`: *${info.amount}*`)
      .join('\n');
    text = `💰 *NowPayments Main Balance*\n\n${lines || '_No balances found._'}`;
  } catch (err) {
    text = `❌ Failed to fetch balance: ${err.message}`;
  }

  await safeEdit(ctx, text, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard()
      .text('🔄  Refresh', 'admin_balance').row()
      .text('⬅️  Back', 'admin'),
  });
}

export async function adminRechargeCompleteHandler(ctx) {
  await ctx.answerCallbackQuery({ text: 'Marking complete...' }).catch(() => { });

  const rechargeId = ctx.match[1];
  const recharge = await completeRecharge(rechargeId);

  if (!recharge) {
    await ctx.answerCallbackQuery({ text: 'Already completed or not found.', show_alert: true }).catch(() => { });
    return;
  }

  await ctx.editMessageText(
    ctx.callbackQuery.message.text + '\n\n✅ *Completed!*',
    { parse_mode: 'Markdown' }
  ).catch(() => { });

  await ctx.api.sendMessage(
    recharge.telegramId,
    `✅ *Your Account Has Been Recharged!*\n\n` +
    `📦 Product: *${recharge.productName}*\n` +
    `💰 Amount: *${fmt.usdt(recharge.amount)}*\n\n` +
    `You're all set! Enjoy.`,
    { parse_mode: 'Markdown' }
  ).catch(e => console.error('[RECHARGE] Buyer notify failed:', e.message));
}