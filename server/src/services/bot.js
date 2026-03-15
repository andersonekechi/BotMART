const TelegramBot = require('node-telegram-bot-api');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { generateOrderNumber, formatPrice, truncate } = require('../utils/helpers');
const { createStripeCheckoutSession, generateCryptoPaymentInfo } = require('./paymentService');

let bot = null;

function getBot() {
  return bot;
}

function initBot() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === 'placeholder_get_from_botfather') {
    console.warn('BOT_TOKEN not configured — bot disabled. Dashboard still works.');
    console.warn('Get a token from @BotFather on Telegram and set it in server/.env');
    return null;
  }

  const isWebhook = process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL;

  bot = new TelegramBot(token, {
    polling: !isWebhook,
    webHook: isWebhook ? { port: false } : false,
  });

  if (isWebhook) {
    const webhookUrl = `${process.env.WEBHOOK_URL}/api/bot/webhook`;
    bot.setWebHook(webhookUrl).then(() => {
      console.log(`Webhook set: ${webhookUrl}`);
    }).catch(err => {
      console.error('Failed to set webhook:', err.message);
    });
  } else {
    console.log('Bot started in polling mode');
  }

  registerHandlers();
  return bot;
}

function getAdminIds() {
  const ids = process.env.ADMIN_TELEGRAM_IDS || '';
  return ids.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean);
}

function isAdmin(userId) {
  return getAdminIds().includes(userId);
}

async function getOrCreateUser(msg) {
  const { id, username, first_name, last_name } = msg.from;
  let user = await User.findOne({ telegramId: id });
  if (!user) {
    user = await User.create({
      telegramId: id,
      username: username || '',
      firstName: first_name || '',
      lastName: last_name || '',
    });
  } else {
    user.username = username || user.username;
    user.firstName = first_name || user.firstName;
    user.lastName = last_name || user.lastName;
    await user.save();
  }
  return user;
}

function registerHandlers() {
  bot.onText(/\/start/, handleStart);
  bot.onText(/\/shop/, handleShop);
  bot.onText(/\/cart/, handleCart);
  bot.onText(/\/orders/, handleOrders);
  bot.onText(/\/help/, handleHelp);

  // Admin commands
  bot.onText(/\/addproduct/, handleAddProduct);
  bot.onText(/\/editproduct/, handleEditProduct);
  bot.onText(/\/removeproduct/, handleRemoveProduct);
  bot.onText(/\/adminorders/, handleAdminOrders);
  bot.onText(/\/stats/, handleStats);

  bot.on('callback_query', handleCallbackQuery);
}

// ─── Start ───────────────────────────────────────────────
async function handleStart(msg) {
  const chatId = msg.chat.id;
  await getOrCreateUser(msg);

  const welcome = `🛍️ *Welcome to the Digital Tools Shop!*

Browse our collection of premium digital tools and products.

*Commands:*
/shop — Browse products
/cart — View your cart
/orders — View your orders
/help — Show help

Happy shopping! 🎉`;

  bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
}

