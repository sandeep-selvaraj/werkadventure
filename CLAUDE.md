# WerkAdventure

Lean, self-hostable WorkAdventure clone meant to run on a Raspberry Pi 4. pnpm workspace, TypeScript.

- `apps/server` — Fastify + ws. World state, proximity bubbles (`bubbles.ts`), WebRTC signalling, auth (guest JWT + SQLite accounts via `node:sqlite`), Matrix account provisioning (`matrix.ts`), LiveKit tokens. Bundled by esbuild into one file.
- `apps/client` — Vite + Phaser 3 (game) + Svelte 5 (UI). `chat/matrix.svelte.ts` is the Matrix client (matrix-js-sdk + rust crypto); `av/` has local media, P2P mesh and LiveKit meetings.
- `packages/shared` — WS protocol (zod) and map property names.
- `tools/mapgen` — floor-plan YAML → Tiled `.tmj` + procedural tileset. See `docs/maps.md`.
- `deploy/` — docker compose: caddy, server, tuwunel (Matrix), livekit, coturn.

## Commands
- `pnpm test` — vitest (bubbles, rate limit, mapgen)
- `npx tsc -p apps/server --noEmit && npx tsc -p apps/client --noEmit`
- `pnpm mapgen maps/<building> --png` — regenerate maps + previews
- Dev: tuwunel on :6167 (`docker run … ghcr.io/matrix-construct/tuwunel`), `livekit-server --dev` on :7880, then `pnpm dev` (server :8080, vite :5173; `.env` at repo root)
- E2E: `node e2e/smoke.mjs`, `e2e/matrix.mjs`, `e2e/meeting.mjs` (BASE=… to target a deployment)

## Turning a floor-plan screenshot into a map
1. Estimate the grid: ~1 tile per 0.8–1 m, or so that a desk is 1 tile. Keep floors ≤ ~60×40 tiles.
2. Write `maps/<building>/floor-N.yaml`: trace outer and inner walls with `#` (`W` on exterior walls with windows), doors `D` (2 wide), floors per room (`.`, `,`, `_`, `;`), furniture with legend chars, `S` for stairs.
3. Add areas: meeting rooms → `meeting:` + `floor:`, quiet zones → `silent: true`, stairs/elevators → paired `exit:` areas plus an arrival area on each floor.
4. `pnpm mapgen maps/<building> --png`, open the preview PNG, compare with the screenshot, iterate.
5. Every floor needs a start (`@` or `start:`). If the first layout row starts with spaces, write `layout: |2` so YAML keeps the indentation.
6. A small tracing script (walls as polylines in tile coords + flood fill + zone floors) is the fastest way to produce the layout; see how `maps/hq/floor-4.yaml` was laid out (24px of drawing per tile).
