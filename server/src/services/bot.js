const TelegramBot = require('node-telegram-bot-api');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Message = require('../models/Message');
const Wallet = require('../models/Wallet');
const { generateOrderNumber, formatPrice } = require('../utils/helpers');
const { createStripeCheckoutSession, generateCryptoPaymentInfo } = require('./paymentService');
const { chatWithAI, adminAICompose } = require('./aiService');

let bot = null;
const userStates = new Map();

function getBot() { return bot; }

const STORE_CATEGORIES = [
  { key: 'bank_log', label: '🏦 Bank Log', emoji: '🏦' },
  { key: 'digital_goods', label: '💎 Digital Goods', emoji: '💎' },
  { key: 'bank_opening', label: '🔓 Bank Opening', emoji: '🔓' },
  { key: 'tools', label: '🛠 Tools', emoji: '🛠' },
];

// ─── Admin detection ─────────────────────────────────────
const ADMIN_USERNAMES = ['gs7geup', 'gscf_support'];

function getAdminIds() {
  return (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean);
}

function isAdminUser(from) {
  return getAdminIds().includes(from.id) || ADMIN_USERNAMES.includes((from.username || '').toLowerCase());
}

// ─── State management ────────────────────────────────────
function setState(userId, state) { userStates.set(userId, state); }
function getState(userId) { return userStates.get(userId) || null; }
function clearState(userId) { userStates.delete(userId); }

// ─── Bot init ────────────────────────────────────────────
function initBot() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === 'placeholder_get_from_botfather') {
    console.warn('BOT_TOKEN not configured — bot disabled. Dashboard still works.');
    return null;
  }

  const webhookUrl = process.env.WEBHOOK_URL || '';
  const isWebhook = process.env.NODE_ENV === 'production' && webhookUrl.startsWith('https://');

  if (isWebhook) {
    bot = new TelegramBot(token, { webHook: { port: false } });
    bot.setWebHook(`${webhookUrl}/api/bot/webhook`).then(() => {
      console.log(`Webhook set: ${webhookUrl}/api/bot/webhook`);
    }).catch(err => console.error('Webhook error:', err.message));
  } else {
    bot = new TelegramBot(token, {
      polling: { interval: 1000, autoStart: true, params: { timeout: 30 } },
    });
    console.log('Bot started in polling mode');
  }

  bot.on('polling_error', err => {
    if (err.code !== 'EFATAL') console.error('Polling error:', err.code, err.message);
  });

  bot.on('error', err => console.error('Bot error:', err.message));

  setupCommands();
  registerHandlers();
  startBroadcastScheduler();
  return bot;
}

async function setupCommands() {
  try {
    await bot.setMyCommands([
      { command: 'start', description: 'Open GSCF Store' },
      { command: 'shop', description: 'Browse products' },
      { command: 'cart', description: 'View cart' },
      { command: 'orders', description: 'My orders' },
      { command: 'sell', description: 'Become a seller' },
    ]);
  } catch (e) { console.error('setMyCommands error:', e.message); }
}

// ─── User helpers ────────────────────────────────────────
async function getOrCreateUser(from) {
  let user = await User.findOne({ telegramId: from.id });
  if (!user) {
    user = await User.create({
      telegramId: from.id,
      username: from.username || '',
      firstName: from.first_name || '',
      lastName: from.last_name || '',
    });
  } else {
    user.username = from.username || user.username;
    user.firstName = from.first_name || user.firstName;
    await user.save();
  }
  return user;
}

// ─── Wallet helper ──────────────────────────────────────
async function getOrCreateWallet(telegramId) {
  let wallet = await Wallet.findOne({ telegramId });
  if (!wallet) {
    wallet = await Wallet.create({
      telegramId,
      depositAddress: Wallet.generateDepositAddress(),
    });
  }
  return wallet;
}

// ─── Keyboard builders ──────────────────────────────────
function mainMenuKeyboard(isAdmin = false, balance = 0) {
  const rows = [
    [{ text: '🛍 Shop', callback_data: 'menu_shop' }, { text: '🛒 Cart', callback_data: 'menu_cart' }],
    [{ text: `💰 Wallet ($${balance.toFixed(2)})`, callback_data: 'menu_wallet' }],
    [{ text: '📦 My Orders', callback_data: 'menu_orders' }, { text: '💬 Messages', callback_data: 'menu_messages' }],
    [{ text: '🤖 Ask GSCF AI', callback_data: 'menu_ai' }],
    [{ text: '🏪 Become a Seller', callback_data: 'menu_sell' }, { text: '❓ Help', callback_data: 'menu_help' }],
  ];
  if (isAdmin) {
    rows.push([{ text: '⚙️ Admin Panel', callback_data: 'menu_admin' }, { text: '📢 Broadcast', callback_data: 'admin_broadcast' }]);
  }
  return { inline_keyboard: rows };
}

function backButton(target = 'menu_main') {
  return [[{ text: '← Back', callback_data: target }]];
}

function shopCategoryKeyboard() {
  const rows = STORE_CATEGORIES.map(cat => [
    { text: cat.label, callback_data: `cat_${cat.key}` },
  ]);
  rows.push([{ text: '🔥 All Products', callback_data: 'cat_all' }]);
  rows.push([{ text: '🔍 Search', callback_data: 'search_start' }]);
  rows.push(...backButton());
  return { inline_keyboard: rows };
}

function productKeyboard(productId, page = 0) {
  return {
    inline_keyboard: [
      [
        { text: '🛒 Add to Cart', callback_data: `add_${productId}` },
        { text: '💬 Ask Seller', callback_data: `ask_${productId}` },
      ],
      [
        { text: '⭐ Details', callback_data: `detail_${productId}` },
      ],
      [{ text: '← Back to Shop', callback_data: 'menu_shop' }],
    ],
  };
}

function cartKeyboard(hasItems, balance = 0) {
  if (!hasItems) {
    return { inline_keyboard: [[{ text: '🛍 Go Shopping', callback_data: 'menu_shop' }], ...backButton()] };
  }
  return {
    inline_keyboard: [
      [{ text: `💰 Pay from Wallet ($${balance.toFixed(2)})`, callback_data: 'checkout_wallet' }],
      [
        { text: '💳 Card', callback_data: 'checkout_stripe' },
        { text: '₿ Crypto', callback_data: 'checkout_crypto' },
      ],
      [{ text: '🗑 Clear Cart', callback_data: 'clear_cart' }],
      [{ text: '← Back', callback_data: 'menu_main' }],
    ],
  };
}

// ─── Register handlers ──────────────────────────────────
function registerHandlers() {
  bot.onText(/\/start/, msg => handleMainMenu(msg.chat.id, msg.from));
  bot.onText(/\/shop/, msg => handleShop(msg.chat.id, msg.from));
  bot.onText(/\/cart/, msg => handleCart(msg.chat.id, msg.from));
  bot.onText(/\/orders/, msg => handleOrders(msg.chat.id, msg.from));
  bot.onText(/\/sell/, msg => handleSellMenu(msg.chat.id, msg.from));

  bot.on('callback_query', handleCallback);

  bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    const state = getState(msg.from.id);
    if (!state) return;

    // Handle photo uploads for product image step
    if (state.action === 'prod_image' && msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      setState(msg.from.id, { ...state, action: 'prod_delivery', prodImage: fileId });
      bot.sendMessage(msg.chat.id, '✅ Photo received!\n\n📤 Step 6/6: Delivery content\n\nSend the download link, license key, or type "manual" if you\'ll deliver it yourself:');
      return;
    }

    if (state.action === 'prod_image' && !msg.photo) {
      bot.sendMessage(msg.chat.id, '⚠️ Please send a *photo* (not a file or text). This is required as proof for your product.', { parse_mode: 'Markdown' });
      return;
    }

    // Handle photo uploads for scheduled broadcast
    if (state.action === 'sched_broadcast_msg' && msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      setState(msg.from.id, { ...state, broadcastPhoto: photo.file_id, broadcastText: msg.caption || '' });
      await handleScheduleTime(msg.chat.id, msg.from);
      return;
    }

    await handleStatefulMessage(msg, state);
  });
}

// ─── Main Menu ──────────────────────────────────────────
async function handleMainMenu(chatId, from) {
  await getOrCreateUser(from);
  const wallet = await getOrCreateWallet(from.id);
  clearState(from.id);

  const text = `⚡ *GSCF Store*\n\nWelcome, *${from.first_name || 'friend'}*!\n💰 Wallet Balance: *$${wallet.balance.toFixed(2)}*\n\nYour trusted marketplace for premium digital tools.`;

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard(isAdminUser(from), wallet.balance),
  });
}

// ─── Shop ───────────────────────────────────────────────
async function handleShop(chatId, from) {
  await getOrCreateUser(from);
  const activeCount = await Product.countDocuments({ status: 'active', stock: { $ne: 0 } });

  bot.sendMessage(chatId, `🛍 *GSCF Store*\n\n📦 *${activeCount}* products available\n\nChoose a category:`, {
    parse_mode: 'Markdown',
    reply_markup: shopCategoryKeyboard(),
  });
}

