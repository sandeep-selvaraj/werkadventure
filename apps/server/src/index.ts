import { createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { Avatar, Name } from "@werk/shared";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { GuestRequest, guestLogin, signIdentity, verifyToken, type Identity } from "./auth.js";
import { config } from "./config.js";
import { checkLogin, createAccount, getAccount, updateProfile } from "./db.js";
import { matrixEnabled, matrixIdFor, matrixLogin } from "./matrix.js";
import { World } from "./world.js";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });
const world = new World();

await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });

const DEFAULT_AVATAR: Avatar = { skin: "#e0ac84", hair: "#2b1d14", shirt: "#4f7cff", pants: "#2b2d42", hairStyle: 0 };

async function auth(req: FastifyRequest): Promise<Identity | null> {
  const h = req.headers.authorization;
  return verifyToken(h?.startsWith("Bearer ") ? h.slice(7) : "");
}

async function accountResponse(username: string) {
  const a = getAccount(username)!;
  const identity: Identity = { sub: `u:${a.username}`, name: a.name, avatar: a.avatar ?? DEFAULT_AVATAR, registered: true };
  return { token: await signIdentity(identity), identity, needsProfile: !a.avatar };
}

app.get("/api/config", async () => ({
  startMap: config.startMap,
  allowGuests: config.allowGuests,
  allowSignup: config.allowSignup,
  matrix: matrixEnabled(),
  livekit: !!config.livekit.url,
}));

app.post("/api/guest", async (req, reply) => {
  if (!config.allowGuests) return reply.code(403).send({ error: "Guests are not allowed on this server" });
  const body = GuestRequest.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "invalid" });
  return guestLogin(body.data);
});

const Credentials = z.object({ username: z.string().trim().toLowerCase(), password: z.string() });

app.post("/api/login", async (req, reply) => {
  const body = Credentials.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "invalid" });
  const a = await checkLogin(body.data.username, body.data.password);
  if (!a) return reply.code(401).send({ error: "Wrong username or password" });
  return accountResponse(a.username);
});

app.post("/api/signup", async (req, reply) => {
  if (!config.allowSignup) return reply.code(403).send({ error: "Sign-up is disabled; ask an admin for an account" });
  const body = Credentials.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "invalid" });
  try {
    await createAccount(body.data.username, body.data.password);
  } catch (e) {
    return reply.code(400).send({ error: (e as Error).message });
  }
  return accountResponse(body.data.username);
});

/** Registered users save name + avatar; returns a fresh token carrying them. */
app.put("/api/profile", async (req, reply) => {
  const id = await auth(req);
  if (!id?.registered) return reply.code(401).send({ error: "unauthorized" });
  const body = z.object({ name: Name, avatar: Avatar }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "invalid" });
  updateProfile(id.sub.slice(2), body.data.name, body.data.avatar);
  return accountResponse(id.sub.slice(2));
});

app.post("/api/matrix/session", async (req, reply) => {
  const id = await auth(req);
  if (!id) return reply.code(401).send({ error: "unauthorized" });
  if (!matrixEnabled()) return reply.code(404).send({ error: "chat is not configured" });
  const body = z.object({ deviceId: z.string().optional() }).safeParse(req.body ?? {});
  try {
    return await matrixLogin(id, body.success ? body.data.deviceId : undefined);
  } catch (e) {
    req.log.error(e);
    return reply.code(502).send({ error: "chat server unavailable" });
  }
});

/** LiveKit token for a meeting zone. Room names are hashed so map paths never leak into LiveKit. */
app.post("/api/livekit", async (req, reply) => {
  const id = await auth(req);
  if (!id) return reply.code(401).send({ error: "unauthorized" });
  if (!config.livekit.url) return reply.code(404).send({ error: "meetings are not configured" });
  const body = z.object({ room: z.string().min(1).max(300), participant: z.string().max(64) }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "invalid" });
  const room = createHash("sha256").update(body.data.room).digest("hex").slice(0, 24);
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: body.data.participant,
    name: id.name,
    metadata: JSON.stringify({ avatar: id.avatar }),
    ttl: "6h",
  });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return { url: config.livekit.url, token: await at.toJwt() };
});

/** ICE servers for P2P bubbles; TURN credentials follow coturn's REST API (use-auth-secret). */
app.get("/api/ice", async (req, reply) => {
  const identity = await auth(req);
  if (!identity) return reply.code(401).send({ error: "unauthorized" });
  const servers: { urls: string[]; username?: string; credential?: string }[] = [];
  if (config.stunUrls.length) servers.push({ urls: config.stunUrls });
  if (config.turnSecret && config.turnUrls.length) {
    const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:${identity.sub}`;
    const credential = createHmac("sha1", config.turnSecret).update(username).digest("base64");
    servers.push({ urls: config.turnUrls, username, credential });
  }
  return { iceServers: servers };
});

app.get("/api/health", async () => ({ ok: true, ...world.stats() }));

app.get("/ws", { websocket: true }, async (socket, req) => {
  const token = new URL(req.url, "http://x").searchParams.get("token") ?? "";
  const identity = await verifyToken(token);
  if (!identity) {
    socket.close(4001, "unauthorized");
    return;
  }
  world.connect(socket, identity, matrixIdFor(identity.sub));
});

await app.register(fastifyStatic, { root: config.mapsDir, prefix: "/maps/", decorateReply: false });
if (config.clientDir && existsSync(config.clientDir)) {
  await app.register(fastifyStatic, { root: config.clientDir, prefix: "/", decorateReply: false });
}

await app.listen({ port: config.port, host: config.host });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    world.stop();
    app.close().then(() => process.exit(0));
  });
}
