#!/usr/bin/env bash
# One-time setup for a Raspberry Pi 4 (or any Linux box with Docker).
#   ./setup.sh            interactive
#   DOMAIN=werk.example.com ./setup.sh -y
set -euo pipefail
cd "$(dirname "$0")/deploy"

yes=false; [[ "${1:-}" == "-y" ]] && yes=true
command -v docker >/dev/null || { echo "Docker is required: curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 plugin is required"; exit 1; }

if [[ -f .env ]] && ! $yes; then
  read -rp ".env already exists. Keep it and just (re)start? [Y/n] " keep
  if [[ "${keep:-Y}" =~ ^[Yy]$ ]]; then docker compose up -d; exit 0; fi
fi

lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
if [[ -z "${DOMAIN:-}" ]]; then
  echo "Enter a domain pointing at this machine (ports 80/443 forwarded) for automatic HTTPS,"
  echo "or press Enter to use the LAN address $lan_ip (self-signed, LAN only)."
  read -rp "Domain [$lan_ip]: " DOMAIN
  DOMAIN=${DOMAIN:-$lan_ip}
fi

rand() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
cat > .env <<ENV
DOMAIN=$DOMAIN
JWT_SECRET=$(rand)
MATRIX_PASSWORD_SECRET=$(rand)
MATRIX_REGISTRATION_TOKEN=$(rand)
LIVEKIT_SECRET=$(rand)
TURN_SECRET=$(rand)
ALLOW_GUESTS=true
ALLOW_SIGNUP=false
START_MAP=/maps/hq/floor-4.tmj
ENV
chmod 600 .env

# public deployments need LiveKit to announce the public IP
if [[ ! "$DOMAIN" =~ ^[0-9.]+$ && "$DOMAIN" != *.local ]]; then
  sed -i 's/use_external_ip: false/use_external_ip: true/' livekit.yaml
fi

echo "Starting WerkAdventure for https://$DOMAIN …"
if docker compose pull 2>/dev/null; then :; else echo "(image not published yet — building locally, this takes a few minutes)"; docker compose build server; fi
docker compose up -d

if ! $yes; then
  read -rp "Create an admin account now? [Y/n] " mk
  if [[ "${mk:-Y}" =~ ^[Yy]$ ]]; then
    read -rp "Username: " u
    docker compose exec server werk user add "$u" --admin
  fi
fi

cat <<MSG

✔ WerkAdventure is running: https://$DOMAIN

Open these ports on your router/firewall if people join from outside your network:
  TCP 80, 443        web + chat
  UDP 443            HTTP/3
  TCP 7881, UDP 50000-50100   meeting rooms (LiveKit)
  TCP/UDP 3478, UDP 49160-49200   TURN relay for proximity video

Manage users:  cd deploy && docker compose exec server werk user add <name>
Edit maps:     edit maps/<building>/*.yaml, run 'pnpm mapgen maps/<building>' (or ask Claude), reload the page
MSG
