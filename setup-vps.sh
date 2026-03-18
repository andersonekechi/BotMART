#!/bin/bash
# ─────────────────────────────────────────────────────────
# BotMART — Safe VPS Setup Script
#
# This script is SAFE for VPS with existing services.
# It ONLY touches /var/www/botmart/ and creates its own
# Nginx site config, PM2 process, and MongoDB database.
#
# Run as root:  sudo bash setup-vps.sh
# ─────────────────────────────────────────────────────────
set -e

INSTALL_DIR="/var/www/botmart"
APP_NAME="botmart"
PORT=4100
DB_NAME="botmart"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}   BotMART — VPS Setup                ${NC}"
echo -e "${GREEN}   Install dir: ${INSTALL_DIR}        ${NC}"
echo -e "${GREEN}   Port: ${PORT}                      ${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""

# ── Check we're running as root ──────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root: sudo bash setup-vps.sh${NC}"
  exit 1
fi

# ── Step 1: Check prerequisites ─────────────────────────
echo -e "${YELLOW}[1/8] Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
  echo "  Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "  Node.js found: $(node --version)"
fi

if ! command -v pm2 &> /dev/null; then
  echo "  Installing PM2..."
  npm install -g pm2
else
  echo "  PM2 found: $(pm2 --version)"
fi

if ! command -v mongosh &> /dev/null && ! command -v mongo &> /dev/null; then
  echo ""
  echo -e "${YELLOW}  MongoDB not detected on this system.${NC}"
  echo "  You can either:"
  echo "    a) Install MongoDB locally:  https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/"
  echo "    b) Use MongoDB Atlas (free tier) and set the MONGODB_URI in .env"
  echo ""
  read -p "  Continue anyway? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
else
  echo "  MongoDB found"
fi

if ! command -v nginx &> /dev/null; then
  echo "  Installing Nginx..."
  apt-get install -y nginx
else
  echo "  Nginx found"
fi

# ── Step 2: Check port is free ──────────────────────────
echo -e "${YELLOW}[2/8] Checking port ${PORT}...${NC}"
if lsof -i :${PORT} &> /dev/null; then
  echo -e "${RED}  Port ${PORT} is already in use!${NC}"
  echo "  Either free it or change PORT in ecosystem.config.js and .env"
  lsof -i :${PORT}
  read -p "  Continue anyway? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
else
  echo "  Port ${PORT} is free"
fi

# ── Step 3: Create project directory ─────────────────────
echo -e "${YELLOW}[3/8] Setting up ${INSTALL_DIR}...${NC}"
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

if [ -d ".git" ]; then
  echo "  Git repo exists, pulling latest..."
  git pull origin main || git pull origin cursor/telegram-e-commerce-platform-5f42
else
  echo "  Cloning repo..."
  git clone https://github.com/andersonekechi/BotMART.git .
  git checkout main 2>/dev/null || git checkout cursor/telegram-e-commerce-platform-5f42
fi

# ── Step 4: Install server dependencies ──────────────────
echo -e "${YELLOW}[4/8] Installing server dependencies...${NC}"
cd "${INSTALL_DIR}/server"
npm ci --production
cd "${INSTALL_DIR}"

# ── Step 5: Build dashboard ─────────────────────────────
echo -e "${YELLOW}[5/8] Building admin dashboard...${NC}"
cd "${INSTALL_DIR}/dashboard"
npm ci
npx vite build
cd "${INSTALL_DIR}"

rm -rf "${INSTALL_DIR}/server/public"
cp -r "${INSTALL_DIR}/dashboard/dist" "${INSTALL_DIR}/server/public"
echo "  Dashboard built and copied to server/public/"

# ── Step 6: Create .env if not exists ────────────────────
echo -e "${YELLOW}[6/8] Configuring environment...${NC}"
mkdir -p "${INSTALL_DIR}/logs"

