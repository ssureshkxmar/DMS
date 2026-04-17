#!/bin/bash
# ================================================================
# Suraksha Backend — EC2 Deployment Script
# EC2 IP: 13.232.35.54  (ap-south-1)
# Run this script ON the EC2 instance after SSHing in.
# ================================================================

set -e  # Exit on any error

EC2_IP="13.232.35.54"
REPO_URL="https://github.com/ssureshkxmar/DMS.git"
APP_DIR="/home/ubuntu/suraksha"

echo "========================================"
echo "  Suraksha Backend — Deployment Script"
echo "  EC2: $EC2_IP"
echo "========================================"

# ── Step 1: Update system ─────────────────────────────────────
echo ""
echo "[1/7] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# ── Step 2: Install Docker ─────────────────────────────────────
echo ""
echo "[2/7] Installing Docker & Docker Compose..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker ubuntu
    rm get-docker.sh
    echo "Docker installed."
else
    echo "Docker already installed: $(docker --version)"
fi

if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "Docker Compose installed."
else
    echo "Docker Compose already installed."
fi

# ── Step 3: Clone / update repo ────────────────────────────────
echo ""
echo "[3/7] Cloning/updating repository..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# ── Step 4: Set up .env ────────────────────────────────────────
echo ""
echo "[4/7] Setting up environment..."
cd "$APP_DIR/backend"

if [ ! -f ".env" ]; then
    cp .env.production .env
    echo ""
    echo "⚠️  IMPORTANT: Edit /home/ubuntu/suraksha/backend/.env"
    echo "   Fill in your METERED_DOMAIN, METERED_SECRET_KEY, and"
    echo "   METERED_CREDENTIALS_API_KEY before starting the server."
    echo ""
fi

# ── Step 5: Open firewall ports ────────────────────────────────
echo ""
echo "[5/7] Checking UFW firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 8000/tcp  # Backend API + WebSocket
    sudo ufw allow 80/tcp    # HTTP
    sudo ufw allow 443/tcp   # HTTPS
    echo "Firewall ports 8000, 80, 443 opened."
fi

# ── Step 6: Build and start backend ───────────────────────────
echo ""
echo "[6/7] Building and starting Suraksha backend..."
cd "$APP_DIR/backend"
sudo docker-compose down --remove-orphans 2>/dev/null || true
sudo docker-compose build --no-cache
sudo docker-compose up -d

# ── Step 7: Health check ───────────────────────────────────────
echo ""
echo "[7/7] Health check..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health)
if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅  Backend is UP!"
else
    echo "⚠️  Health check returned HTTP $HTTP_STATUS. Check logs:"
    echo "    sudo docker logs suraksha-backend"
fi

echo ""
echo "========================================"
echo "  DEPLOYMENT COMPLETE"
echo "========================================"
echo ""
echo "  API Base URL  : http://$EC2_IP:8000"
echo "  WebSocket URL : ws://$EC2_IP:8000"
echo "  API Docs      : http://$EC2_IP:8000/docs"
echo "  Swagger UI    : http://$EC2_IP:8000/swagger"
echo ""
echo "  Mobile app settings:"
echo "    API Base URL : http://$EC2_IP:8000"
echo "    WebSocket URL: ws://$EC2_IP:8000"
echo ""
echo "  View logs: sudo docker logs -f suraksha-backend"
echo "========================================"
