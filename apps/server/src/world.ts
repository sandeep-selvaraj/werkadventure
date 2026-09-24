import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  BUBBLE_MAX_SIZE,
  BUBBLE_RADIUS,
  C2S,
  type MoveTuple,
  type PlayerState,
  type S2C,
} from "@werk/shared";
import type { Identity } from "./auth.js";
import { BubbleManager } from "./bubbles.js";
import { config } from "./config.js";
import { RateLimiter } from "./rateLimit.js";

const TICK_MS = 100;

interface Conn {
  ws: WebSocket;
  identity: Identity;
  player: PlayerState;
  room: Room | null;
  area: string | null;
  excluded: boolean;
  /** last bubble state sent to this client, to only send changes */
  sentBubble: string;
}

class Room {
  conns = new Map<string, Conn>();
  dirty = new Set<string>();
  bubbles = new BubbleManager({
    joinRadius: BUBBLE_RADIUS,
    leaveRadius: BUBBLE_RADIUS * 1.6,
    maxSize: BUBBLE_MAX_SIZE,
  });
  constructor(public map: string) {}
}

export class World {
  private rooms = new Map<string, Room>();
  private conns = new Map<string, Conn>();
  private invites = new RateLimiter(config.inviteLimit.max, config.inviteLimit.windowMs);
  private onlineDirty = false;
  private timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  connect(ws: WebSocket, identity: Identity, matrixId?: string): void {
    const id = randomUUID().slice(0, 12);
    const conn: Conn = {
      ws,
      identity,
      room: null,
      area: null,
      excluded: false,
      sentBubble: "",
      player: {
        id,
        name: identity.name,
        avatar: identity.avatar,
        x: 0,
        y: 0,
        dir: "down",
        moving: false,
        registered: identity.registered,
        matrixId,
      },
    };
    this.conns.set(id, conn);
    send(conn, { t: "welcome", you: conn.player });

    ws.on("message", (raw) => {
      let msg: C2S;
      try {
        const parsed = C2S.safeParse(JSON.parse(raw.toString()));
        if (!parsed.success) return send(conn, { t: "error", msg: "bad message" });
        msg = parsed.data;
      } catch {
        return;
      }
      this.handle(conn, msg);
    });
    ws.on("close", () => {
      this.leaveRoom(conn);
      this.conns.delete(id);
      this.onlineDirty = true;
    });
  }

  private handle(conn: Conn, msg: C2S): void {
    const p = conn.player;
    switch (msg.t) {
      case "join": {
        this.leaveRoom(conn);
        p.x = msg.x ?? 0;
        p.y = msg.y ?? 0;
        p.moving = false;
        conn.area = null;
        conn.excluded = false;
        let room = this.rooms.get(msg.map);
        if (!room) this.rooms.set(msg.map, (room = new Room(msg.map)));
        conn.room = room;
        send(conn, { t: "players", map: room.map, list: [...room.conns.values()].map((c) => c.player) });
        for (const other of room.conns.values()) send(other, { t: "joined", player: p });
        room.conns.set(p.id, conn);
        room.bubbles.upsert({ id: p.id, x: p.x, y: p.y, excluded: false });
        this.onlineDirty = true;
        break;
      }
      case "move": {
        if (!conn.room) return;
        p.x = msg.x;
        p.y = msg.y;
        p.dir = msg.dir;
        p.moving = msg.moving;
        conn.room.dirty.add(p.id);
        conn.room.bubbles.upsert({ id: p.id, x: p.x, y: p.y, excluded: conn.excluded });
        break;
      }
      case "area": {
        if (!conn.room) return;
        conn.area = msg.area;
        conn.excluded = msg.silent || msg.meeting !== null;
        conn.room.bubbles.upsert({ id: p.id, x: p.x, y: p.y, excluded: conn.excluded });
        break;
      }
      case "chat":
      case "typing": {
        const target = this.conversation(conn);
        if (!target) return send(conn, { t: "error", msg: "You are not in a conversation" });
        const out: S2C =
          msg.t === "chat"
            ? { t: "chat", scope: target.scope, from: p.id, name: p.name, text: msg.text, ts: Date.now() }
            : { t: "typing", scope: target.scope, from: p.id, typing: msg.typing };
        for (const c of target.members) if (msg.t === "chat" || c !== conn) send(c, out);
        break;
      }
      case "signal": {
        // only relay WebRTC signaling between members of the same bubble
        const other = this.conns.get(msg.to);
        const b = conn.room?.bubbles.bubbleOf(p.id);
        if (!other || !b || !b.members.has(msg.to)) return;
        send(other, { t: "signal", from: p.id, data: msg.data });
        break;
      }
      case "lockBubble": {
        const b = conn.room?.bubbles.setLocked(p.id, msg.locked);
        if (b) this.syncBubbles(conn.room!);
        break;
      }
      case "invite": {
        const other = this.conns.get(msg.to);
        if (!other || !conn.room || other === conn) return;
        if (!this.invites.take(conn.identity.sub)) {
          return send(conn, { t: "error", msg: "Too many invitations. Please wait a few minutes." });
        }
        send(other, { t: "invite", from: p.id, name: p.name, map: conn.room.map, x: p.x, y: p.y });
        break;
      }
      case "inviteReply": {
        const other = this.conns.get(msg.from);
        if (other) send(other, { t: "inviteReply", from: p.id, name: p.name, accept: msg.accept });
        break;
      }
      case "ping":
        send(conn, { t: "pong" });
        break;
    }
  }

