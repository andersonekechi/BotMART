const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./config/database');
const { initBot, getBot } = require('./services/bot');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(cors({ origin: process.env.DASHBOARD_URL || '*', credentials: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, slow down' },
});
app.use('/api/', apiLimiter);

app.post('/api/payment/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);

app.post('/api/bot/webhook', (req, res) => {
  const bot = getBot();
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ error: 'Not found' });
  });
});

async function start() {
  await connectDB();

  const Admin = require('./models/Admin');
  const adminCount = await Admin.countDocuments();
  if (adminCount === 0) {
    await Admin.create({
      username: 'admin',
      password: 'admin123',
      role: 'superadmin',
    });
    console.log('Default admin created — username: admin, password: admin123');
    console.log('⚠️  CHANGE THE DEFAULT PASSWORD IMMEDIATELY!');
  }

  initBot();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
  });
}

start().catch(console.error);
