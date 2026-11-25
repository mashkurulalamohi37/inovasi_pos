#!/usr/bin/env bash
set -e

# ==============================================================================
# Pulse POS / Omni POS Core — Server Re-deployment Script
# Target Server: ideaapi@118.179.223.42
# Ports        : Frontend 3008 | Backend 9100 | Postgres 5540
# ==============================================================================

COMPOSE_FILE="docker-compose.server.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    COMPOSE_FILE="docker-compose.yml"
fi

echo "======================================================"
echo "🚀 Starting Pulse POS Re-Deployment..."
echo "======================================================"

# 1. Extract any uploaded archive if present
if [ -f "pulse-pos-deploy.tar.gz" ]; then
    echo "📦 Extracting pulse-pos-deploy.tar.gz..."
    tar -xzf pulse-pos-deploy.tar.gz --overwrite --exclude=.env
    echo "✅ Extraction complete."
elif [ -f "omni-pos-core-deploy.tar.gz" ]; then
    echo "📦 Extracting omni-pos-core-deploy.tar.gz..."
    tar -xzf omni-pos-core-deploy.tar.gz --overwrite --exclude=.env
    echo "✅ Extraction complete."
fi

# 2. Setup or patch .env
touch .env

ensure_env_var() {
    local key="$1"
    local default_val="$2"
    if ! grep -q "^${key}=" .env 2>/dev/null || grep -q "^${key}=[[:space:]]*$" .env 2>/dev/null; then
        # Remove any empty line for key
        sed -i "/^${key}=/d" .env 2>/dev/null || true
        echo "${key}=${default_val}" >> .env
        echo "   + Added ${key} to .env"
    fi
}

echo "🔧 Ensuring .env configuration..."
SECRET_HEX=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | md5sum | head -c 32)
JWT_HEX=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | md5sum | head -c 32)
REDIS_HEX=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | md5sum | head -c 16)
DB_HEX=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | md5sum | head -c 16)

ensure_env_var "POSTGRES_USER" "pulse"
ensure_env_var "POSTGRES_PASSWORD" "pulse123_secure_pw"
ensure_env_var "POSTGRES_DB" "pulse_pos"
ensure_env_var "REDIS_PASSWORD" "redis123_secure_pw"
ensure_env_var "SECRET_KEY" "$SECRET_HEX"
ensure_env_var "JWT_REFRESH_SECRET_KEY" "$JWT_HEX"
ensure_env_var "VITE_API_URL" "http://118.179.223.42:9100/api/v1"
ensure_env_var "CORS_ORIGINS" "http://118.179.223.42:3008"
ensure_env_var "ENVIRONMENT" "production"
ensure_env_var "SEED_ON_STARTUP" "false"

# 3. Stop running containers
echo "🛑 Stopping old containers..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

# 4. Build and start new containers
echo "🔨 Building and starting updated containers..."
docker compose -f "$COMPOSE_FILE" up -d --build

# 5. Check container status
echo ""
echo "======================================================"
echo "📊 Checking container status..."
echo "======================================================"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "======================================================"
echo "🎉 Re-Deployment Finished Successfully!"
echo "======================================================"
echo "🌐 Frontend : http://118.179.223.42:3008"
echo "⚙️  Backend  : http://118.179.223.42:9100/api/v1"
echo "📖 Docs     : http://118.179.223.42:9100/docs"
echo "======================================================"
echo "📋 View logs: docker compose -f $COMPOSE_FILE logs -f"
echo "======================================================"