// ─── Help ────────────────────────────────────────────────
async function handleHelp(msg) {
  const chatId = msg.chat.id;
  let text = `📖 *Help*

/start — Welcome message
/shop — Browse product catalog
/cart — View/manage your cart
/orders — View your order history
/help — This help message`;

  if (isAdmin(msg.from.id)) {
    text += `

🔑 *Admin Commands:*
/addproduct — Add a new product
/editproduct — Edit existing product
/removeproduct — Remove a product
/adminorders — View all recent orders
/stats — View sales statistics`;
  }

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// ─── Shop / Catalog ──────────────────────────────────────
async function handleShop(msg) {
  const chatId = msg.chat.id;
  await getOrCreateUser(msg);

  const products = await Product.find({ status: 'active' }).sort({ createdAt: -1 });

  if (products.length === 0) {
    return bot.sendMessage(chatId, '📭 No products available right now. Check back later!');
  }

  const categories = [...new Set(products.map((p) => p.category))];

  const keyboard = categories.map((cat) => [
    { text: `📂 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`, callback_data: `cat_${cat}` },
  ]);

  keyboard.push([{ text: '🛒 View All Products', callback_data: 'cat_all' }]);

  bot.sendMessage(chatId, `🛍️ *Product Catalog*\n\nChoose a category or view all:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function showCategoryProducts(chatId, category) {
  const query = category === 'all' ? { status: 'active' } : { status: 'active', category };
  const products = await Product.find(query).sort({ createdAt: -1 });

  if (products.length === 0) {
    return bot.sendMessage(chatId, '📭 No products in this category.');
  }

  for (const product of products) {
    const stockText =
      product.stock === -1
        ? '∞ In Stock'
        : product.stock > 0
        ? `${product.stock} left`
        : '❌ Out of Stock';

    const text = `*${product.name}*\n\n${product.description}\n\n💰 Price: *${formatPrice(product.price)}*\n📦 Stock: ${stockText}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🛒 Add to Cart', callback_data: `add_${product._id}` }],
        [{ text: '📋 Details', callback_data: `detail_${product._id}` }],
      ],
    };

    if (product.image) {
      try {
        await bot.sendPhoto(chatId, product.image, {
          caption: text,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } else {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
  }
}

// ─── Cart ────────────────────────────────────────────────
async function handleCart(msg) {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(msg);
  await showCart(chatId, user);
}

async function showCart(chatId, user) {
  if (!user.cart || user.cart.length === 0) {
    return bot.sendMessage(chatId, '🛒 Your cart is empty!\n\nUse /shop to browse products.');
  }

  await user.populate('cart.product');

  let total = 0;
  let text = '🛒 *Your Cart:*\n\n';

  const validItems = [];
  for (const item of user.cart) {
    if (!item.product) continue;
    validItems.push(item);
    const subtotal = item.product.price * item.quantity;
    total += subtotal;
    text += `• *${item.product.name}* x${item.quantity} — ${formatPrice(subtotal)}\n`;
  }

  text += `\n💰 *Total: ${formatPrice(total)}*`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '💳 Checkout (Stripe)', callback_data: 'checkout_stripe' },
        { text: '₿ Checkout (Crypto)', callback_data: 'checkout_crypto' },
      ],
      [{ text: '🗑️ Clear Cart', callback_data: 'clear_cart' }],
    ],
  };

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// ─── Orders ──────────────────────────────────────────────
async function handleOrders(msg) {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(msg);

  const orders = await Order.find({ telegramUserId: user.telegramId })
    .sort({ createdAt: -1 })
    .limit(10);

  if (orders.length === 0) {
    return bot.sendMessage(chatId, '📋 You have no orders yet.\n\nUse /shop to start browsing!');
  }

  let text = '📋 *Your Recent Orders:*\n\n';
  for (const order of orders) {
    const statusEmoji = {
      pending: '⏳',
      paid: '✅',
      delivered: '📬',
      cancelled: '❌',
      refunded: '💸',
    };
    const items = order.items.map((i) => `${i.productName} x${i.quantity}`).join(', ');
    text += `${statusEmoji[order.status] || '•'} \`${order.orderNumber}\`\n`;
    text += `   ${truncate(items, 40)} — ${formatPrice(order.totalAmount)}\n`;
    text += `   Status: *${order.status}*\n\n`;
  }

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// ─── Callback Query Handler ──────────────────────────────
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;

  try {
    // Category browsing
    if (data.startsWith('cat_')) {
      const category = data.replace('cat_', '');
      await showCategoryProducts(chatId, category);
      return bot.answerCallbackQuery(query.id);
    }

    // Add to cart
    if (data.startsWith('add_')) {
      const productId = data.replace('add_', '');
      const product = await Product.findById(productId);
      if (!product || product.status !== 'active') {
        return bot.answerCallbackQuery(query.id, { text: 'Product not available' });
      }
      if (product.stock === 0) {
        return bot.answerCallbackQuery(query.id, { text: 'Out of stock!' });
      }

      const user = await User.findOne({ telegramId: userId });
      if (!user) return;

      const existingItem = user.cart.find((i) => i.product.toString() === productId);
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        user.cart.push({ product: productId, quantity: 1 });
      }
      await user.save();

      bot.answerCallbackQuery(query.id, { text: `✅ ${product.name} added to cart!` });
      return;
    }

    // Product detail
    if (data.startsWith('detail_')) {
      const productId = data.replace('detail_', '');
      const product = await Product.findById(productId);
      if (!product) return bot.answerCallbackQuery(query.id, { text: 'Product not found' });

      const stockText =
        product.stock === -1 ? '∞ Unlimited' : product.stock > 0 ? `${product.stock} available` : '❌ Out of Stock';

      const text = `📦 *${product.name}*\n\n${product.description}\n\n💰 Price: *${formatPrice(product.price)}*\n📦 Stock: ${stockText}\n📂 Category: ${product.category}\n📤 Delivery: ${product.deliveryType === 'download_link' ? 'Download Link' : 'License Key'}`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🛒 Add to Cart', callback_data: `add_${product._id}` }],
          [{ text: '🔙 Back to Shop', callback_data: 'cat_all' }],
        ],
      };

      bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
      return bot.answerCallbackQuery(query.id);
    }

    // Checkout
    if (data === 'checkout_stripe' || data === 'checkout_crypto') {
      const user = await User.findOne({ telegramId: userId }).populate('cart.product');
      if (!user || !user.cart || user.cart.length === 0) {
        return bot.answerCallbackQuery(query.id, { text: 'Cart is empty!' });
      }

      const items = [];
      let total = 0;
      for (const cartItem of user.cart) {
        if (!cartItem.product || cartItem.product.status !== 'active') continue;
        if (cartItem.product.stock === 0) continue;
        const subtotal = cartItem.product.price * cartItem.quantity;
        total += subtotal;
        items.push({
          product: cartItem.product._id,
          productName: cartItem.product.name,
          quantity: cartItem.quantity,
          price: cartItem.product.price,
        });
      }

      if (items.length === 0) {
        return bot.answerCallbackQuery(query.id, { text: 'No valid items in cart' });
      }

      const paymentMethod = data === 'checkout_stripe' ? 'stripe' : 'crypto';

      const order = await Order.create({
        orderNumber: generateOrderNumber(),
        telegramUserId: userId,
        telegramUsername: user.username,
        items,
        totalAmount: total,
        paymentMethod,
      });

      if (paymentMethod === 'stripe') {
        try {
          const baseUrl = process.env.WEBHOOK_URL || process.env.DASHBOARD_URL || 'http://localhost:5000';
          const session = await createStripeCheckoutSession(
            order,
            `${baseUrl}/api/payment/success?orderId=${order._id}`,
            `${baseUrl}/api/payment/cancel?orderId=${order._id}`
          );

          order.paymentId = session.id;
          await order.save();

          bot.sendMessage(
            chatId,
            `🧾 *Order Created: \`${order.orderNumber}\`*\n\n💰 Total: *${formatPrice(total)}*\n\nClick below to complete payment:`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💳 Pay Now', url: session.url }],
                  [{ text: '❌ Cancel Order', callback_data: `cancel_${order._id}` }],
                ],
              },
            }
          );
        } catch (err) {
          console.error('Stripe checkout error:', err.message);
          bot.sendMessage(
            chatId,
            `⚠️ Payment system error. Please try again later or use crypto payment.\n\nOrder: \`${order.orderNumber}\``,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        const cryptoInfo = generateCryptoPaymentInfo(order);
        bot.sendMessage(
          chatId,
          `🧾 *Order Created: \`${order.orderNumber}\`*\n\n💰 Total: *${formatPrice(total)}*\n\n₿ *Crypto Payment Instructions:*\n\n📬 Wallet: \`${cryptoInfo.walletAddress}\`\n💵 Amount: *$${cryptoInfo.amount.toFixed(2)} ${cryptoInfo.currency}*\n📝 Memo: \`${cryptoInfo.memo}\`\n\n${cryptoInfo.instructions}\n\n_Your order will be confirmed once payment is verified._`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ I\'ve Sent Payment', callback_data: `cryptopaid_${order._id}` }],
                [{ text: '❌ Cancel Order', callback_data: `cancel_${order._id}` }],
              ],
            },
          }
        );
      }

      user.cart = [];
      await user.save();
      return bot.answerCallbackQuery(query.id, { text: 'Order created!' });
    }

    // Cancel order
    if (data.startsWith('cancel_')) {
      const orderId = data.replace('cancel_', '');
      const order = await Order.findById(orderId);
      if (order && order.status === 'pending') {
        order.status = 'cancelled';
        await order.save();
        bot.sendMessage(chatId, `❌ Order \`${order.orderNumber}\` has been cancelled.`, {
          parse_mode: 'Markdown',
        });
      }
      return bot.answerCallbackQuery(query.id);
    }

    // Crypto paid notification
    if (data.startsWith('cryptopaid_')) {
      const orderId = data.replace('cryptopaid_', '');
      const order = await Order.findById(orderId);
      if (order && order.status === 'pending') {
        bot.sendMessage(
          chatId,
          `✅ Thank you! We've noted your payment for order \`${order.orderNumber}\`.\n\n⏳ An admin will verify your payment shortly. You'll receive your product once confirmed.`,
          { parse_mode: 'Markdown' }
        );

        const adminIds = getAdminIds();
        for (const adminId of adminIds) {
          try {
            bot.sendMessage(
              adminId,
              `💰 *Crypto Payment Claim*\n\nOrder: \`${order.orderNumber}\`\nUser: @${order.telegramUsername || 'N/A'} (${order.telegramUserId})\nAmount: ${formatPrice(order.totalAmount)}\n\nPlease verify payment and confirm:`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Confirm Payment', callback_data: `adminconfirm_${order._id}` }],
                    [{ text: '❌ Reject', callback_data: `adminreject_${order._id}` }],
                  ],
                },
              }
            );
          } catch { /* admin may not have started the bot */ }
        }
      }
      return bot.answerCallbackQuery(query.id);
    }

    // Admin confirm/reject crypto
    if (data.startsWith('adminconfirm_') || data.startsWith('adminreject_')) {
      if (!isAdmin(userId)) {
        return bot.answerCallbackQuery(query.id, { text: 'Unauthorized' });
      }

      const isConfirm = data.startsWith('adminconfirm_');
      const orderId = data.replace(/^admin(confirm|reject)_/, '');
      const order = await Order.findById(orderId).populate('items.product');

      if (!order) return bot.answerCallbackQuery(query.id, { text: 'Order not found' });

      if (isConfirm) {
        order.status = 'paid';
        await order.save();
        await deliverOrder(order);
        bot.sendMessage(chatId, `✅ Order \`${order.orderNumber}\` confirmed and delivered!`, {
          parse_mode: 'Markdown',
        });
      } else {
        order.status = 'cancelled';
        await order.save();
        bot.sendMessage(order.telegramUserId, `❌ Your payment for order \`${order.orderNumber}\` could not be verified. Please contact support.`, {
          parse_mode: 'Markdown',
        });
        bot.sendMessage(chatId, `❌ Order \`${order.orderNumber}\` rejected.`, { parse_mode: 'Markdown' });
      }
      return bot.answerCallbackQuery(query.id);
    }

    // Clear cart
    if (data === 'clear_cart') {
      const user = await User.findOne({ telegramId: userId });
      if (user) {
        user.cart = [];
        await user.save();
      }
      bot.sendMessage(chatId, '🗑️ Cart cleared!');
      return bot.answerCallbackQuery(query.id);
    }

    // Remove single cart item
    if (data.startsWith('rmcart_')) {
      const productId = data.replace('rmcart_', '');
      const user = await User.findOne({ telegramId: userId });
      if (user) {
        user.cart = user.cart.filter((i) => i.product.toString() !== productId);
        await user.save();
      }
      bot.sendMessage(chatId, '✅ Item removed from cart.');
      return bot.answerCallbackQuery(query.id);
    }

    bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Callback query error:', error);
    bot.answerCallbackQuery(query.id, { text: 'An error occurred' });
  }
}