async function showProducts(chatId, category, page = 0) {
  const query = category === 'all'
    ? { status: 'active', stock: { $ne: 0 } }
    : { status: 'active', category, stock: { $ne: 0 } };
  const perPage = 5;
  const total = await Product.countDocuments(query);
  const products = await Product.find(query).sort({ createdAt: -1 }).skip(page * perPage).limit(perPage);

  if (products.length === 0) {
    return bot.sendMessage(chatId, '📭 No products found in this category.', {
      reply_markup: { inline_keyboard: [[{ text: '← Back to Shop', callback_data: 'menu_shop' }]] },
    });
  }

  for (const p of products) {
    const stockText = p.stock === -1 ? '✅ In Stock' : p.stock > 0 ? `📦 ${p.stock} left` : '❌ Sold Out';
    const stars = p.rating > 0 ? '⭐'.repeat(Math.round(p.rating)) : '';
    const text = `*${p.name}*\n\n${p.description}\n\n💰 *${formatPrice(p.price)}*  │  ${stockText}${stars ? `\n${stars} (${p.reviewCount} reviews)` : ''}`;

    const opts = { parse_mode: 'Markdown', reply_markup: productKeyboard(p._id) };
    if (p.image) {
      try { await bot.sendPhoto(chatId, p.image, { caption: text, ...opts }); continue; } catch {}
    }
    await bot.sendMessage(chatId, text, opts);
  }

  if (total > (page + 1) * perPage) {
    const nextPage = page + 1;
    bot.sendMessage(chatId, `Showing ${page * perPage + 1}-${Math.min((page + 1) * perPage, total)} of ${total}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: `Load More (${total - (page + 1) * perPage} remaining)`, callback_data: `page_${category}_${nextPage}` }],
          [{ text: '← Back to Shop', callback_data: 'menu_shop' }],
        ],
      },
    });
  }
}

// ─── Cart ───────────────────────────────────────────────
async function handleCart(chatId, from) {
  const user = await getOrCreateUser(from);
  const wallet = await getOrCreateWallet(from.id);
  if (!user.cart || user.cart.length === 0) {
    return bot.sendMessage(chatId, '🛒 *Your cart is empty*\n\nBrowse the shop to add items!', {
      parse_mode: 'Markdown',
      reply_markup: cartKeyboard(false, wallet.balance),
    });
  }

  await user.populate('cart.product');
  let total = 0;
  let text = '🛒 *Your Cart*\n\n';
  const removeButtons = [];

  for (const item of user.cart) {
    if (!item.product) continue;
    const sub = item.product.price * item.quantity;
    total += sub;
    text += `• *${item.product.name}* × ${item.quantity}  —  ${formatPrice(sub)}\n`;
    removeButtons.push([{ text: `✕ Remove ${item.product.name}`, callback_data: `rmcart_${item.product._id}` }]);
  }
  const canAfford = wallet.balance >= total;
  text += `\n━━━━━━━━━━━━━━━━\n💰 *Total: ${formatPrice(total)}*\n💵 Wallet: *$${wallet.balance.toFixed(2)}*${!canAfford ? '\n⚠️ _Insufficient balance — top up your wallet_' : ''}`;

  const keyboard = [
    ...removeButtons,
    [{ text: `${canAfford ? '✅' : '⚠️'} Pay from Wallet ($${wallet.balance.toFixed(2)})`, callback_data: 'checkout_wallet' }],
    [{ text: '💳 Top Up Wallet', callback_data: 'wallet_topup' }],
    [{ text: '🗑 Clear Cart', callback_data: 'clear_cart' }],
    [{ text: '← Back', callback_data: 'menu_main' }],
  ];

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

// ─── Orders ─────────────────────────────────────────────
async function handleOrders(chatId, from) {
  const user = await getOrCreateUser(from);
  const orders = await Order.find({ telegramUserId: user.telegramId }).sort({ createdAt: -1 }).limit(10);

  if (orders.length === 0) {
    return bot.sendMessage(chatId, '📦 *No orders yet*\n\nStart shopping to see your orders here!', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🛍 Go Shopping', callback_data: 'menu_shop' }], ...backButton()] },
    });
  }

  const emoji = { pending: '⏳', paid: '✅', delivered: '📬', cancelled: '❌', refunded: '💸' };
  let text = '📦 *Your Orders*\n\n';
  const buttons = [];

  for (const o of orders) {
    const items = o.items.map(i => i.productName).join(', ');
    text += `${emoji[o.status] || '•'} \`${o.orderNumber}\`\n   ${items}\n   *${formatPrice(o.totalAmount)}* — ${o.status}\n\n`;
    if (o.status === 'delivered') {
      buttons.push([{ text: `📋 ${o.orderNumber} Details`, callback_data: `orderdetail_${o._id}` }]);
    }
  }

  buttons.push(...backButton());
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

// ─── Seller Menu ────────────────────────────────────────
async function handleSellMenu(chatId, from) {
  const existing = await Seller.findOne({ telegramId: from.id });
  if (existing) {
    if (existing.status === 'pending') {
      return bot.sendMessage(chatId, '⏳ *Application Pending*\n\nYour seller application is being reviewed.\nYou\'ll be notified once approved.', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: backButton() },
      });
    }
    if (existing.status === 'approved') {
      return showSellerDashboard(chatId, existing);
    }
    if (existing.status === 'suspended') {
      return bot.sendMessage(chatId, '🚫 Your seller account has been suspended. Contact admin for details.', {
        reply_markup: { inline_keyboard: backButton() },
      });
    }
  }

  bot.sendMessage(chatId, `🏪 *Become a GSCF Seller*\n\nJoin our marketplace and sell your digital products to thousands of buyers.\n\n✅ Easy product listing\n✅ Secure payments\n✅ Built-in buyer messaging\n✅ Sales analytics\n\nReady to start?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Apply Now', callback_data: 'seller_apply' }],
        ...backButton(),
      ],
    },
  });
}

async function showSellerDashboard(chatId, seller) {
  const productCount = await Product.countDocuments({ sellerTelegramId: seller.telegramId, status: { $ne: 'inactive' } });
  const unreadMsgs = await Message.countDocuments({ receiverTelegramId: seller.telegramId, read: false });

  const text = `🏪 *Seller Dashboard*\n\n📊 Store: *${seller.storeName}*\n📦 Products: *${productCount}*\n💰 Revenue: *${formatPrice(seller.totalRevenue)}*\n🛒 Sales: *${seller.totalSales}*\n💬 Unread Messages: *${unreadMsgs}*`;

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Add Product', callback_data: 'seller_addprod' }, { text: '📦 My Products', callback_data: 'seller_products' }],
        [{ text: '📊 Sales', callback_data: 'seller_sales' }, { text: '💬 Messages', callback_data: 'seller_messages' }],
        ...backButton(),
      ],
    },
  });
}

// ─── Messages Menu ──────────────────────────────────────
async function handleMessages(chatId, from) {
  const conversations = await Message.aggregate([
    { $match: { $or: [{ senderTelegramId: from.id }, { receiverTelegramId: from.id }] } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$conversationId', lastMsg: { $first: '$$ROOT' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$receiverTelegramId', from.id] }, { $eq: ['$read', false] }] }, 1, 0] } } } },
    { $sort: { 'lastMsg.createdAt': -1 } },
    { $limit: 10 },
  ]);

  if (conversations.length === 0) {
    return bot.sendMessage(chatId, '💬 *No messages yet*\n\nYour conversations with buyers and sellers will appear here.', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: backButton() },
    });
  }

  let text = '💬 *Your Messages*\n\n';
  const buttons = [];

  for (const c of conversations) {
    const unreadBadge = c.unread > 0 ? ` (${c.unread} new)` : '';
    const preview = c.lastMsg.text.slice(0, 40) + (c.lastMsg.text.length > 40 ? '...' : '');
    const otherParty = c.lastMsg.senderTelegramId === from.id ? c.lastMsg.receiverTelegramId : c.lastMsg.senderTelegramId;
    const otherUser = await User.findOne({ telegramId: otherParty });
    const name = otherUser ? (otherUser.username ? `@${otherUser.username}` : otherUser.firstName) : `User ${otherParty}`;
    text += `${c.unread > 0 ? '🔴' : '💬'} *${name}*${unreadBadge}\n   _${preview}_\n\n`;
    buttons.push([{ text: `${c.unread > 0 ? '🔴 ' : ''}${name}`, callback_data: `conv_${c._id}` }]);
  }

  buttons.push(...backButton());
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

// ─── Help ───────────────────────────────────────────────
function handleHelp(chatId, from) {
  let text = `❓ *GSCF Store — Help*\n\n🛍 *Shopping* — Browse products, add to cart, checkout\n📦 *Orders* — Track your purchases\n💬 *Messages* — Chat with sellers\n🤖 *AI Assistant* — Ask questions, find products, make requests\n🏪 *Sell* — Apply to become a seller\n\n_All navigation is through buttons — just tap!_`;

  if (isAdminUser(from)) {
    text += `\n\n⚙️ *Admin*\nAdmin Panel + Broadcast from the main menu.`;
  }

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: backButton() },
  });
}

// ─── Wallet ─────────────────────────────────────────────
async function handleWallet(chatId, from) {
  const wallet = await getOrCreateWallet(from.id);

  const text = `💰 *Your GSCF Wallet*\n\n💵 Balance: *$${wallet.balance.toFixed(2)}*\n\n📊 *Stats:*\n├ Total Deposited: $${wallet.totalDeposited.toFixed(2)}\n├ Total Spent: $${wallet.totalSpent.toFixed(2)}\n└ Total Earned: $${wallet.totalEarned.toFixed(2)}\n\n🔗 Your Deposit ID:\n\`${wallet.depositAddress}\`\n\n_Top up your wallet to make purchases instantly._`;

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Top Up Wallet', callback_data: 'wallet_topup' }],
        [{ text: '📜 Transaction History', callback_data: 'wallet_history' }],
        ...backButton(),
      ],
    },
  });
}

