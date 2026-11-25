# Pulse POS — Live Server Deployment Guide

## Step 1 — Copy files to server via MobaXterm SCP

In **MobaXterm**:
1. Open your SSH session to the server
2. In the left panel, navigate to your server directory (e.g. `/opt/pulse-pos`)
3. Drag and drop `pulse-pos-deploy.tar.gz` from your PC to the server

Or use the MobaXterm terminal SCP command:
```bash
scp pulse-pos-deploy.tar.gz user@YOUR_SERVER_IP:/opt/pulse-pos/
```

---

## Step 2 — Extract on the server

SSH into the server and run:
```bash
cd /opt/pulse-pos
tar -xzf pulse-pos-deploy.tar.gz
```

---

## Step 3 — Create the `.env` file

```bash
cd /opt/pulse-pos
nano .env
```

Paste and fill in these values:
```env
# Database
POSTGRES_USER=pulse
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_DB=pulse_pos

# Security — generate with: openssl rand -hex 32
SECRET_KEY=CHANGE_ME_64_CHAR_HEX
JWT_REFRESH_SECRET_KEY=CHANGE_ME_64_CHAR_HEX_DIFFERENT

# Redis
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

# Frontend API URL (your server domain or IP)
VITE_API_URL=https://your-domain.com

# CORS — same as above
CORS_ORIGINS=https://your-domain.com

# Seed demo data on first boot (set to true ONCE, then false after)
SEED_ON_STARTUP=true

# Backup encryption
BACKUP_ENCRYPTION_PASSPHRASE=CHANGE_ME_BACKUP_PASSPHRASE

# Grafana
GRAFANA_ADMIN_PASSWORD=CHANGE_ME_GRAFANA_PASSWORD
```

Generate secure keys on your LOCAL Windows PC (PowerShell):
```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

---

## Step 4 — Set your domain in nginx.conf

```bash
sed -i 's/app.example.com/your-domain.com/g' nginx/nginx.conf
```

---

## Step 5 — SSL Certificate

Place your SSL certificate files at:
```
nginx/certs/fullchain.pem
nginx/certs/privkey.pem
```

---

## Step 6 — Build and Start

```bash
cd /opt/pulse-pos
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

---

## Step 7 — Verify

```bash
docker compose -f docker-compose.prod.yml ps
```

All services should show `healthy`. Open: `https://your-domain.com`

---

## Step 8 — After first boot (disable seed)

```env
SEED_ON_STARTUP=false
```
```bash
docker compose -f docker-compose.prod.yml restart backend
```

---

## Login Credentials

### PULSE-DEMO (Mashfak — Super Super Admin)
- Company Code: `PULSE-DEMO`
- Username: `admin` / Password: `admin123`

### OUTFIT (Babar — Store Owner)
- Company Code: `OUTFIT`
- Username: `babar` / Password: `admin123`
