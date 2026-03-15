#!/bin/bash
set -e

echo "=== TG Shop Deployment Script ==="
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 1. Pull latest code
echo "[1/6] Pulling latest code..."
git pull origin main

# 2. Install server dependencies
echo "[2/6] Installing server dependencies..."
cd server
npm ci --production
cd ..

# 3. Build dashboard
echo "[3/6] Building dashboard..."
cd dashboard
npm ci
npx vite build
cd ..

# 4. Copy dashboard build to server public
echo "[4/6] Deploying dashboard to server/public..."
rm -rf server/public
cp -r dashboard/dist server/public

# 5. Create logs directory
mkdir -p logs

# 6. Restart PM2
echo "[5/6] Restarting PM2..."
if pm2 describe tg-shop > /dev/null 2>&1; then
    pm2 restart tg-shop
else
    pm2 start ecosystem.config.js
fi

echo "[6/6] Saving PM2 process list..."
pm2 save

echo ""
echo "=== Deployment Complete ==="
echo "Dashboard: https://yourdomain.com"
echo "API: https://yourdomain.com/api"
echo "Health: https://yourdomain.com/health"
echo ""
echo "Useful commands:"
echo "  pm2 logs tg-shop      - View logs"
echo "  pm2 monit             - Monitor processes"
echo "  pm2 restart tg-shop   - Restart server"
echo "  pm2 stop tg-shop      - Stop server"