async function handleTopUp(chatId, from) {
  const wallet = await getOrCreateWallet(from.id);
  const storeWallet = process.env.CRYPTO_WALLET_ADDRESS || 'NOT_CONFIGURED';

  const text = `💳 *Top Up Your Wallet*\n\nSend crypto to the address below. Your balance will be credited once confirmed by admin.\n\n*BTC Wallet:*\n\`${storeWallet}\`\n\n*Your Deposit Reference:*\n\`${wallet.depositAddress}\`\n\n⚠️ *IMPORTANT:* Include your deposit reference (\`${wallet.depositAddress}\`) in the transaction memo/note so we can identify your payment.\n\n_After sending, tap "I've Sent Payment" and an admin will verify and credit your wallet._`;

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ I\'ve Sent Payment', callback_data: `topup_sent_${from.id}` }],
        ...backButton('menu_wallet'),
      ],
    },
  });
}

async function handleWalletHistory(chatId, from) {
  const wallet = await getOrCreateWallet(from.id);
  const recent = (wallet.transactions || []).slice(-10).reverse();

  if (!recent.length) {
    return bot.sendMessage(chatId, '📜 *No transactions yet*\n\nTop up your wallet to get started!', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '💳 Top Up', callback_data: 'wallet_topup' }], ...backButton('menu_wallet')] },
    });
  }

  const icons = { deposit: '💚', purchase: '🔴', sale_credit: '💰', commission: '🏪', refund: '↩️', withdrawal: '📤' };
  let text = '📜 *Recent Transactions*\n\n';
  for (const tx of recent) {
    const icon = icons[tx.type] || '•';
    const sign = tx.amount >= 0 ? '+' : '';
    text += `${icon} ${sign}$${Math.abs(tx.amount).toFixed(2)} — ${tx.description}\n   _${new Date(tx.createdAt).toLocaleDateString()}_  │  Bal: $${tx.balanceAfter.toFixed(2)}\n\n`;
  }

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_wallet') } });
}

// ─── AI Assistant ───────────────────────────────────────
async function handleAI(chatId, from) {
  bot.sendMessage(chatId, `🤖 *GSCF AI Assistant*\n\nI can help you with:\n\n🔍 Find products by describing what you need\n💡 Answer questions about our store\n📝 Submit product requests to our team\n📂 Navigate categories and deals\n\nWhat would you like to do?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔍 Browse Products', callback_data: 'ai_browse' }],
        [{ text: '💬 Ask a Question', callback_data: 'ai_ask' }],
        [{ text: '📝 Request a Product', callback_data: 'ai_request' }],
        ...backButton(),
      ],
    },
  });
}

async function handleAIChat(chatId, from, userText) {
  const products = await Product.find({ status: 'active', stock: { $ne: 0 } });

  bot.sendChatAction(chatId, 'typing');

  const aiResponse = await chatWithAI(userText, products);

  if (aiResponse) {
    const query = userText.toLowerCase();
    const matched = products.filter(p =>
      p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.category.toLowerCase().includes(query)
    ).slice(0, 3);

    const btns = matched.map(p => [{ text: `🛒 ${p.name} — ${formatPrice(p.price)}`, callback_data: `detail_${p._id}` }]);
    btns.push([{ text: '💬 Ask More', callback_data: 'ai_ask' }, { text: '📝 Request Product', callback_data: 'ai_request' }]);
    btns.push(...backButton('menu_ai'));

    return bot.sendMessage(chatId, `🤖 ${aiResponse}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: btns },
    });
  }

  const query = userText.toLowerCase();
  const matched = products.filter(p =>
    p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.category.toLowerCase().includes(query)
  );

  if (matched.length > 0) {
    let text = `🤖 I found *${matched.length}* product${matched.length > 1 ? 's' : ''}:\n\n`;
    const btns = [];
    for (const p of matched.slice(0, 5)) {
      text += `• *${p.name}* — ${formatPrice(p.price)}\n`;
      btns.push([{ text: `🛒 ${p.name}`, callback_data: `detail_${p._id}` }]);
    }
    btns.push([{ text: '💬 Ask More', callback_data: 'ai_ask' }]);
    btns.push(...backButton('menu_ai'));
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } });
  }

  let response = `🤖 I couldn't find "${userText}" in our catalog.\n\n📂 *Our Categories:*\n`;
  for (const cat of STORE_CATEGORIES) {
    const count = products.filter(p => p.category === cat.key).length;
    response += `${cat.emoji} ${cat.label} — ${count} products\n`;
  }
  response += `\n📦 *Total: ${products.length} products available*`;

  bot.sendMessage(chatId, response, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛍 Browse Shop', callback_data: 'menu_shop' }],
        [{ text: '📝 Request This Product', callback_data: 'ai_request' }],
        [{ text: '💬 Ask Again', callback_data: 'ai_ask' }],
        ...backButton('menu_ai'),
      ],
    },
  });
}

async function handleProductRequest(chatId, from, requestText) {
  clearState(from.id);
  const user = await getOrCreateUser(from);

  bot.sendMessage(chatId, `✅ *Request Submitted!*\n\nWe've received your request:\n_"${requestText}"_\n\nOur team will review it and may add it to our catalog. You'll be notified if it becomes available!`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '🛍 Browse Shop', callback_data: 'menu_shop' }], ...backButton()] },
  });

  notifyAdmins(`📝 *Product Request*\n\nFrom: @${from.username || from.first_name || 'Anonymous'} (ID: ${from.id})\n\nRequest:\n_"${requestText}"_`, []);
}

// ─── Broadcast System ───────────────────────────────────
const Broadcast = require('../models/Broadcast');

async function handleBroadcastStart(chatId, from) {
  if (!isAdminUser(from)) return;

  const scheduled = await Broadcast.find({ status: 'scheduled' }).sort({ scheduledAt: 1 }).limit(5);
  let scheduledText = '';
  if (scheduled.length) {
    scheduledText = '\n\n📅 *Upcoming Broadcasts:*\n';
    for (const b of scheduled) {
      const time = new Date(b.scheduledAt).toLocaleString();
      const repeat = b.repeat !== 'none' ? ` 🔁 ${b.repeat}` : '';
      const ends = b.endsAt ? ` → ends ${new Date(b.endsAt).toLocaleDateString()}` : b.repeat !== 'none' ? ' → forever' : '';
      scheduledText += `• ${b.text?.slice(0, 30) || '[photo]'}...${repeat}${ends}\n  _${time}_\n`;
    }
  }

  bot.sendMessage(chatId, `📢 *Broadcast Center*${scheduledText}`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📨 Send Now', callback_data: 'bc_send_now' }],
        [{ text: '🤖 AI Compose & Send', callback_data: 'bc_ai_compose' }],
        [{ text: '⏰ Schedule', callback_data: 'bc_schedule' }, { text: '🤖 AI Schedule', callback_data: 'bc_ai_schedule' }],
        [{ text: '🔁 Recurring (1 Month)', callback_data: 'bc_recur_month' }, { text: '♾ Recurring (Forever)', callback_data: 'bc_recur_forever' }],
        ...(scheduled.length ? [[{ text: '🗑 Cancel Scheduled', callback_data: 'bc_cancel_list' }]] : []),
        ...backButton('menu_admin'),
      ],
    },
  });
}

async function executeBroadcast(chatId, from, messageText, photo = null) {
  clearState(from.id);
  if (!isAdminUser(from)) return;

  const users = await User.find({}, 'telegramId');
  let sent = 0;
  let failed = 0;

  bot.sendMessage(chatId, `📢 Broadcasting to ${users.length} users...`);

  const broadcastText = `📢 *GSCF Store*\n\n${messageText}\n\n━━━━━━━━━━━━━━━━\n_Tap below to visit the store:_`;
  const markup = { inline_keyboard: [[{ text: '🛍 Open Store', callback_data: 'menu_main' }]] };

  for (const user of users) {
    try {
      if (photo) {
        await bot.sendPhoto(user.telegramId, photo, { caption: broadcastText, parse_mode: 'Markdown', reply_markup: markup });
      } else {
        await bot.sendMessage(user.telegramId, broadcastText, { parse_mode: 'Markdown', reply_markup: markup });
      }
      sent++;
      if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
    } catch { failed++; }
  }

  bot.sendMessage(chatId, `✅ *Broadcast Complete*\n\n📨 Sent: *${sent}*\n❌ Failed: *${failed}*\n👥 Total: *${users.length}*`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_admin') },
  });
}

async function executeBroadcastById(broadcastId) {
  const bc = await Broadcast.findById(broadcastId);
  if (!bc || bc.status !== 'scheduled') return;

  const users = await User.find({}, 'telegramId');
  let sent = 0, failed = 0;

  const broadcastText = `📢 *GSCF Store*\n\n${bc.text}\n\n━━━━━━━━━━━━━━━━\n_Tap below to visit the store:_`;
  const markup = { inline_keyboard: [[{ text: '🛍 Open Store', callback_data: 'menu_main' }]] };

  for (const user of users) {
    try {
      if (bc.photo) {
        await bot.sendPhoto(user.telegramId, bc.photo, { caption: broadcastText, parse_mode: 'Markdown', reply_markup: markup });
      } else {
        await bot.sendMessage(user.telegramId, broadcastText, { parse_mode: 'Markdown', reply_markup: markup });
      }
      sent++;
      if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
    } catch { failed++; }
  }

  bc.status = 'sent';
  bc.sentCount = sent;
  bc.failedCount = failed;
  await bc.save();

  const intervals = { daily: 86400000, every_3_days: 259200000, weekly: 604800000 };
  if (bc.repeat !== 'none' && intervals[bc.repeat]) {
    const nextDate = new Date(bc.scheduledAt.getTime() + intervals[bc.repeat]);
    if (!bc.endsAt || nextDate <= bc.endsAt) {
      await Broadcast.create({ text: bc.text, photo: bc.photo, scheduledAt: nextDate, endsAt: bc.endsAt, repeat: bc.repeat, createdBy: bc.createdBy });
    }
  }

  const adminIds = getAdminIds();
  for (const id of adminIds) {
    try { bot.sendMessage(id, `✅ *Scheduled Broadcast Sent*\n\n📨 ${sent} sent | ❌ ${failed} failed`, { parse_mode: 'Markdown' }); } catch {}
  }
}

