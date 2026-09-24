# WerkAdventure

A lean, self-hosted virtual office in the spirit of [WorkAdventure](https://github.com/workadventure/workadventure):
walk around a pixel-art office, bump into colleagues to talk, and meet in rooms. It runs on a **Raspberry Pi 4**
with one command.

- **Proximity bubbles** — walk up to someone and a video/audio conversation starts (P2P WebRTC, up to 4 people), with a lock button.
- **Meeting rooms** — map zones backed by a LiveKit SFU for larger groups, with screen sharing.
- **Chat, same as WorkAdventure**
  - *Proximity chat*: messages to the people in your bubble or meeting room; not stored, gone on reload.
  - *Matrix chat*: persistent rooms and DMs (a lightweight [Tuwunel](https://github.com/matrix-construct/tuwunel) homeserver is bundled). Public/private rooms, **end-to-end encryption** (irreversible per room), history visibility, folders (Matrix spaces), invitations, public room directory, replies, edits, deletes, reactions + emoji picker, file/image uploads (encrypted in E2EE rooms), typing indicators, read receipts, unread badges, desktop notifications, key backup with a recovery key kept in the browser.
  - User list with online status per floor; **meeting invites** (accept/decline popup, teleports you; limited to 3 per 10 minutes).
- **Multi-floor maps from a text floor plan** — draw the floor in ASCII/YAML, `pnpm mapgen` builds a Tiled map. Stairs link floors. See [docs/maps.md](docs/maps.md).
- Guests pick a name + avatar; optional accounts (admin CLI or self sign-up).

## Deploy on a Raspberry Pi 4

Requirements: Raspberry Pi OS 64-bit (or any arm64/amd64 Linux), 2 GB+ RAM, Docker.

```sh
curl -fsSL https://get.docker.com | sh      # if Docker isn't installed
git clone <this repo> werkadventure && cd werkadventure
./setup.sh
```

`setup.sh` asks for a domain (or uses the LAN IP), generates secrets into `deploy/.env`, starts the stack
and creates an admin account. Idle memory is ~250 MB for the whole stack (tuwunel ~150 MB, server ~30 MB, livekit ~20 MB, caddy ~15 MB).

**Public domain**: point DNS at the Pi, forward TCP 80/443 and UDP 443, TCP 7881 + UDP 50000–50100 (meetings),
TCP/UDP 3478 + UDP 49160–49200 (TURN). Caddy gets a Let's Encrypt certificate automatically.

**LAN without a domain**: Caddy serves `https://<pi-ip>` with its own certificate authority. Browsers need HTTPS
for cameras, so either accept the warning once or trust Caddy's root CA
(`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .` and install it on each device).

> The domain becomes the Matrix server name. Changing it later means starting chat history from scratch.

Day-to-day:

```sh
cd deploy
docker compose exec server werk user add alice --admin   # accounts: add | list | passwd | delete
docker compose pull && docker compose up -d              # update
docker compose logs -f server
```

Maps in `maps/` are mounted into the server, so edited maps go live on page reload. Backups: the Docker volumes
`werkadventure_werk_data` (accounts) and `werkadventure_tuwunel_data` (chat).

## Development

```sh
pnpm install
docker run -d --name werk-tuwunel -p 6167:6167 -e TUWUNEL_SERVER_NAME=localhost \
  -e TUWUNEL_DATABASE_PATH=/var/lib/tuwunel -e TUWUNEL_ADDRESS=0.0.0.0 -e TUWUNEL_ALLOW_REGISTRATION=true \
  -e TUWUNEL_REGISTRATION_TOKEN=devtoken -e TUWUNEL_ALLOW_FEDERATION=false ghcr.io/matrix-construct/tuwunel:latest
docker run -d --name werk-livekit --network host livekit/livekit-server --dev --bind 0.0.0.0
cat > .env <<'ENV'
MATRIX_INTERNAL_URL=http://localhost:6167
MATRIX_SERVER_NAME=localhost
MATRIX_REGISTRATION_TOKEN=devtoken
LIVEKIT_URL=/livekit
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
ALLOW_SIGNUP=true
ENV
pnpm dev            # http://localhost:5173
pnpm test           # unit tests
node e2e/smoke.mjs  # two-browser end-to-end checks (also e2e/matrix.mjs, e2e/meeting.mjs)
```

## Architecture

```
Browser (Phaser 3 + Svelte 5)
  ├─ WebSocket ─────► server   (Node 22: auth, positions, bubbles, signalling, tokens; SQLite)
  ├─ Matrix API ────► tuwunel  (Rust Matrix homeserver, RocksDB)
  ├─ WebRTC SFU ────► livekit  (meeting zones)
  └─ P2P WebRTC ────► coturn   (TURN relay when direct connection fails)
            all behind caddy (HTTPS)
```

## Licenses

The bundled tileset and avatars are generated procedurally by this project.
WorkAdventure's tilesets are licensed for WorkAdventure maps only and are not included.
