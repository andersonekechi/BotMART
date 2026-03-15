# Telegram E-Commerce Bot + Admin Dashboard

A fully functional Telegram bot for selling digital tools and products, with a modern web-based admin dashboard for managing inventory, orders, and analytics.

## Features

### Telegram Bot
- **Product Catalog** — Browse products by category with images, descriptions, and prices
- **Shopping Cart** — Add/remove items, view cart, clear cart
- **Checkout** — Stripe card payment or crypto payment flow
- **Order Confirmation** — Automatic order confirmation via bot message
- **Product Delivery** — Download links or license keys delivered directly in Telegram
- **Order History** — Users can view their past orders

### Admin Telegram Commands
| Command | Description |
|---------|-------------|
| `/addproduct` | Add a new product (name, description, price, category, stock, delivery type) |
| `/editproduct` | Edit existing product fields |
| `/removeproduct` | Deactivate a product |
| `/adminorders` | View 20 most recent orders |
| `/stats` | View sales statistics (revenue, orders, conversion rate, top products) |

### Admin Web Dashboard
- **Secure JWT authentication** with password management
- **Dashboard overview** — Revenue, orders, conversion rate, recent activity
- **Product management** — Full CRUD, image support, license key management
- **Order management** — View orders, update statuses, confirm payments, view delivery details
- **Sales analytics** — Revenue charts, order trends, top products, payment method breakdown
- **Responsive design** — Works on desktop and mobile

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Bot Framework | node-telegram-bot-api |
| Database | MongoDB + Mongoose |
| Dashboard | React + Vite + Recharts |
| Authentication | JWT (jsonwebtoken + bcryptjs) |
| Payments | Stripe Checkout + Crypto (manual verification) |
| Process Manager | PM2 |
| Reverse Proxy | Nginx |
| Security | Helmet, CORS, Rate Limiting |

## Project Structure

```
├── server/                    # Backend + Bot
│   ├── src/
│   │   ├── config/            # Database, constants
│   │   ├── controllers/       # API controllers
│   │   ├── middleware/         # JWT auth middleware
│   │   ├── models/            # Mongoose models
│   │   ├── routes/            # Express routes
│   │   ├── services/          # Bot logic, payment service
│   │   ├── utils/             # Helpers, seed script
│   │   └── index.js           # Entry point
│   ├── uploads/               # Uploaded files
│   ├── .env.example           # Environment template
│   └── package.json
├── dashboard/                 # React admin frontend
│   ├── src/
│   │   ├── components/        # Layout, ProtectedRoute
│   │   ├── context/           # Auth context
│   │   ├── pages/             # Dashboard, Products, Orders, Analytics, Settings
│   │   ├── services/          # API client
│   │   └── index.css          # Global styles
│   ├── vite.config.js
│   └── package.json
├── ecosystem.config.js        # PM2 configuration
├── nginx.conf                 # Nginx configuration template
├── deploy.sh                  # Deployment script
└── README.md
```

## Prerequisites

- **Node.js** v18+
- **MongoDB** v6+ (local or Atlas)
- **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))
- **Stripe Account** (for card payments, optional)
- **VPS** with Nginx and PM2 (for production)

## Quick Start (Development)

### 1. Clone the Repository

```bash
git clone <repo-url>
cd telegram-e-commerce-platform
```

### 2. Configure Environment Variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your values:

```env
PORT=5000
NODE_ENV=development

# MongoDB (local or Atlas)
MONGODB_URI=mongodb://localhost:27017/telegram_shop

# Telegram Bot
BOT_TOKEN=your_bot_token_from_botfather
ADMIN_TELEGRAM_IDS=your_telegram_user_id

# JWT
JWT_SECRET=generate_a_strong_random_string
JWT_EXPIRES_IN=7d

# Stripe (optional — leave empty to skip)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Crypto (optional)
CRYPTO_WALLET_ADDRESS=your_wallet

# Dashboard URL (for CORS)
DASHBOARD_URL=http://localhost:3000
```