async function handleScheduleTime(chatId, from) {
  bot.sendMessage(chatId, '⏰ *When should this first go out?*', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '1h', callback_data: 'bc_time_1h' }, { text: '3h', callback_data: 'bc_time_3h' }, { text: '6h', callback_data: 'bc_time_6h' }],
        [{ text: '12h', callback_data: 'bc_time_12h' }, { text: '24h', callback_data: 'bc_time_24h' }, { text: '48h', callback_data: 'bc_time_48h' }],
        [{ text: '3 days', callback_data: 'bc_time_72h' }, { text: '1 week', callback_data: 'bc_time_168h' }],
        ...backButton('admin_broadcast'),
      ],
    },
  });
}

function startBroadcastScheduler() {
  setInterval(async () => {
    try {
      const due = await Broadcast.find({ status: 'scheduled', scheduledAt: { $lte: new Date() } });
      for (const bc of due) {
        await executeBroadcastById(bc._id);
      }
    } catch (err) { console.error('Broadcast scheduler error:', err.message); }
  }, 60000);
}

// ─── Callback handler ───────────────────────────────────
async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const from = query.from;
  const data = query.data;

  try {
    // Navigation
    if (data === 'menu_main') { await handleMainMenu(chatId, from); return ack(query); }
    if (data === 'menu_shop') { await handleShop(chatId, from); return ack(query); }
    if (data === 'menu_cart') { await handleCart(chatId, from); return ack(query); }
    if (data === 'menu_orders') { await handleOrders(chatId, from); return ack(query); }
    if (data === 'menu_sell') { await handleSellMenu(chatId, from); return ack(query); }
    if (data === 'menu_messages') { await handleMessages(chatId, from); return ack(query); }
    if (data === 'menu_wallet') { await handleWallet(chatId, from); return ack(query); }
    if (data === 'menu_help') { handleHelp(chatId, from); return ack(query); }
    if (data === 'menu_ai') { await handleAI(chatId, from); return ack(query); }
    if (data === 'menu_admin') { await handleAdminPanel(chatId, from); return ack(query); }
    if (data === 'wallet_topup') { await handleTopUp(chatId, from); return ack(query); }
    if (data === 'wallet_history') { await handleWalletHistory(chatId, from); return ack(query); }
    if (data.startsWith('admin_addbal_')) { setState(from.id, { action: 'admin_addbal', targetTgId: parseInt(data.slice(13)) }); bot.sendMessage(chatId, '💰 Enter amount to add to this user\'s wallet:'); return ack(query); }
    if (data === 'admin_broadcast') { await handleBroadcastStart(chatId, from); return ack(query); }
    if (data === 'bc_send_now') { if (!isAdminUser(from)) return ack(query); setState(from.id, { action: 'broadcast_msg' }); bot.sendMessage(chatId, '📨 *Send Now*\n\nType the broadcast message (or send a photo with caption):', { parse_mode: 'Markdown' }); return ack(query); }
    if (data === 'bc_ai_compose') {
      if (!isAdminUser(from)) return ack(query);
      setState(from.id, { action: 'ai_compose_broadcast' });
      bot.sendMessage(chatId, '🤖 *AI Broadcast Composer*\n\nDescribe what kind of broadcast you want. Examples:\n\n• _"promote our new bank logs"_\n• _"announce a 20% sale on all tools"_\n• _"welcome message for new users"_\n• _"remind users about our digital goods"_\n\nType your instruction:', { parse_mode: 'Markdown' });
      return ack(query);
    }
    if (data === 'bc_ai_schedule') {
      if (!isAdminUser(from)) return ack(query);
      setState(from.id, { action: 'ai_schedule_broadcast' });
      bot.sendMessage(chatId, '🤖 *AI Scheduled Broadcast*\n\nDescribe the broadcast and I\'ll compose it, then you pick the schedule.\n\nExample: _"daily promo about our tools category"_\n\nType your instruction:', { parse_mode: 'Markdown' });
      return ack(query);
    }
    if (data === 'bc_schedule') { if (!isAdminUser(from)) return ack(query); setState(from.id, { action: 'sched_broadcast_msg' }); bot.sendMessage(chatId, '⏰ *Schedule Broadcast*\n\nType the message (or send a photo with caption):', { parse_mode: 'Markdown' }); return ack(query); }
    if (data === 'bc_recur_month') { if (!isAdminUser(from)) return ack(query); setState(from.id, { action: 'recur_broadcast_msg', endsAt: new Date(Date.now() + 30 * 86400000) }); bot.sendMessage(chatId, '🔁 *Recurring (1 Month)*\n\nType the message. This will repeat for 30 days then stop:', { parse_mode: 'Markdown' }); return ack(query); }
    if (data === 'bc_recur_forever') { if (!isAdminUser(from)) return ack(query); setState(from.id, { action: 'recur_broadcast_msg', endsAt: null }); bot.sendMessage(chatId, '♾ *Recurring (Forever)*\n\nType the message. This will repeat indefinitely until cancelled:', { parse_mode: 'Markdown' }); return ack(query); }
    if (data === 'bc_pick_time') {
      await handleScheduleTime(chatId, from);
      return ack(query);
    }
    if (data === 'bc_confirm_send') {
      const st = getState(from.id);
      if (!st || !isAdminUser(from)) return ack(query);
      await executeBroadcast(chatId, from, st.broadcastText || '', st.broadcastPhoto || null);
      return ack(query);
    }
    if (data === 'bc_edit_ai') {
      const st = getState(from.id);
      if (!st) return ack(query);
      setState(from.id, { ...st, action: st.wasSchedule ? 'ai_schedule_broadcast' : 'ai_compose_broadcast' });
      bot.sendMessage(chatId, '🤖 Give me a new instruction or adjustment:', { parse_mode: 'Markdown' });
      return ack(query);
    }
    if (data.startsWith('bc_time_')) {
      const st = getState(from.id);
      if (!st || !isAdminUser(from)) return ack(query);
      const hours = { '1h': 1, '3h': 3, '6h': 6, '12h': 12, '24h': 24, '48h': 48, '72h': 72, '168h': 168 };
      const h = hours[data.slice(8)] || 1;
      const scheduledAt = new Date(Date.now() + h * 3600000);
      const repeat = st.repeat || 'none';
      const endsAt = st.endsAt || null;
      await Broadcast.create({ text: st.broadcastText || '', photo: st.broadcastPhoto || null, scheduledAt, endsAt, repeat, createdBy: from.id });
      clearState(from.id);
      bot.sendMessage(chatId, `✅ *Broadcast Scheduled!*\n\n⏰ Will send in *${h} hours*\n🔁 Repeat: *${repeat}*\n📨 To all users`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('admin_broadcast') } });
      return ack(query);
    }
    if (data === 'bc_cancel_list') {
      const scheduled = await Broadcast.find({ status: 'scheduled' }).sort({ scheduledAt: 1 }).limit(10);
      const btns = scheduled.map(b => [{ text: `🗑 ${b.text?.slice(0, 25) || '[photo]'} — ${new Date(b.scheduledAt).toLocaleString()}`, callback_data: `bc_del_${b._id}` }]);
      btns.push(...backButton('admin_broadcast'));
      bot.sendMessage(chatId, '🗑 *Cancel a Scheduled Broadcast:*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } });
      return ack(query);
    }
    if (data.startsWith('bc_del_')) {
      await Broadcast.findByIdAndUpdate(data.slice(7), { status: 'cancelled' });
      bot.sendMessage(chatId, '✅ Broadcast cancelled.', { reply_markup: { inline_keyboard: backButton('admin_broadcast') } });
      return ack(query);
    }
    if (data === 'recur_daily' || data === 'recur_weekly' || data === 'recur_3days') {
      const st = getState(from.id);
      if (!st) return ack(query);
      const repeatMap = { recur_daily: 'daily', recur_weekly: 'weekly', recur_3days: 'every_3_days' };
      setState(from.id, { ...st, repeat: repeatMap[data] });
      await handleScheduleTime(chatId, from);
      return ack(query);
    }
    if (data === 'ai_browse') { await handleShop(chatId, from); return ack(query); }
    if (data === 'ai_request') { setState(from.id, { action: 'ai_request' }); bot.sendMessage(chatId, '📝 *Request a Product*\n\nDescribe what product or service you\'re looking for and we\'ll try to source it for you:', { parse_mode: 'Markdown' }); return ack(query); }
    if (data === 'ai_ask') { setState(from.id, { action: 'ai_chat' }); bot.sendMessage(chatId, '🤖 *GSCF AI Assistant*\n\nAsk me anything about our products, categories, pricing, or how things work:', { parse_mode: 'Markdown' }); return ack(query); }

    // Shop / Categories
    if (data.startsWith('cat_')) { await showProducts(chatId, data.slice(4)); return ack(query); }
    if (data.startsWith('page_')) {
      const [, cat, pg] = data.split('_');
      await showProducts(chatId, cat, parseInt(pg));
      return ack(query);
    }

    // Search
    if (data === 'search_start') {
      setState(from.id, { action: 'search' });
      bot.sendMessage(chatId, '🔍 *Search Products*\n\nType your search term:', { parse_mode: 'Markdown' });
      return ack(query);
    }

    // Add to cart
    if (data.startsWith('add_')) {
      const productId = data.slice(4);
      const product = await Product.findById(productId);
      if (!product || product.status !== 'active') return ack(query, 'Product unavailable');
      if (product.stock === 0) return ack(query, '❌ Sold out!');

      const user = await User.findOne({ telegramId: from.id });
      if (!user) return ack(query);
      const existing = user.cart.find(i => i.product.toString() === productId);
      if (existing) existing.quantity += 1;
      else user.cart.push({ product: productId, quantity: 1 });
      await user.save();
      return ack(query, `✅ ${product.name} added to cart!`);
    }

    // Product detail
    if (data.startsWith('detail_')) {
      const product = await Product.findById(data.slice(7)).populate('seller', 'storeName rating');
      if (!product) return ack(query, 'Not found');
      const stockText = product.stock === -1 ? '✅ Unlimited' : product.stock > 0 ? `📦 ${product.stock} left` : '❌ Sold Out';
      const sellerInfo = product.seller ? `\n🏪 Seller: *${product.seller.storeName}*` : '\n🏪 Seller: *GSCF Official*';

      bot.sendMessage(chatId,
        `📦 *${product.name}*\n\n${product.description}\n\n💰 Price: *${formatPrice(product.price)}*\n${stockText}${sellerInfo}\n📂 Category: ${product.category}\n📤 Delivery: ${product.deliveryType === 'download_link' ? 'Instant Download' : product.deliveryType === 'license_key' ? 'License Key' : 'Manual Delivery'}`, {
          parse_mode: 'Markdown',
          reply_markup: productKeyboard(product._id),
        });
      return ack(query);
    }

    // Ask seller
    if (data.startsWith('ask_')) {
      const product = await Product.findById(data.slice(4));
      if (!product) return ack(query, 'Product not found');
      if (!product.sellerTelegramId) return ack(query, 'This is an official GSCF product. Use Help for support.');
      setState(from.id, { action: 'msg_seller', productId: product._id.toString(), sellerTgId: product.sellerTelegramId });
      bot.sendMessage(chatId, `💬 *Message Seller*\n\nProduct: *${product.name}*\n\nType your message to the seller:`, { parse_mode: 'Markdown' });
      return ack(query);
    }

    // Cart operations
    if (data === 'clear_cart') {
      const user = await User.findOne({ telegramId: from.id });
      if (user) { user.cart = []; await user.save(); }
      bot.sendMessage(chatId, '🗑 Cart cleared!', { reply_markup: { inline_keyboard: [[{ text: '🛍 Continue Shopping', callback_data: 'menu_shop' }], ...backButton()] } });
      return ack(query);
    }
    if (data.startsWith('rmcart_')) {
      const user = await User.findOne({ telegramId: from.id });
      if (user) { user.cart = user.cart.filter(i => i.product.toString() !== data.slice(7)); await user.save(); }
      await handleCart(chatId, from);
      return ack(query, '✅ Removed');
    }

    // Checkout — wallet balance
    if (data === 'checkout_wallet') {
      await handleWalletCheckout(chatId, from);
      return ack(query);
    }
    if (data === 'checkout_stripe' || data === 'checkout_crypto') {
      await handleCheckout(chatId, from, data === 'checkout_stripe' ? 'stripe' : 'crypto');
      return ack(query);
    }

    // Top-up sent notification
    if (data.startsWith('topup_sent_')) {
      const wallet = await getOrCreateWallet(from.id);
      bot.sendMessage(chatId, `✅ *Payment Noted*\n\nDeposit Ref: \`${wallet.depositAddress}\`\n\n⏳ An admin will verify your deposit and credit your wallet. You'll be notified once your balance is updated.`, {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_wallet') },
      });
      notifyAdmins(`💳 *Wallet Top-Up Claim*\n\nUser: @${from.username || from.first_name}\nTelegram ID: \`${from.id}\`\nDeposit Ref: \`${wallet.depositAddress}\`\nCurrent Balance: $${wallet.balance.toFixed(2)}`, [
        [{ text: '💰 Add Balance', callback_data: `admin_addbal_${from.id}` }],
      ]);
      return ack(query);
    }

    // Cancel order
    if (data.startsWith('cancel_')) {
      const order = await Order.findById(data.slice(7));
      if (order && order.status === 'pending') { order.status = 'cancelled'; await order.save(); }
      bot.sendMessage(chatId, `❌ Order cancelled.`, { reply_markup: { inline_keyboard: backButton() } });
      return ack(query);
    }

    // Crypto paid
    if (data.startsWith('cryptopaid_')) {
      const order = await Order.findById(data.slice(11));
      if (order && order.status === 'pending') {
        bot.sendMessage(chatId, `✅ Payment noted for \`${order.orderNumber}\`\n\n⏳ Admin will verify shortly. You'll get your product once confirmed.`, { parse_mode: 'Markdown' });
        notifyAdmins(`💰 *Crypto Payment Claim*\n\nOrder: \`${order.orderNumber}\`\nUser: @${order.telegramUsername || 'N/A'}\nAmount: ${formatPrice(order.totalAmount)}`, [
          [{ text: '✅ Confirm', callback_data: `aconfirm_${order._id}` }, { text: '❌ Reject', callback_data: `areject_${order._id}` }],
        ]);
      }
      return ack(query);
    }

    // Admin confirm/reject
    if (data.startsWith('aconfirm_') || data.startsWith('areject_')) {
      if (!isAdminUser(from)) return ack(query, 'Unauthorized');
      const isConfirm = data.startsWith('aconfirm_');
      const order = await Order.findById(data.replace(/^a(confirm|reject)_/, '')).populate('items.product');
      if (!order) return ack(query, 'Order not found');
      if (isConfirm) {
        order.status = 'paid'; await order.save();
        await deliverOrder(order);
        bot.sendMessage(chatId, `✅ Order \`${order.orderNumber}\` confirmed & delivered!`, { parse_mode: 'Markdown' });
      } else {
        order.status = 'cancelled'; await order.save();
        try { bot.sendMessage(order.telegramUserId, `❌ Payment for order \`${order.orderNumber}\` could not be verified.`, { parse_mode: 'Markdown' }); } catch {}
        bot.sendMessage(chatId, `❌ Order \`${order.orderNumber}\` rejected.`, { parse_mode: 'Markdown' });
      }
      return ack(query);
    }

    // Order detail
    if (data.startsWith('orderdetail_')) {
      const order = await Order.findById(data.slice(12));
      if (!order) return ack(query, 'Order not found');
      let text = `📦 *Order ${order.orderNumber}*\n\nStatus: *${order.status}*\n\n`;
      if (order.deliveryDetails?.length) {
        for (const d of order.deliveryDetails) {
          text += `*${d.productName}*\n${d.type === 'license_key' ? '🔑' : '📥'} \`${d.content}\`\n\n`;
        }
      }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_orders') } });
      return ack(query);
    }

    // ─── Seller flows ────────────────────────────────────
    if (data === 'seller_apply') {
      setState(from.id, { action: 'seller_name' });
      bot.sendMessage(chatId, '🏪 *Seller Application*\n\nStep 1/2: What\'s your store name?', { parse_mode: 'Markdown' });
      return ack(query);
    }

    if (data === 'seller_addprod') {
      const seller = await Seller.findOne({ telegramId: from.id, status: 'approved' });
      if (!seller) return ack(query, 'Not a seller');
      setState(from.id, { action: 'prod_name', sellerId: seller._id.toString() });
      bot.sendMessage(chatId, '➕ *Add Product*\n\nStep 1/6: Product name?', { parse_mode: 'Markdown' });
      return ack(query);
    }

    // Seller product category selection (fixed categories)
    if (data.startsWith('selcat_')) {
      const state = getState(from.id);
      if (!state || state.action !== 'prod_category') return ack(query);
      const cat = data.slice(7);
      setState(from.id, { ...state, action: 'prod_image', prodCategory: cat });
      bot.sendMessage(chatId, '📸 Step 5/6: Send a *photo/proof* of the product.\n\n⚠️ This is required — products without proof will be rejected.', { parse_mode: 'Markdown' });
      return ack(query);
    }

    if (data === 'seller_products') {
      const products = await Product.find({ sellerTelegramId: from.id, status: { $ne: 'inactive' } }).sort({ createdAt: -1 }).limit(20);
      if (products.length === 0) {
        return bot.sendMessage(chatId, '📦 You have no products yet.', {
          reply_markup: { inline_keyboard: [[{ text: '➕ Add Product', callback_data: 'seller_addprod' }], ...backButton('menu_sell')] },
        });
      }
      let text = '📦 *Your Products*\n\n';
      const btns = [];
      for (const p of products) {
        text += `• *${p.name}* — ${formatPrice(p.price)} (${p.totalSold} sold)\n`;
        btns.push([
          { text: `✏️ ${p.name}`, callback_data: `sedit_${p._id}` },
          { text: `❌`, callback_data: `sdel_${p._id}` },
        ]);
      }
      btns.push([{ text: '➕ Add Product', callback_data: 'seller_addprod' }]);
      btns.push(...backButton('menu_sell'));
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } });
      return ack(query);
    }

    if (data === 'seller_sales') {
      const seller = await Seller.findOne({ telegramId: from.id });
      if (!seller) return ack(query);
      const orders = await Order.find({ 'items.product': { $in: await Product.find({ sellerTelegramId: from.id }).distinct('_id') }, status: { $in: ['paid', 'delivered'] } }).sort({ createdAt: -1 }).limit(10);
      let text = `📊 *Sales Dashboard*\n\n💰 Total Revenue: *${formatPrice(seller.totalRevenue)}*\n🛒 Total Sales: *${seller.totalSales}*\n\n`;
      if (orders.length) {
        text += '*Recent Orders:*\n';
        for (const o of orders) { text += `• \`${o.orderNumber}\` — ${formatPrice(o.totalAmount)}\n`; }
      }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_sell') } });
      return ack(query);
    }

    if (data === 'seller_messages') {
      await handleMessages(chatId, from);
      return ack(query);
    }

    if (data.startsWith('sdel_')) {
      const product = await Product.findOne({ _id: data.slice(5), sellerTelegramId: from.id });
      if (product) { product.status = 'inactive'; await product.save(); }
      bot.sendMessage(chatId, '✅ Product removed.', { reply_markup: { inline_keyboard: [[{ text: '← Back', callback_data: 'seller_products' }]] } });
      return ack(query);
    }

    // Conversation view
    if (data.startsWith('conv_')) {
      const convId = data.slice(5);
      const messages = await Message.find({ conversationId: convId }).sort({ createdAt: -1 }).limit(15);
      if (!messages.length) return ack(query, 'No messages');

      await Message.updateMany({ conversationId: convId, receiverTelegramId: from.id, read: false }, { read: true });

      let text = '💬 *Conversation*\n\n';
      for (const m of messages.reverse()) {
        const isMe = m.senderTelegramId === from.id;
        text += `${isMe ? '➡️ You' : '⬅️ Them'}: ${m.text}\n_${new Date(m.createdAt).toLocaleString()}_\n\n`;
      }

      const otherParty = messages[0].senderTelegramId === from.id ? messages[0].receiverTelegramId : messages[0].senderTelegramId;
      setState(from.id, { action: 'reply_conv', convId, otherTgId: otherParty });
      bot.sendMessage(chatId, text + '\n_Type your reply:_', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_messages') } });
      return ack(query);
    }

    // ─── Admin Panel ────────────────────────────────────
    if (data === 'admin_ai') { await handleAdminAI(chatId, from); return ack(query); }
    if (data === 'adminai_compose') { setState(from.id, { action: 'adminai_task' }); bot.sendMessage(chatId, '🤖 *AI Admin Assistant*\n\nTell me what you need help with. Examples:\n\n• _"write product description for a VPN tool at $25"_\n• _"draft a welcome message for new sellers"_\n• _"compose a response to a buyer complaint"_\n• _"summarize today\'s sales"_\n\nType your request:', { parse_mode: 'Markdown' }); return ack(query); }
    if (data === 'admin_sellers') { await handleAdminSellers(chatId, from); return ack(query); }
    if (data.startsWith('aapprove_')) { await approveSeller(chatId, data.slice(9)); return ack(query); }
    if (data.startsWith('asuspend_')) { await suspendSeller(chatId, data.slice(9)); return ack(query); }
    if (data === 'admin_stats') { await handleAdminStats(chatId); return ack(query); }
    if (data === 'admin_orders') { await handleAdminOrders(chatId); return ack(query); }

    ack(query);
  } catch (err) {
    console.error('Callback error:', err);
    ack(query, 'An error occurred');
  }
}

