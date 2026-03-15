#!/bin/bash
# ─────────────────────────────────────────────────────────
# BotMART — Re-deploy script (for updates after initial setup)
# Run from the project directory: /var/www/botmart/
# ─────────────────────────────────────────────────────────
set -e

INSTALL_DIR="/var/www/botmart"
APP_NAME="botmart"

echo ""
echo "=== BotMART — Deploying Update ==="
echo ""

cd "${INSTALL_DIR}"

echo "[1/6] Pulling latest code..."
git pull

echo "[2/6] Installing server dependencies..."
cd "${INSTALL_DIR}/server"
npm ci --production
cd "${INSTALL_DIR}"

echo "[3/6] Building dashboard..."
cd "${INSTALL_DIR}/dashboard"
npm ci
npx vite build
cd "${INSTALL_DIR}"

echo "[4/6] Copying dashboard build..."
rm -rf "${INSTALL_DIR}/server/public"
cp -r "${INSTALL_DIR}/dashboard/dist" "${INSTALL_DIR}/server/public"

mkdir -p "${INSTALL_DIR}/logs"

echo "[5/6] Restarting PM2..."
if pm2 describe ${APP_NAME} > /dev/null 2>&1; then
  pm2 restart ${APP_NAME}
else
  pm2 start "${INSTALL_DIR}/ecosystem.config.js"
fi

echo "[6/6] Saving PM2 state..."
pm2 save

echo ""
echo "=== Deploy Complete ==="
echo "  pm2 logs botmart   — Check logs"
echo "  pm2 monit          — Monitor"
echo ""
