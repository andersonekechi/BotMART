# BotMART — Telegram E-Commerce Bot + Admin Dashboard

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
/var/www/botmart/                  # Isolated install directory
├── server/                        # Backend + Bot
│   ├── src/
│   │   ├── config/                # Database, constants
│   │   ├── controllers/           # API controllers
│   │   ├── middleware/            # JWT auth middleware
│   │   ├── models/                # Mongoose models (Product, Order, User, Admin)
│   │   ├── routes/                # Express routes
│   │   ├── services/              # Bot logic, payment service
│   │   ├── utils/                 # Helpers, seed script
│   │   └── index.js               # Entry point
│   ├── uploads/                   # Uploaded files
│   ├── public/                    # Dashboard build (auto-generated)
│   ├── .env.example               # Environment template
│   ├── .env                       # Your secrets (not in git)
│   └── package.json
├── dashboard/                     # React admin frontend
│   ├── src/
│   │   ├── components/            # Layout, ProtectedRoute
│   │   ├── context/               # Auth context
│   │   ├── pages/                 # Dashboard, Products, Orders, Analytics, Settings
│   │   ├── services/              # API client
│   │   └── index.css              # Global styles
│   ├── vite.config.js
│   └── package.json
├── logs/                          # PM2 logs (auto-created)
├── ecosystem.config.js            # PM2 config (app name: botmart, port: 4100)
├── nginx.conf                     # Nginx site config template
├── setup-vps.sh                   # One-command VPS setup (safe for shared VPS)
├── deploy.sh                      # Re-deploy updates
└── README.md
```

## Prerequisites

- **Node.js** v18+
- **MongoDB** v6+ (local or [MongoDB Atlas](https://www.mongodb.com/atlas) free tier)
- **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))
- **Stripe Account** (for card payments, optional)
- **VPS** with Nginx (for production)

---

## VPS Deployment (Recommended)

> **This project is designed for safe deployment on a shared VPS.** Everything lives in `/var/www/botmart/` with its own PM2 process (`botmart`), Nginx site config, port (`4100`), and MongoDB database (`botmart`). It will NOT touch any existing services.

### Option A: Automated Setup (Recommended)

SSH into your VPS and run:

```bash
# Clone the repo into /var/www/botmart
sudo mkdir -p /var/www/botmart
cd /var/www/botmart
sudo git clone https://github.com/andersonekechi/BotMART.git .

# Run the setup script
sudo bash setup-vps.sh
```

The script will:
1. Install Node.js, PM2, Nginx if missing
2. Check that port 4100 is free
3. Install dependencies and build the dashboard
4. Create your `.env` file and prompt you to fill it in
5. Set up Nginx (asks for your domain/subdomain)
6. Start the app with PM2

### Option B: Manual Step-by-Step

#### 1. Clone to isolated directory

```bash
sudo mkdir -p /var/www/botmart
cd /var/www/botmart
sudo git clone https://github.com/andersonekechi/BotMART.git .
```

#### 2. Configure environment

```bash
cp server/.env.example server/.env
nano server/.env
```

Fill in these values:

```env
PORT=4100
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/botmart
BOT_TOKEN=<your token from @BotFather>
WEBHOOK_URL=https://shop.yourdomain.com
ADMIN_TELEGRAM_IDS=<your Telegram user ID>
JWT_SECRET=<random long string>
```

**Get your Telegram user ID:** message [@userinfobot](https://t.me/userinfobot)

#### 3. Install and build

```bash
cd /var/www/botmart/server && npm ci --production
cd /var/www/botmart/dashboard && npm ci && npx vite build
cp -r /var/www/botmart/dashboard/dist /var/www/botmart/server/public
```

#### 4. Seed sample products (optional)

```bash
cd /var/www/botmart/server && npm run seed
```

#### 5. Configure Nginx

```bash
sudo cp /var/www/botmart/nginx.conf /etc/nginx/sites-available/botmart
# Replace YOUR_DOMAIN with your actual domain
sudo sed -i 's/YOUR_DOMAIN/shop.yourdomain.com/g' /etc/nginx/sites-available/botmart
sudo ln -sf /etc/nginx/sites-available/botmart /etc/nginx/sites-enabled/botmart
sudo nginx -t && sudo systemctl reload nginx
```

#### 6. SSL certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d shop.yourdomain.com
```