  /** Who receives a proximity message: the bubble first, else everyone in the same named area. */
  private conversation(conn: Conn): { scope: "bubble" | "area"; members: Conn[] } | null {
    const room = conn.room;
    if (!room) return null;
    const b = room.bubbles.bubbleOf(conn.player.id);
    if (b) return { scope: "bubble", members: [...b.members].map((m) => room.conns.get(m)!).filter(Boolean) };
    if (conn.area) {
      return { scope: "area", members: [...room.conns.values()].filter((c) => c.area === conn.area) };
    }
    return null;
  }

  private leaveRoom(conn: Conn): void {
    const room = conn.room;
    if (!room) return;
    const id = conn.player.id;
    room.conns.delete(id);
    room.dirty.delete(id);
    room.bubbles.remove(id);
    conn.room = null;
    conn.sentBubble = "";
    for (const other of room.conns.values()) send(other, { t: "left", id });
    send(conn, { t: "bubble", id: null, members: [], locked: false });
    this.syncBubbles(room);
    if (room.conns.size === 0) this.rooms.delete(room.map);
  }

  private tick(): void {
    for (const room of this.rooms.values()) {
      if (room.dirty.size) {
        const list: MoveTuple[] = [];
        for (const id of room.dirty) {
          const c = room.conns.get(id);
          if (c) list.push([id, Math.round(c.player.x), Math.round(c.player.y), c.player.dir, c.player.moving]);
        }
        room.dirty.clear();
        const msg = JSON.stringify({ t: "moves", list } satisfies S2C);
        for (const c of room.conns.values()) sendRaw(c, msg);
      }
      room.bubbles.update();
      this.syncBubbles(room);
    }
    if (this.onlineDirty) {
      this.onlineDirty = false;
      const users = [...this.conns.values()]
        .filter((c) => c.room)
        .map((c) => ({ id: c.player.id, name: c.player.name, map: c.room!.map, matrixId: c.player.matrixId }));
      const msg = JSON.stringify({ t: "online", users } satisfies S2C);
      for (const c of this.conns.values()) sendRaw(c, msg);
    }
  }

  private syncBubbles(room: Room): void {
    for (const c of room.conns.values()) {
      const b = room.bubbles.bubbleOf(c.player.id);
      const state: S2C = b
        ? { t: "bubble", id: b.id, members: [...b.members].sort(), locked: b.locked }
        : { t: "bubble", id: null, members: [], locked: false };
      const key = JSON.stringify(state);
      if (key !== c.sentBubble) {
        c.sentBubble = key;
        sendRaw(c, key);
      }
    }
  }

  stats() {
    return { connections: this.conns.size, rooms: [...this.rooms.values()].map((r) => ({ map: r.map, players: r.conns.size })) };
  }
}

function send(c: Conn, msg: S2C): void {
  sendRaw(c, JSON.stringify(msg));
}

function sendRaw(c: Conn, data: string): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
}
