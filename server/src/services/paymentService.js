const Stripe = require('stripe');

let stripe = null;

function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

async function createStripeCheckoutSession(order, successUrl, cancelUrl) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');

  const lineItems = order.items.map((item) => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.productName,
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.quantity,
  }));

  const session = await s.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
    },
  });

  return session;
}

async function verifyStripeWebhook(payload, signature) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');

  return s.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

function generateCryptoPaymentInfo(order) {
  return {
    walletAddress: process.env.CRYPTO_WALLET_ADDRESS || 'NOT_CONFIGURED',
    amount: order.totalAmount,
    currency: 'USDT',
    memo: order.orderNumber,
    instructions: `Send exactly $${order.totalAmount.toFixed(2)} worth of USDT to the wallet address above. Include "${order.orderNumber}" in the memo/reference field. Your order will be confirmed after 1 network confirmation.`,
  };
}

module.exports = {
  createStripeCheckoutSession,
  verifyStripeWebhook,
  generateCryptoPaymentInfo,
};