#### 7. Start with PM2

```bash
cd /var/www/botmart
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # auto-start on reboot
```

#### 8. Stripe webhook (if using Stripe)

In Stripe Dashboard → Developers → Webhooks:
- Endpoint: `https://shop.yourdomain.com/api/payment/stripe-webhook`
- Events: `checkout.session.completed`
- Copy signing secret to `STRIPE_WEBHOOK_SECRET` in `.env`

### Updating (after initial setup)

```bash
cd /var/www/botmart
sudo bash deploy.sh
```

---

## Local Development

### 1. Clone and configure

```bash
git clone https://github.com/andersonekechi/BotMART.git
cd BotMART
cp server/.env.example server/.env
# Edit server/.env — set BOT_TOKEN, ADMIN_TELEGRAM_IDS, JWT_SECRET, MONGODB_URI
```

### 2. Install dependencies

```bash
cd server && npm install
cd ../dashboard && npm install
```

### 3. Run

**Terminal 1 — Backend:**
```bash
cd server && npm run dev
```

**Terminal 2 — Dashboard:**
```bash
cd dashboard && npm run dev
```

- Dashboard: http://localhost:3000
- API: http://localhost:4100/api
- Bot: Runs in polling mode (no webhook needed locally)

### 4. Login to dashboard

- **Username:** `admin`
- **Password:** `admin123`
- **Change this immediately** in Settings

---

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
| GET | `/api/products` | List products (pagination, search, filter) |
| GET | `/api/products/:id` | Get single product |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Soft delete (deactivate) |
| DELETE | `/api/products/:id/permanent` | Hard delete |
| POST | `/api/products/:id/license-keys` | Add license keys |

### Orders (Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (pagination, search, filter) |
| GET | `/api/orders/analytics` | Sales analytics |
| GET | `/api/orders/:id` | Get single order |
| PUT | `/api/orders/:id/status` | Update order status + auto-deliver |

### Payment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment/stripe-webhook` | Stripe webhook receiver |
| GET | `/api/payment/success` | Payment success page |
| GET | `/api/payment/cancel` | Payment cancel page |

### Bot Webhook
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bot/webhook` | Telegram webhook receiver |

## Telegram Bot Commands

### User Commands
- `/start` — Welcome message
- `/shop` — Browse product catalog by category
- `/cart` — View and manage shopping cart
- `/orders` — View order history
- `/help` — Show all commands

### Admin Commands (only for IDs in ADMIN_TELEGRAM_IDS)
- `/addproduct name | desc | price | category | stock | deliveryType | content`
- `/editproduct productId | field=value | field=value`
- `/removeproduct [productId]`
- `/adminorders` — View recent orders
- `/stats` — Revenue, orders, conversion, top products

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4100` | Server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `BOT_TOKEN` | Yes | — | Telegram bot token from BotFather |
| `WEBHOOK_URL` | Prod | — | Your domain for webhook (e.g. `https://shop.example.com`) |
| `ADMIN_TELEGRAM_IDS` | Yes | — | Comma-separated Telegram user IDs |
| `JWT_SECRET` | Yes | — | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | No | `7d` | JWT expiry duration |
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | No | — | Stripe webhook signing secret |
| `CRYPTO_WALLET_ADDRESS` | No | — | Crypto wallet for manual payments |
| `DASHBOARD_URL` | No | `*` | Dashboard URL for CORS |

## Useful Commands

```bash
# PM2
pm2 logs botmart          # Live logs
pm2 monit                 # Monitor CPU/memory
pm2 restart botmart       # Restart
pm2 stop botmart          # Stop
pm2 status                # List all processes

# Nginx
sudo nginx -t                         # Test config
sudo systemctl reload nginx           # Reload
sudo nano /etc/nginx/sites-available/botmart   # Edit config
```

## Isolation Summary

Everything BotMART uses is scoped to avoid conflicting with other services:

| Resource | BotMART Value |
|----------|---------------|
| Install directory | `/var/www/botmart/` |
| PM2 process name | `botmart` |
| Port | `4100` |
| MongoDB database | `botmart` |
| Nginx site config | `/etc/nginx/sites-available/botmart` |
| Log files | `/var/www/botmart/logs/` |

## License

MIT