**How to get your Telegram user ID:** Send `/start` to [@userinfobot](https://t.me/userinfobot)

### 3. Install Dependencies

```bash
# Server
cd server
npm install

# Dashboard
cd ../dashboard
npm install
```

### 4. Seed Sample Data (Optional)

```bash
cd server
npm run seed
```

This creates 6 sample products and a default admin (`admin` / `admin123`).

### 5. Start Development Servers

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 — Dashboard:**
```bash
cd dashboard
npm run dev
```

- **Dashboard:** http://localhost:3000
- **API:** http://localhost:5000/api
- **Bot:** Running in polling mode automatically

### 6. Login to Dashboard

Default credentials:
- **Username:** `admin`
- **Password:** `admin123`

> **Change the default password immediately** in Settings.

## Production Deployment (VPS)

### 1. Server Setup

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install MongoDB (or use Atlas)
# See: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/
```

### 2. Clone & Configure

```bash
cd /var/www
git clone <repo-url> tg-shop
cd tg-shop
cp server/.env.example server/.env
nano server/.env  # Fill in production values
```

Set `NODE_ENV=production` and `WEBHOOK_URL=https://yourdomain.com` in your `.env`.

### 3. Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
1. Install dependencies
2. Build the React dashboard
3. Copy the build to `server/public/`
4. Start/restart PM2

### 4. Configure Nginx

```bash
sudo cp nginx.conf /etc/nginx/sites-available/tg-shop
sudo ln -s /etc/nginx/sites-available/tg-shop /etc/nginx/sites-enabled/
# Edit domain name in the config
sudo nano /etc/nginx/sites-available/tg-shop
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 6. PM2 Startup

```bash
pm2 startup
pm2 save
```

PM2 will auto-restart the bot on crash and on server reboot.

### 7. Set Stripe Webhook (if using Stripe)

In your Stripe Dashboard:
1. Go to **Developers → Webhooks**
2. Add endpoint: `https://yourdomain.com/api/payment/stripe-webhook`
3. Listen for: `checkout.session.completed`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in `.env`

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin login |
| GET | `/api/auth/me` | Get current admin |
| PUT | `/api/auth/password` | Change password |

### Products (Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (with pagination, search, filter) |
| GET | `/api/products/:id` | Get single product |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Soft delete (deactivate) |
| DELETE | `/api/products/:id/permanent` | Hard delete |
| POST | `/api/products/:id/license-keys` | Add license keys |

### Orders (Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (with pagination, search, filter) |
| GET | `/api/orders/analytics` | Sales analytics |
| GET | `/api/orders/:id` | Get single order |
| PUT | `/api/orders/:id/status` | Update order status |

### Payment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment/stripe-webhook` | Stripe webhook receiver |
| GET | `/api/payment/success` | Payment success page |
| GET | `/api/payment/cancel` | Payment cancel page |

### Bot
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bot/webhook` | Telegram webhook receiver |

## Telegram Bot Commands

### User Commands
- `/start` — Welcome message
- `/shop` — Browse product catalog
- `/cart` — View shopping cart
- `/orders` — View order history
- `/help` — Show available commands

### Admin Commands
- `/addproduct name | desc | price | category | stock | deliveryType | content` — Add product
- `/editproduct productId | field=value | field=value` — Edit product
- `/removeproduct [productId]` — Remove/deactivate product
- `/adminorders` — View recent orders
- `/stats` — View sales statistics

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | No | `development` or `production` |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `BOT_TOKEN` | Yes | Telegram bot token from BotFather |
| `WEBHOOK_URL` | Prod | Your domain (e.g. `https://shop.example.com`) |
| `ADMIN_TELEGRAM_IDS` | Yes | Comma-separated Telegram user IDs of admins |
| `JWT_SECRET` | Yes | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | No | JWT expiry (default: `7d`) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key for payments |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `CRYPTO_WALLET_ADDRESS` | No | Crypto wallet for manual payments |
| `DASHBOARD_URL` | No | Dashboard URL for CORS (default: `*`) |

## Useful PM2 Commands

```bash
pm2 logs tg-shop        # View real-time logs
pm2 monit                # Monitor CPU/memory
pm2 restart tg-shop      # Restart
pm2 stop tg-shop         # Stop
pm2 delete tg-shop       # Remove from PM2
pm2 status               # List all processes
```

## License

MIT