// ─── Deliver Order ───────────────────────────────────────
async function deliverOrder(order) {
  if (!order.items) await order.populate('items.product');

  const deliveryDetails = [];

  for (const item of order.items) {
    const product = item.product || (await Product.findById(item.product));
    if (!product) continue;

    let content = '';
    if (product.deliveryType === 'license_key') {
      const availableKey = product.licenseKeys.find((k) => !k.used);
      if (availableKey) {
        availableKey.used = true;
        availableKey.orderId = order._id;
        await product.save();
        content = availableKey.key;
      } else {
        content = product.deliveryContent || 'License key pending - admin will provide shortly.';
      }
    } else {
      content = product.deliveryContent || 'Download link pending - admin will provide shortly.';
    }

    deliveryDetails.push({
      productName: item.productName,
      type: product.deliveryType,
      content,
    });

    if (product.stock > 0) {
      product.stock -= item.quantity;
      if (product.stock < 0) product.stock = 0;
    }
    product.totalSold += item.quantity;
    await product.save();
  }

  order.deliveryDetails = deliveryDetails;
  order.status = 'delivered';
  order.deliveredAt = new Date();
  await order.save();

  const user = await User.findOne({ telegramId: order.telegramUserId });
  if (user) {
    user.totalSpent += order.totalAmount;
    user.orderCount += 1;
    await user.save();
  }

  let deliveryText = `📬 *Order Delivered!*\n\nOrder: \`${order.orderNumber}\`\n\n`;
  for (const detail of deliveryDetails) {
    const typeLabel = detail.type === 'license_key' ? '🔑 License Key' : '📥 Download Link';
    deliveryText += `*${detail.productName}*\n${typeLabel}: \`${detail.content}\`\n\n`;
  }
  deliveryText += '_Thank you for your purchase! 🎉_';

  try {
    bot.sendMessage(order.telegramUserId, deliveryText, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Failed to send delivery message:', err.message);
  }

  return order;
}

// ─── Admin Commands ──────────────────────────────────────
async function handleAddProduct(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(chatId, '⛔ Unauthorized');
  }

  const text = msg.text.replace(/^\/addproduct\s*/, '').trim();
  if (!text) {
    return bot.sendMessage(
      chatId,
      `📝 *Add Product*\n\nUsage:\n\`/addproduct name | description | price | category | stock | deliveryType | deliveryContent\`\n\n*Example:*\n\`/addproduct Premium VPN Tool | High-speed VPN with 100+ servers | 29.99 | tools | 100 | download_link | https://example.com/download\`\n\nDelivery types: \`download_link\` or \`license_key\`\nStock: use \`-1\` for unlimited`,
      { parse_mode: 'Markdown' }
    );
  }

  const parts = text.split('|').map((s) => s.trim());
  if (parts.length < 3) {
    return bot.sendMessage(chatId, '❌ Need at least: name | description | price');
  }

  const [name, description, priceStr, category, stockStr, deliveryType, deliveryContent] = parts;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price < 0) {
    return bot.sendMessage(chatId, '❌ Invalid price');
  }

  const product = await Product.create({
    name,
    description,
    price,
    category: category || 'general',
    stock: stockStr ? parseInt(stockStr, 10) : -1,
    deliveryType: deliveryType === 'license_key' ? 'license_key' : 'download_link',
    deliveryContent: deliveryContent || '',
  });

  bot.sendMessage(
    chatId,
    `✅ *Product Added!*\n\nID: \`${product._id}\`\nName: ${product.name}\nPrice: ${formatPrice(product.price)}\nCategory: ${product.category}\nStock: ${product.stock === -1 ? 'Unlimited' : product.stock}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleEditProduct(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, '⛔ Unauthorized');

  const text = msg.text.replace(/^\/editproduct\s*/, '').trim();
  if (!text) {
    return bot.sendMessage(
      chatId,
      `📝 *Edit Product*\n\nUsage:\n\`/editproduct productId | field=value | field=value\`\n\n*Fields:* name, description, price, category, stock, status, deliveryType, deliveryContent\n\n*Example:*\n\`/editproduct 6789abc | price=39.99 | stock=50\``,
      { parse_mode: 'Markdown' }
    );
  }

  const parts = text.split('|').map((s) => s.trim());
  const productId = parts[0];

  const product = await Product.findById(productId).catch(() => null);
  if (!product) return bot.sendMessage(chatId, '❌ Product not found');

  const updates = {};
  for (let i = 1; i < parts.length; i++) {
    const [field, ...valueParts] = parts[i].split('=');
    const value = valueParts.join('=').trim();
    const key = field.trim();

    if (['name', 'description', 'category', 'status', 'deliveryType', 'deliveryContent', 'image'].includes(key)) {
      updates[key] = value;
    } else if (key === 'price') {
      updates.price = parseFloat(value);
    } else if (key === 'stock') {
      updates.stock = parseInt(value, 10);
    }
  }

  Object.assign(product, updates);
  await product.save();

  bot.sendMessage(chatId, `✅ Product *${product.name}* updated!`, { parse_mode: 'Markdown' });
}