function ack(query, text) {
  bot.answerCallbackQuery(query.id, text ? { text } : undefined).catch(() => {});
}

// ─── Stateful messages ──────────────────────────────────
async function handleStatefulMessage(msg, state) {
  const chatId = msg.chat.id;
  const from = msg.from;
  const text = msg.text || '';

  // Admin add balance
  if (state.action === 'admin_addbal') {
    clearState(from.id);
    if (!isAdminUser(from)) return;
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount');
    const targetWallet = await getOrCreateWallet(state.targetTgId);
    targetWallet.deposit(amount, `Admin top-up by @${from.username || 'admin'}`);
    await targetWallet.save();
    bot.sendMessage(chatId, `✅ Added *$${amount.toFixed(2)}* to user ${state.targetTgId}\nNew balance: *$${targetWallet.balance.toFixed(2)}*`, {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_admin') },
    });
    try {
      bot.sendMessage(state.targetTgId, `💰 *Wallet Credited!*\n\n+$${amount.toFixed(2)} has been added to your wallet.\n💵 New Balance: *$${targetWallet.balance.toFixed(2)}*`, {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '💰 View Wallet', callback_data: 'menu_wallet' }]] },
      });
    } catch {}
    return;
  }

  // AI Chat
  if (state.action === 'ai_chat') {
    clearState(from.id);
    await handleAIChat(chatId, from, text);
    return;
  }

  // Product request
  if (state.action === 'ai_request') {
    await handleProductRequest(chatId, from, text);
    return;
  }

  // Broadcast
  if (state.action === 'broadcast_msg') {
    await executeBroadcast(chatId, from, text);
    return;
  }

  // AI compose broadcast — admin describes, AI writes, admin confirms
  if (state.action === 'ai_compose_broadcast') {
    bot.sendChatAction(chatId, 'typing');
    const products = await Product.find({ status: 'active' });
    const context = { productCount: products.length, userCount: await User.countDocuments(), topProducts: products.slice(0, 5).map(p => p.name).join(', ') };
    const aiText = await adminAICompose(text, context);
    if (!aiText) {
      bot.sendMessage(chatId, '⚠️ AI unavailable. Write the broadcast yourself:', { reply_markup: { inline_keyboard: backButton('admin_broadcast') } });
      setState(from.id, { action: 'broadcast_msg' });
      return;
    }
    setState(from.id, { ...state, action: 'confirm_ai_broadcast', broadcastText: aiText, wasSchedule: false });
    bot.sendMessage(chatId, `🤖 *AI Draft:*\n\n${aiText}\n\n━━━━━━━━━━━━━━━━\n_Review the message above. Send it or ask me to revise._`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Send Now', callback_data: 'bc_confirm_send' }],
          [{ text: '✏️ Revise', callback_data: 'bc_edit_ai' }],
          [{ text: '❌ Cancel', callback_data: 'admin_broadcast' }],
        ],
      },
    });
    return;
  }

  // AI scheduled broadcast
  if (state.action === 'ai_schedule_broadcast') {
    bot.sendChatAction(chatId, 'typing');
    const products = await Product.find({ status: 'active' });
    const context = { productCount: products.length, userCount: await User.countDocuments(), topProducts: products.slice(0, 5).map(p => p.name).join(', ') };
    const aiText = await adminAICompose(text, context);
    if (!aiText) {
      bot.sendMessage(chatId, '⚠️ AI unavailable. Write it yourself:', { reply_markup: { inline_keyboard: backButton('admin_broadcast') } });
      setState(from.id, { action: 'sched_broadcast_msg' });
      return;
    }
    setState(from.id, { ...state, broadcastText: aiText, wasSchedule: true });
    bot.sendMessage(chatId, `🤖 *AI Draft:*\n\n${aiText}\n\n━━━━━━━━━━━━━━━━\n_Pick schedule or ask me to revise._`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⏰ Schedule This', callback_data: 'bc_pick_time' }],
          [{ text: '✏️ Revise', callback_data: 'bc_edit_ai' }],
          [{ text: '❌ Cancel', callback_data: 'admin_broadcast' }],
        ],
      },
    });
    return;
  }

  // Admin AI general task
  if (state.action === 'adminai_task') {
    clearState(from.id);
    bot.sendChatAction(chatId, 'typing');
    const products = await Product.find({ status: 'active' });
    const context = { productCount: products.length, userCount: await User.countDocuments(), topProducts: products.slice(0, 5).map(p => p.name).join(', ') };
    const aiText = await adminAICompose(text, context);
    const response = aiText || '_AI unavailable right now. Try again later._';
    bot.sendMessage(chatId, `🤖 ${response}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✍️ Ask Again', callback_data: 'adminai_compose' }],
          ...backButton('admin_ai'),
        ],
      },
    });
    return;
  }

  if (state.action === 'sched_broadcast_msg') {
    setState(from.id, { ...state, broadcastText: text });
    await handleScheduleTime(chatId, from);
    return;
  }

  if (state.action === 'recur_broadcast_msg') {
    setState(from.id, { ...state, action: 'recur_broadcast_freq', broadcastText: text });
    bot.sendMessage(chatId, '🔁 *How often should this repeat?*', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Daily', callback_data: 'recur_daily' }, { text: '📅 Every 3 Days', callback_data: 'recur_3days' }],
          [{ text: '📅 Weekly', callback_data: 'recur_weekly' }],
          ...backButton('admin_broadcast'),
        ],
      },
    });
    return;
  }

  // Search
  if (state.action === 'search') {
    clearState(from.id);
    const products = await Product.find({ status: 'active', $or: [{ name: { $regex: text, $options: 'i' } }, { description: { $regex: text, $options: 'i' } }] }).limit(10);
    if (!products.length) {
      return bot.sendMessage(chatId, `🔍 No results for "${text}"`, { reply_markup: { inline_keyboard: [[{ text: '🔍 Try Again', callback_data: 'search_start' }], ...backButton('menu_shop')] } });
    }
    for (const p of products) {
      const txt = `*${p.name}*\n${p.description.slice(0, 100)}...\n💰 *${formatPrice(p.price)}*`;
      const opts = { parse_mode: 'Markdown', reply_markup: productKeyboard(p._id) };
      if (p.image) { try { await bot.sendPhoto(chatId, p.image, { caption: txt, ...opts }); continue; } catch {} }
      await bot.sendMessage(chatId, txt, opts);
    }
    return;
  }

  // Seller application — store name
  if (state.action === 'seller_name') {
    setState(from.id, { action: 'seller_desc', storeName: text });
    bot.sendMessage(chatId, '📝 Step 2/2: Describe your store in 1-2 sentences:', { parse_mode: 'Markdown' });
    return;
  }

  // Seller application — store description
  if (state.action === 'seller_desc') {
    clearState(from.id);
    const seller = await Seller.create({
      telegramId: from.id,
      username: from.username || '',
      firstName: from.first_name || '',
      storeName: state.storeName,
      storeDescription: text,
      status: 'pending',
    });

    bot.sendMessage(chatId, `✅ *Application Submitted!*\n\n🏪 Store: *${state.storeName}*\n📝 ${text}\n\n⏳ An admin will review your application. You'll be notified once approved.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: backButton() },
    });

    notifyAdmins(`🏪 *New Seller Application*\n\nStore: *${state.storeName}*\nUser: @${from.username || 'N/A'}\nDescription: ${text}`, [
      [{ text: '✅ Approve', callback_data: `aapprove_${seller._id}` }, { text: '❌ Reject', callback_data: `asuspend_${seller._id}` }],
    ]);
    return;
  }

  // Add product — name
  if (state.action === 'prod_name') {
    setState(from.id, { ...state, action: 'prod_desc', prodName: text });
    bot.sendMessage(chatId, '📝 Step 2/6: Product description:');
    return;
  }
  if (state.action === 'prod_desc') {
    setState(from.id, { ...state, action: 'prod_price', prodDesc: text });
    bot.sendMessage(chatId, '💰 Step 3/6: Price in USD (e.g. 29.99):');
    return;
  }
  if (state.action === 'prod_price') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Invalid price. Enter a number:');
    setState(from.id, { ...state, action: 'prod_category', prodPrice: price });
    bot.sendMessage(chatId, '📂 Step 4/6: Select category:', {
      reply_markup: {
        inline_keyboard: STORE_CATEGORIES.map(c => [{ text: c.label, callback_data: `selcat_${c.key}` }]),
      },
    });
    return;
  }
  // prod_category is handled by selcat_ callback above
  // prod_image — photo handler below
  if (state.action === 'prod_delivery') {
    clearState(from.id);
    const deliveryType = text.toLowerCase() === 'manual' ? 'manual' : text.includes('://') ? 'download_link' : 'license_key';
    const product = await Product.create({
      name: state.prodName,
      description: state.prodDesc,
      price: state.prodPrice,
      category: state.prodCategory,
      image: state.prodImage || null,
      deliveryType,
      deliveryContent: deliveryType === 'manual' ? '' : text,
      seller: state.sellerId,
      sellerTelegramId: from.id,
      status: 'active',
    });

    await Seller.findByIdAndUpdate(state.sellerId, { $inc: { productCount: 1 } });

    const text2 = `✅ *Product Listed!*\n\n📦 *${product.name}*\n💰 ${formatPrice(product.price)}\n📂 ${product.category}\n📸 Proof attached\n\nYour product is now live in the store!`;
    if (product.image) {
      try { bot.sendPhoto(chatId, product.image, { caption: text2, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '➕ Add Another', callback_data: 'seller_addprod' }], ...backButton('menu_sell')] } }); } catch {
        bot.sendMessage(chatId, text2, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '➕ Add Another', callback_data: 'seller_addprod' }], ...backButton('menu_sell')] } });
      }
    } else {
      bot.sendMessage(chatId, text2, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '➕ Add Another', callback_data: 'seller_addprod' }], ...backButton('menu_sell')] } });
    }
    return;
  }

  // Message to seller
  if (state.action === 'msg_seller') {
    clearState(from.id);
    const convId = `${Math.min(from.id, state.sellerTgId)}_${Math.max(from.id, state.sellerTgId)}_${state.productId}`;
    await Message.create({
      conversationId: convId,
      product: state.productId,
      senderTelegramId: from.id,
      senderRole: 'buyer',
      receiverTelegramId: state.sellerTgId,
      text,
    });

    const product = await Product.findById(state.productId);
    bot.sendMessage(chatId, '✅ Message sent to the seller!', {
      reply_markup: { inline_keyboard: backButton('menu_shop') },
    });

    try {
      bot.sendMessage(state.sellerTgId,
        `💬 *New Message from Buyer*\n\nProduct: *${product?.name || 'Unknown'}*\nFrom: @${from.username || from.first_name || 'Anonymous'}\n\n_"${text}"_\n\nReply below:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '💬 Reply', callback_data: `conv_${convId}` }]] },
        });
    } catch {}
    return;
  }

  // Reply in conversation
  if (state.action === 'reply_conv') {
    const senderSeller = await Seller.findOne({ telegramId: from.id });
    await Message.create({
      conversationId: state.convId,
      senderTelegramId: from.id,
      senderRole: senderSeller ? 'seller' : 'buyer',
      receiverTelegramId: state.otherTgId,
      text,
    });

    bot.sendMessage(chatId, '✅ Reply sent!', {
      reply_markup: { inline_keyboard: [[{ text: '💬 View Conversation', callback_data: `conv_${state.convId}` }], ...backButton('menu_messages')] },
    });

    try {
      bot.sendMessage(state.otherTgId,
        `💬 *New Reply*\n\nFrom: @${from.username || from.first_name || 'Anonymous'}\n\n_"${text}"_`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '💬 Reply', callback_data: `conv_${state.convId}` }]] },
        });
    } catch {}
    clearState(from.id);
    return;
  }
}

// ─── Wallet Checkout ────────────────────────────────────
async function handleWalletCheckout(chatId, from) {
  const user = await User.findOne({ telegramId: from.id }).populate('cart.product');
  if (!user?.cart?.length) return bot.sendMessage(chatId, '🛒 Cart is empty!');

  const wallet = await getOrCreateWallet(from.id);
  let total = 0;
  const items = [];

  for (const c of user.cart) {
    if (!c.product || c.product.status !== 'active' || c.product.stock === 0) continue;
    total += c.product.price * c.quantity;
    items.push({ product: c.product._id, productName: c.product.name, quantity: c.quantity, price: c.product.price });
  }

  if (!items.length) return bot.sendMessage(chatId, '❌ No valid items in cart');

  if (wallet.balance < total) {
    return bot.sendMessage(chatId, `⚠️ *Insufficient Balance*\n\n💰 Cart Total: *${formatPrice(total)}*\n💵 Your Balance: *$${wallet.balance.toFixed(2)}*\n📊 You need: *$${(total - wallet.balance).toFixed(2)}* more\n\nTop up your wallet to continue.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '💳 Top Up Wallet', callback_data: 'wallet_topup' }], ...backButton('menu_cart')] },
    });
  }

  const order = await Order.create({
    orderNumber: generateOrderNumber(),
    telegramUserId: from.id,
    telegramUsername: from.username || '',
    items, totalAmount: total,
    paymentMethod: 'wallet',
    status: 'paid',
  });

  wallet.deduct(total, `Purchase: ${order.orderNumber}`, order._id);
  await wallet.save();

  const STORE_COMMISSION = parseFloat(process.env.STORE_COMMISSION || '10') / 100;

  for (const item of items) {
    const product = await Product.findById(item.product);
    if (product?.sellerTelegramId) {
      const sellerWallet = await getOrCreateWallet(product.sellerTelegramId);
      const sellerCut = item.price * item.quantity * (1 - STORE_COMMISSION);
      const storeCut = item.price * item.quantity * STORE_COMMISSION;
      sellerWallet.credit(sellerCut, `Sale: ${item.productName}`, order._id);
      await sellerWallet.save();

      const storeAdminId = getAdminIds()[0];
      if (storeAdminId) {
        const storeWallet = await getOrCreateWallet(storeAdminId);
        storeWallet.credit(storeCut, `Commission: ${item.productName}`, order._id);
        await storeWallet.save();
      }
    }
  }

  user.cart = [];
  await user.save();

  await deliverOrder(order);

  bot.sendMessage(chatId, `✅ *Purchase Complete!*\n\n🧾 Order: \`${order.orderNumber}\`\n💰 Paid: *${formatPrice(total)}*\n💵 Remaining Balance: *$${wallet.balance.toFixed(2)}*\n\n📬 Your products are being delivered...`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '📦 View Orders', callback_data: 'menu_orders' }], ...backButton()] },
  });
}

