import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const env = process.env;
const dataDir = resolve(env.DATA_DIR ?? "../../data");

/** Secrets not given via env are generated once and kept in DATA_DIR/secrets.json. */
function secret(name: string): string {
  if (env[name]) return env[name]!;
  const file = join(dataDir, "secrets.json");
  const all: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  if (!all[name]) {
    all[name] = randomBytes(32).toString("hex");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify(all, null, 2), { mode: 0o600 });
  }
  return all[name];
}

function list(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? "0.0.0.0",
  jwtSecret: new TextEncoder().encode(secret("JWT_SECRET")),
  mapsDir: resolve(env.MAPS_DIR ?? "../../maps"),
  clientDir: env.CLIENT_DIR ? resolve(env.CLIENT_DIR) : null,
  dataDir,
  /** let anyone create an account from the login screen (otherwise: admin CLI only) */
  allowSignup: env.ALLOW_SIGNUP === "true",
  /** allow nickname-only guests */
  allowGuests: env.ALLOW_GUESTS !== "false",
  startMap: env.START_MAP ?? "/maps/hq/floor-4.tmj",
  /** coturn "use-auth-secret" shared secret; empty = STUN only */
  turnSecret: env.TURN_SECRET ?? "",
  turnUrls: list(env.TURN_URLS),
  stunUrls: list(env.STUN_URLS ?? "stun:stun.l.google.com:19302"),
  livekit: {
    url: env.LIVEKIT_URL ?? "",
    apiKey: env.LIVEKIT_API_KEY ?? "",
    apiSecret: env.LIVEKIT_API_SECRET ?? "",
  },
  matrix: {
    /** URL the server uses to reach the homeserver */
    internalUrl: env.MATRIX_INTERNAL_URL ?? "",
    /** URL browsers use; empty = same origin as the app (reverse proxy serves /_matrix) */
    publicUrl: env.MATRIX_PUBLIC_URL ?? "",
    serverName: env.MATRIX_SERVER_NAME ?? "",
    registrationToken: env.MATRIX_REGISTRATION_TOKEN ?? "",
    get passwordSecret() {
      return secret("MATRIX_PASSWORD_SECRET");
    },
  },
  /** meeting invites: max per window, like WorkAdventure (3 per 10 minutes) */
  inviteLimit: { max: 3, windowMs: 10 * 60 * 1000 },
};