async function handleRemoveProduct(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, '⛔ Unauthorized');

  const text = msg.text.replace(/^\/removeproduct\s*/, '').trim();
  if (!text) {
    const products = await Product.find({ status: 'active' }).select('name price');
    if (products.length === 0) return bot.sendMessage(chatId, '📭 No active products');

    let list = '🗑️ *Remove Product*\n\nSelect a product to remove:\n\n';
    const keyboard = products.map((p) => [
      { text: `❌ ${p.name} (${formatPrice(p.price)})`, callback_data: `rmprod_${p._id}` },
    ]);

    bot.sendMessage(chatId, list, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
    return;
  }

  const product = await Product.findById(text).catch(() => null);
  if (!product) return bot.sendMessage(chatId, '❌ Product not found');

  product.status = 'inactive';
  await product.save();
  bot.sendMessage(chatId, `✅ Product *${product.name}* removed (set inactive).`, { parse_mode: 'Markdown' });
}

async function handleAdminOrders(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, '⛔ Unauthorized');

  const orders = await Order.find().sort({ createdAt: -1 }).limit(20);
  if (orders.length === 0) return bot.sendMessage(chatId, '📋 No orders yet.');

  let text = '📋 *Recent Orders:*\n\n';
  for (const order of orders) {
    const statusEmoji = { pending: '⏳', paid: '✅', delivered: '📬', cancelled: '❌', refunded: '💸' };
    text += `${statusEmoji[order.status] || '•'} \`${order.orderNumber}\`\n`;
    text += `   User: ${order.telegramUsername || order.telegramUserId}\n`;
    text += `   Total: ${formatPrice(order.totalAmount)} | ${order.paymentMethod}\n`;
    text += `   Status: *${order.status}*\n\n`;
  }

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