// ─── Legacy Checkout (Stripe/Crypto) ────────────────────
async function handleCheckout(chatId, from, method) {
  const user = await User.findOne({ telegramId: from.id }).populate('cart.product');
  if (!user?.cart?.length) return bot.sendMessage(chatId, '🛒 Cart is empty!');

  const items = [];
  let total = 0;
  for (const c of user.cart) {
    if (!c.product || c.product.status !== 'active') continue;
    if (c.product.stock === 0) continue;
    total += c.product.price * c.quantity;
    items.push({ product: c.product._id, productName: c.product.name, quantity: c.quantity, price: c.product.price });
  }
  if (!items.length) return bot.sendMessage(chatId, '❌ No valid items in cart');

  const order = await Order.create({
    orderNumber: generateOrderNumber(),
    telegramUserId: from.id,
    telegramUsername: from.username || '',
    items, totalAmount: total,
    paymentMethod: method,
  });

  user.cart = [];
  await user.save();

  if (method === 'stripe') {
    try {
      const baseUrl = process.env.WEBHOOK_URL || process.env.DASHBOARD_URL || 'http://localhost:5000';
      const session = await createStripeCheckoutSession(order, `${baseUrl}/api/payment/success?orderId=${order._id}`, `${baseUrl}/api/payment/cancel?orderId=${order._id}`);
      order.paymentId = session.id;
      await order.save();
      bot.sendMessage(chatId, `🧾 *Order Created*\n\n\`${order.orderNumber}\`\n💰 Total: *${formatPrice(total)}*\n\nTap below to pay:`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '💳 Pay Now', url: session.url }], [{ text: '❌ Cancel', callback_data: `cancel_${order._id}` }]] },
      });
    } catch (err) {
      bot.sendMessage(chatId, `⚠️ Payment system error. Try crypto instead.\n\nOrder: \`${order.orderNumber}\``, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '₿ Pay Crypto', callback_data: 'checkout_crypto' }]] },
      });
    }
  } else {
    const info = generateCryptoPaymentInfo(order);
    bot.sendMessage(chatId,
      `🧾 *Order Created*\n\n\`${order.orderNumber}\`\n💰 Total: *${formatPrice(total)}*\n\n₿ *Crypto Payment*\n\n📬 Wallet: \`${info.walletAddress}\`\n💵 Amount: *$${info.amount.toFixed(2)} ${info.currency}*\n📝 Memo: \`${info.memo}\`\n\n${info.instructions}`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '✅ I\'ve Sent Payment', callback_data: `cryptopaid_${order._id}` }], [{ text: '❌ Cancel', callback_data: `cancel_${order._id}` }]] },
      });
  }
}

