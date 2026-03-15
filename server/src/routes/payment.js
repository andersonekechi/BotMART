const router = require('express').Router();
const Order = require('../models/Order');
const { verifyStripeWebhook } = require('../services/paymentService');
const { deliverOrder } = require('../services/bot');

router.post('/stripe-webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const event = await verifyStripeWebhook(req.body, sig);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata.orderId;

      const order = await Order.findById(orderId).populate('items.product');
      if (order && order.status === 'pending') {
        order.status = 'paid';
        order.paymentId = session.payment_intent;
        await order.save();
        await deliverOrder(order);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get('/success', async (req, res) => {
  const { orderId } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Payment Successful</title>
    <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0fdf4}
    .card{text-align:center;padding:3rem;background:white;border-radius:1rem;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    h1{color:#16a34a;font-size:2rem}p{color:#6b7280;font-size:1.1rem}</style></head>
    <body><div class="card"><h1>✅ Payment Successful!</h1><p>Your order has been confirmed.<br>Check your Telegram for delivery details.</p></div></body>
    </html>
  `);
});

router.get('/cancel', async (req, res) => {
  const { orderId } = req.query;
  if (orderId) {
    const order = await Order.findById(orderId);
    if (order && order.status === 'pending') {
      order.status = 'cancelled';
      await order.save();
    }
  }
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Payment Cancelled</title>
    <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fef2f2}
    .card{text-align:center;padding:3rem;background:white;border-radius:1rem;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    h1{color:#dc2626;font-size:2rem}p{color:#6b7280;font-size:1.1rem}</style></head>
    <body><div class="card"><h1>❌ Payment Cancelled</h1><p>Your order has been cancelled.<br>You can try again in Telegram.</p></div></body>
    </html>
  `);
});

module.exports = router;