if [ ! -f "${INSTALL_DIR}/server/.env" ]; then
  cp "${INSTALL_DIR}/server/.env.example" "${INSTALL_DIR}/server/.env"
  echo ""
  echo -e "${RED}  ╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}  ║  IMPORTANT: You MUST edit server/.env before running ║${NC}"
  echo -e "${RED}  ║                                                       ║${NC}"
  echo -e "${RED}  ║  nano ${INSTALL_DIR}/server/.env            ║${NC}"
  echo -e "${RED}  ║                                                       ║${NC}"
  echo -e "${RED}  ║  Fill in:                                             ║${NC}"
  echo -e "${RED}  ║    - BOT_TOKEN (from @BotFather)                      ║${NC}"
  echo -e "${RED}  ║    - ADMIN_TELEGRAM_IDS (your Telegram user ID)       ║${NC}"
  echo -e "${RED}  ║    - JWT_SECRET (random string)                       ║${NC}"
  echo -e "${RED}  ║    - WEBHOOK_URL (your domain)                        ║${NC}"
  echo -e "${RED}  ║    - MONGODB_URI (if using Atlas)                     ║${NC}"
  echo -e "${RED}  ╚═══════════════════════════════════════════════════════╝${NC}"
  echo ""
  read -p "  Edit .env now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    nano "${INSTALL_DIR}/server/.env"
  fi
else
  echo "  .env already exists, keeping it"
fi

# ── Step 7: Setup Nginx (does NOT touch other sites) ────
echo -e "${YELLOW}[7/8] Setting up Nginx...${NC}"

if [ -f "/etc/nginx/sites-available/botmart" ]; then
  echo "  Nginx config already exists, skipping (edit manually if needed)"
else
  cp "${INSTALL_DIR}/nginx.conf" /etc/nginx/sites-available/botmart

  echo ""
  echo "  What domain/subdomain will BotMART use?"
  echo "  Examples: shop.eliteflipblankreact.xyz, botmart.yourdomain.com"
  read -p "  Domain: " DOMAIN

  if [ -n "$DOMAIN" ]; then
    sed -i "s/YOUR_DOMAIN/${DOMAIN}/g" /etc/nginx/sites-available/botmart
    echo "  Domain set to: ${DOMAIN}"
  else
    echo -e "${YELLOW}  No domain entered — edit /etc/nginx/sites-available/botmart later${NC}"
  fi

  ln -sf /etc/nginx/sites-available/botmart /etc/nginx/sites-enabled/botmart

  if nginx -t 2>&1; then
    systemctl reload nginx
    echo "  Nginx reloaded"
  else
    echo -e "${RED}  Nginx config test failed! Fix it:${NC}"
    echo "  nano /etc/nginx/sites-available/botmart"
    echo "  Then: sudo nginx -t && sudo systemctl reload nginx"
  fi
fi

# ── Step 8: Start with PM2 ──────────────────────────────
echo -e "${YELLOW}[8/8] Starting BotMART with PM2...${NC}"

if pm2 describe ${APP_NAME} &> /dev/null; then
  pm2 restart ${APP_NAME}
  echo "  Restarted existing PM2 process"
else
  cd "${INSTALL_DIR}"
  pm2 start ecosystem.config.js
  echo "  Started new PM2 process"
fi

pm2 save
echo "  PM2 state saved"

# ── Done ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   BotMART setup complete!                            ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "  Files:      ${INSTALL_DIR}/"
echo "  Config:     ${INSTALL_DIR}/server/.env"
echo "  Logs:       ${INSTALL_DIR}/logs/"
echo "  Nginx:      /etc/nginx/sites-available/botmart"
echo "  PM2 name:   ${APP_NAME}"
echo "  Port:       ${PORT}"
echo "  DB:         mongodb://localhost:27017/${DB_NAME}"
echo ""
echo "  Useful commands:"
echo "    pm2 logs botmart          — View live logs"
echo "    pm2 restart botmart       — Restart server"
echo "    pm2 stop botmart          — Stop server"
echo "    pm2 monit                 — Monitor all processes"
echo ""
echo "  If using SSL, run:"
echo "    sudo certbot --nginx -d YOUR_DOMAIN"
echo ""
echo "  Dashboard login:"
echo "    Username: admin"
echo "    Password: admin123"
echo -e "    ${RED}CHANGE THIS PASSWORD IMMEDIATELY in Settings!${NC}"
echo ""