// ─── Deliver Order ──────────────────────────────────────
async function deliverOrder(order) {
  if (!order.items?.[0]?.product?.name) await order.populate('items.product');

  const deliveryDetails = [];
  for (const item of order.items) {
    const product = typeof item.product === 'object' ? item.product : await Product.findById(item.product);
    if (!product) continue;

    let content = '';
    if (product.deliveryType === 'license_key') {
      const key = product.licenseKeys?.find(k => !k.used);
      if (key) { key.used = true; key.orderId = order._id; await product.save(); content = key.key; }
      else content = product.deliveryContent || 'Key pending — seller will provide shortly.';
    } else if (product.deliveryType === 'manual') {
      content = 'Seller will deliver manually. Check your messages.';
      if (product.sellerTelegramId) {
        try {
          bot.sendMessage(product.sellerTelegramId,
            `🛒 *New Sale!*\n\n📦 Product: *${product.name}*\nBuyer: @${order.telegramUsername || order.telegramUserId}\nOrder: \`${order.orderNumber}\`\n\n⚠️ This product has manual delivery. Please deliver to the buyer via Messages.`, {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[{ text: '💬 Message Buyer', callback_data: `conv_${Math.min(order.telegramUserId, product.sellerTelegramId)}_${Math.max(order.telegramUserId, product.sellerTelegramId)}_${product._id}` }]] },
            });
        } catch {}
      }
    } else {
      content = product.deliveryContent || 'Download link pending.';
    }

    deliveryDetails.push({ productName: item.productName, type: product.deliveryType, content });
    if (product.stock > 0) { product.stock -= item.quantity; if (product.stock < 0) product.stock = 0; }
    product.totalSold += item.quantity;
    await product.save();

    if (product.seller) {
      await Seller.findByIdAndUpdate(product.seller, { $inc: { totalSales: item.quantity, totalRevenue: item.price * item.quantity } });
    }
  }

  order.deliveryDetails = deliveryDetails;
  order.status = 'delivered';
  order.deliveredAt = new Date();
  await order.save();

  const user = await User.findOne({ telegramId: order.telegramUserId });
  if (user) { user.totalSpent += order.totalAmount; user.orderCount += 1; await user.save(); }

  let deliveryText = `📬 *Order Delivered!*\n\n\`${order.orderNumber}\`\n\n`;
  for (const d of deliveryDetails) {
    const icon = d.type === 'license_key' ? '🔑' : d.type === 'download_link' ? '📥' : '📨';
    deliveryText += `*${d.productName}*\n${icon} \`${d.content}\`\n\n`;
  }
  deliveryText += '_Thank you for choosing GSCF! 🔥_';

  try { bot.sendMessage(order.telegramUserId, deliveryText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton() } }); } catch {}
  return order;
}