async function handleStats(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, '⛔ Unauthorized');

  const totalOrders = await Order.countDocuments();
  const paidOrders = await Order.countDocuments({ status: { $in: ['paid', 'delivered'] } });
  const revenue = await Order.aggregate([
    { $match: { status: { $in: ['paid', 'delivered'] } } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } },
  ]);
  const totalRevenue = revenue[0]?.total || 0;

  const topProducts = await Order.aggregate([
    { $match: { status: { $in: ['paid', 'delivered'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productName', sold: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ]);

  const totalUsers = await User.countDocuments();
  const totalProducts = await Product.countDocuments({ status: 'active' });
  const conversionRate = totalOrders > 0 ? ((paidOrders / totalOrders) * 100).toFixed(1) : 0;

  let text = `📊 *Sales Statistics*\n\n`;
  text += `💰 Total Revenue: *${formatPrice(totalRevenue)}*\n`;
  text += `📦 Total Orders: *${totalOrders}*\n`;
  text += `✅ Paid/Delivered: *${paidOrders}*\n`;
  text += `📈 Conversion Rate: *${conversionRate}%*\n`;
  text += `👥 Total Users: *${totalUsers}*\n`;
  text += `🛍️ Active Products: *${totalProducts}*\n\n`;

  if (topProducts.length > 0) {
    text += `🏆 *Top Products:*\n`;
    topProducts.forEach((p, i) => {
      text += `${i + 1}. ${p._id} — ${p.sold} sold — ${formatPrice(p.revenue)}\n`;
    });
  }

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

module.exports = { initBot, getBot, deliverOrder };