// ─── Admin Panel ────────────────────────────────────────
async function handleAdminPanel(chatId, from) {
  if (!isAdminUser(from)) return;
  const totalProducts = await Product.countDocuments({ status: 'active' });
  const totalOrders = await Order.countDocuments();
  const pendingSellers = await Seller.countDocuments({ status: 'pending' });
  const totalUsers = await User.countDocuments();
  const scheduledBroadcasts = await Broadcast.countDocuments({ status: 'scheduled' });

  bot.sendMessage(chatId,
    `⚙️ *Admin Panel*\n\n📦 Products: *${totalProducts}*\n📋 Orders: *${totalOrders}*\n👥 Users: *${totalUsers}*\n🏪 Pending Sellers: *${pendingSellers}*\n📢 Scheduled Broadcasts: *${scheduledBroadcasts}*`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏪 Manage Sellers', callback_data: 'admin_sellers' }, { text: '📊 Stats', callback_data: 'admin_stats' }],
          [{ text: '📋 Recent Orders', callback_data: 'admin_orders' }],
          [{ text: '📢 Broadcast Center', callback_data: 'admin_broadcast' }],
          [{ text: '🤖 AI Admin Tools', callback_data: 'admin_ai' }],
          ...backButton(),
        ],
      },
    });
}

async function handleAdminAI(chatId, from) {
  if (!isAdminUser(from)) return;
  bot.sendMessage(chatId, `🤖 *AI Admin Tools*\n\nLet AI help you run GSCF Store more efficiently:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✍️ AI Compose Anything', callback_data: 'adminai_compose' }],
        [{ text: '📢 AI Write Broadcast', callback_data: 'bc_ai_compose' }],
        [{ text: '⏰ AI Schedule Broadcasts', callback_data: 'bc_ai_schedule' }],
        ...backButton('menu_admin'),
      ],
    },
  });
}

async function handleAdminSellers(chatId, from) {
  if (!isAdminUser(from)) return;
  const sellers = await Seller.find().sort({ createdAt: -1 }).limit(20);
  if (!sellers.length) return bot.sendMessage(chatId, 'No sellers yet.', { reply_markup: { inline_keyboard: backButton('menu_admin') } });

  let text = '🏪 *Sellers*\n\n';
  const btns = [];
  for (const s of sellers) {
    const emoji = { pending: '⏳', approved: '✅', suspended: '🚫', rejected: '❌' };
    text += `${emoji[s.status]} *${s.storeName}* (@${s.username || 'N/A'})\n   ${s.productCount} products | ${formatPrice(s.totalRevenue)} revenue\n\n`;
    if (s.status === 'pending') btns.push([{ text: `✅ Approve ${s.storeName}`, callback_data: `aapprove_${s._id}` }, { text: '❌', callback_data: `asuspend_${s._id}` }]);
    else if (s.status === 'approved') btns.push([{ text: `🚫 Suspend ${s.storeName}`, callback_data: `asuspend_${s._id}` }]);
  }
  btns.push(...backButton('menu_admin'));
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } });
}

async function approveSeller(chatId, sellerId) {
  const seller = await Seller.findByIdAndUpdate(sellerId, { status: 'approved' }, { new: true });
  if (!seller) return;
  bot.sendMessage(chatId, `✅ *${seller.storeName}* approved!`, { parse_mode: 'Markdown' });
  try { bot.sendMessage(seller.telegramId, `🎉 *Congratulations!*\n\nYour seller application for *${seller.storeName}* has been approved!\n\nYou can now list products. Tap below to get started:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🏪 Seller Dashboard', callback_data: 'menu_sell' }]] } }); } catch {}
}

async function suspendSeller(chatId, sellerId) {
  const seller = await Seller.findByIdAndUpdate(sellerId, { status: 'suspended' }, { new: true });
  if (!seller) return;
  bot.sendMessage(chatId, `🚫 *${seller.storeName}* suspended.`, { parse_mode: 'Markdown' });
  try { bot.sendMessage(seller.telegramId, `🚫 Your seller account *${seller.storeName}* has been suspended. Contact admin for details.`, { parse_mode: 'Markdown' }); } catch {}
}

async function handleAdminStats(chatId) {
  const rev = await Order.aggregate([{ $match: { status: { $in: ['paid', 'delivered'] } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]);
  const totalRevenue = rev[0]?.total || 0;
  const totalOrders = await Order.countDocuments();
  const paidOrders = await Order.countDocuments({ status: { $in: ['paid', 'delivered'] } });
  const totalUsers = await User.countDocuments();
  const totalSellers = await Seller.countDocuments({ status: 'approved' });
  const topProducts = await Order.aggregate([{ $match: { status: { $in: ['paid', 'delivered'] } } }, { $unwind: '$items' }, { $group: { _id: '$items.productName', sold: { $sum: '$items.quantity' }, rev: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }, { $sort: { rev: -1 } }, { $limit: 5 }]);

  let text = `📊 *Platform Stats*\n\n💰 Revenue: *${formatPrice(totalRevenue)}*\n📋 Orders: *${totalOrders}* (${paidOrders} paid)\n👥 Users: *${totalUsers}*\n🏪 Sellers: *${totalSellers}*\n📈 Conversion: *${totalOrders ? ((paidOrders / totalOrders) * 100).toFixed(1) : 0}%*`;
  if (topProducts.length) {
    text += '\n\n🏆 *Top Products:*\n';
    topProducts.forEach((p, i) => { text += `${i + 1}. ${p._id} — ${p.sold} sold — ${formatPrice(p.rev)}\n`; });
  }
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_admin') } });
}

async function handleAdminOrders(chatId) {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(15);
  if (!orders.length) return bot.sendMessage(chatId, 'No orders yet.', { reply_markup: { inline_keyboard: backButton('menu_admin') } });
  const emoji = { pending: '⏳', paid: '✅', delivered: '📬', cancelled: '❌', refunded: '💸' };
  let text = '📋 *Recent Orders*\n\n';
  for (const o of orders) {
    text += `${emoji[o.status]} \`${o.orderNumber}\`\n   @${o.telegramUsername || o.telegramUserId} — ${formatPrice(o.totalAmount)} — ${o.paymentMethod}\n\n`;
  }
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: backButton('menu_admin') } });
}

// ─── Helpers ────────────────────────────────────────────
function notifyAdmins(text, buttons = []) {
  const ids = getAdminIds();
  for (const id of ids) {
    try { bot.sendMessage(id, text, { parse_mode: 'Markdown', reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined }); } catch {}
  }
}

module.exports = { initBot, getBot, deliverOrder };
