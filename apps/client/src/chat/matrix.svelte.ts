import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  MsgType,
  NotificationCountType,
  Preset,
  RoomEvent,
  RoomMemberEvent,
  Visibility,
  createClient,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { decodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/index.js";
import { toast } from "../state.svelte";
import { decryptAttachment, encryptAttachment, type EncryptedFile } from "./attachments";

export type HistoryVisibility = "shared" | "joined" | "invited";

export interface RoomSummary {
  id: string;
  name: string;
  membership: "join" | "invite";
  isSpace: boolean;
  isDm: boolean;
  dmUserId: string | null;
  encrypted: boolean;
  unread: number;
  highlight: number;
  lastTs: number;
  lastText: string;
  /** spaces this room is a child of */
  parents: string[];
  inviter: string | null;
  memberCount: number;
}

export interface Reaction {
  key: string;
  count: number;
  mine: string | null;
  senders: string[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  senderName: string;
  ts: number;
  kind: "text" | "emote" | "notice" | "image" | "file" | "video" | "audio" | "state" | "undecryptable" | "deleted";
  body: string;
  mxc?: string;
  file?: EncryptedFile;
  mimetype?: string;
  size?: number;
  replyTo?: { id: string; senderName: string; body: string };
  reactions: Reaction[];
  edited: boolean;
  pending: boolean;
  mine: boolean;
}

const RECOVERY_KEY = (userId: string) => `werk.matrix.recovery.${userId}`;
const DEVICE_KEY = (sub: string) => `werk.matrix.device.${sub}`;

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

/** Persistent chat over Matrix: rooms, DMs, folders (spaces), E2EE with key backup. */
class MatrixChat {
  status = $state<"off" | "connecting" | "ready" | "error">("off");
  userId = $state("");
  rooms = $state.raw<RoomSummary[]>([]);
  activeRoomId = $state<string | null>(null);
  timeline = $state.raw<ChatMessage[]>([]);
  typing = $state.raw<string[]>([]);
  readBy = $state.raw<string[]>([]);
  canLoadMore = $state(true);
  /** "none": no backup yet · "locked": backup exists but this browser lacks the key · "ok" */
  backup = $state<"unknown" | "none" | "locked" | "ok">("unknown");
  totalUnread = $state(0);

  client: MatrixClient | null = null;
  private pendingKey: Uint8Array<ArrayBuffer> | null = null;
  private refreshQueued = false;
  private receipts = new Map<string, string>();

  async start(token: string, sub: string) {
    if (this.status !== "off") return;
    this.status = "connecting";
    try {
      const deviceId = lsGet(DEVICE_KEY(sub)) ?? undefined;
      const res = await fetch("/api/matrix/session", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (res.status === 404) {
        this.status = "off";
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error ?? "chat unavailable");
      const s = (await res.json()) as { homeserverUrl: string; userId: string; accessToken: string; deviceId: string };
      lsSet(DEVICE_KEY(sub), s.deviceId);
      this.userId = s.userId;

      const client = createClient({
        baseUrl: s.homeserverUrl || location.origin,
        accessToken: s.accessToken,
        userId: s.userId,
        deviceId: s.deviceId,
        timelineSupport: true,
        disableVoip: true,
        cryptoCallbacks: {
          getSecretStorageKey: async ({ keys }) => {
            const key = this.pendingKey ?? this.storedRecoveryKey();
            if (!key) return null;
            return [Object.keys(keys)[0], key];
          },
        },
      });
      this.client = client;
      // one crypto store per Matrix user, so switching guest <-> account in one browser works
      await client.initRustCrypto({ cryptoDatabasePrefix: `werk-${s.userId}` });

      client.on(ClientEvent.Sync, (state) => {
        if (state === "PREPARED" || state === "SYNCING") {
          if (this.status !== "ready") {
            this.status = "ready";
            this.checkBackup();
          }
          this.queueRefresh();
        }
      });
      client.on(RoomEvent.Timeline, (ev, room, toStart, _removed, data) => {
        this.queueRefresh();
        if (toStart || !data?.liveEvent || !room) return;
        this.maybeNotify(ev, room);
      });
      client.on(RoomEvent.Redaction, () => this.queueRefresh());
      client.on(RoomEvent.Receipt, () => this.queueRefresh());
      client.on(RoomEvent.MyMembership, () => this.queueRefresh());
      client.on(RoomEvent.Name, () => this.queueRefresh());
      client.on(RoomEvent.LocalEchoUpdated, () => this.queueRefresh());
      client.on(RoomMemberEvent.Typing, () => this.queueRefresh());
      client.on(MatrixEventEvent.Decrypted, () => this.queueRefresh());
      client.on(ClientEvent.AccountData, () => this.queueRefresh());

      await client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true });
    } catch (e) {
      console.error(e);
      this.status = "error";
      toast(`Chat unavailable: ${(e as Error).message}`, "error");
    }
  }

  stop() {
    this.client?.stopClient();
    this.client = null;
    this.status = "off";
  }

  // ---------------------------------------------------------------- state

  private queueRefresh() {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh();
    });
  }

  private dmMap(): Map<string, string> {
    const direct = (this.client?.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>;
    const m = new Map<string, string>();
    for (const [user, rooms] of Object.entries(direct)) for (const r of rooms) m.set(r, user);
    return m;
  }

  private refresh() {
    const c = this.client;
    if (!c) return;
    const dms = this.dmMap();
    const parents = new Map<string, string[]>();
    const all = c.getRooms().filter((r) => ["join", "invite"].includes(r.getMyMembership()));
    for (const r of all) {
      if (!r.isSpaceRoom()) continue;
      for (const ev of r.currentState.getStateEvents(EventType.SpaceChild)) {
        if (!ev.getContent()?.via) continue;
        const child = ev.getStateKey()!;
        parents.set(child, [...(parents.get(child) ?? []), r.roomId]);
      }
    }
    this.rooms = all
      .map((r) => {
        const last = [...r.getLiveTimeline().getEvents()].reverse().find((e) => isVisibleMessage(e));
        const inviter = r.getMyMembership() === "invite" ? r.getDMInviter() ?? r.currentState.getMember(c.getUserId()!)?.events.member?.getSender() ?? null : null;
        const isDm = dms.has(r.roomId) || (r.getMyMembership() === "invite" && !!r.getDMInviter());
        return {
          id: r.roomId,
          name: r.name || "Unnamed room",
          membership: r.getMyMembership() as "join" | "invite",
          isSpace: r.isSpaceRoom(),
          isDm,
          dmUserId: dms.get(r.roomId) ?? r.getDMInviter() ?? null,
          encrypted: r.hasEncryptionStateEvent(),
          unread: r.getUnreadNotificationCount(NotificationCountType.Total),
          highlight: r.getUnreadNotificationCount(NotificationCountType.Highlight),
          lastTs: last?.getTs() ?? r.getLastActiveTimestamp() ?? 0,
          lastText: last ? preview(last) : "",
          parents: parents.get(r.roomId) ?? [],
          inviter,
          memberCount: r.getJoinedMemberCount(),
        } satisfies RoomSummary;
      })
      .sort((a, b) => b.lastTs - a.lastTs);
    this.totalUnread = this.rooms.filter((r) => !r.isSpace).reduce((s, r) => s + r.unread + (r.membership === "invite" ? 1 : 0), 0);
    this.refreshActive();
  }

  private refreshActive() {
    const c = this.client;
    const room = this.activeRoomId ? c?.getRoom(this.activeRoomId) : null;
    if (!c || !room) {
      this.timeline = [];
      this.typing = [];
      this.readBy = [];
      return;
    }
    const events = room.getLiveTimeline().getEvents();
    this.timeline = buildTimeline(room, events, c.getUserId()!);
    this.typing = room
      .getMembers()
      .filter((m) => m.typing && m.userId !== c.getUserId())
      .map((m) => m.name);
    const last = [...events].reverse().find((e) => isVisibleMessage(e));
    this.readBy = last
      ? room
          .getUsersReadUpTo(last)
          .filter((u) => u !== c.getUserId() && u !== last.getSender())
          .map((u) => room.getMember(u)?.name ?? u)
      : [];
    const lastId = last?.getId();
    if (last && lastId && !lastId.startsWith("~") && document.visibilityState === "visible" && this.receipts.get(room.roomId) !== lastId) {
      // once per event: sending a receipt triggers a Receipt event, which refreshes again
      this.receipts.set(room.roomId, lastId);
      if (room.getEventReadUpTo(c.getUserId()!) !== lastId) c.sendReadReceipt(last).catch(() => {});
    }
  }

  open(roomId: string | null) {
    this.activeRoomId = roomId;
    this.canLoadMore = true;
    this.refreshActive();
  }

  async loadMore() {
    const room = this.activeRoomId ? this.client?.getRoom(this.activeRoomId) : null;
    if (!room || !this.client) return;
    const before = room.getLiveTimeline().getEvents().length;
    await this.client.scrollback(room, 30);
    if (room.getLiveTimeline().getEvents().length === before) this.canLoadMore = false;
    this.refreshActive();
  }

  memberName(roomId: string, userId: string): string {
    return this.client?.getRoom(roomId)?.getMember(userId)?.name ?? userId;
  }

  members(roomId: string): { userId: string; name: string; membership: string }[] {
    const room = this.client?.getRoom(roomId);
    if (!room) return [];
    return room.getMembers().map((m) => ({ userId: m.userId, name: m.name, membership: m.membership ?? "" }));
  }

  // ---------------------------------------------------------------- actions

  async send(roomId: string, text: string, replyTo?: ChatMessage) {
    const content: Record<string, unknown> = { msgtype: MsgType.Text, body: text };
    if (text.startsWith("/me ")) {
      content.msgtype = MsgType.Emote;
      content.body = text.slice(4);
    }
    if (replyTo) content["m.relates_to"] = { "m.in_reply_to": { event_id: replyTo.id } };
    await this.client!.sendMessage(roomId, content as never);
  }

  async edit(roomId: string, msg: ChatMessage, text: string) {
    await this.client!.sendMessage(roomId, {
      msgtype: MsgType.Text,
      body: `* ${text}`,
      "m.new_content": { msgtype: MsgType.Text, body: text },
      "m.relates_to": { rel_type: "m.replace", event_id: msg.id },
    } as never);
  }

  async remove(roomId: string, eventId: string) {
    await this.client!.redactEvent(roomId, eventId);
  }

  async react(roomId: string, msg: ChatMessage, key: string) {
    const existing = msg.reactions.find((r) => r.key === key)?.mine;
    if (existing) return this.client!.redactEvent(roomId, existing);
    await this.client!.sendEvent(roomId, EventType.Reaction, {
      "m.relates_to": { rel_type: "m.annotation", event_id: msg.id, key },
    } as never);
  }

  setTyping(roomId: string, typing: boolean) {
    this.client?.sendTyping(roomId, typing, 6000).catch(() => {});
  }

  async upload(roomId: string, file: File) {
    const c = this.client!;
    const room = c.getRoom(roomId);
    const encrypted = !!room?.hasEncryptionStateEvent();
    const kind = file.type.startsWith("image/") ? MsgType.Image : file.type.startsWith("video/") ? MsgType.Video : file.type.startsWith("audio/") ? MsgType.Audio : MsgType.File;
    const info: Record<string, unknown> = { mimetype: file.type, size: file.size };
    if (kind === MsgType.Image) Object.assign(info, await imageSize(file));
    const content: Record<string, unknown> = { msgtype: kind, body: file.name, info };
    if (encrypted) {
      const { data, file: meta } = await encryptAttachment(await file.arrayBuffer());
      const up = await c.uploadContent(new Blob([data]), { type: "application/octet-stream", includeFilename: false });
      content.file = { ...meta, url: up.content_uri, mimetype: file.type };
    } else {
      const up = await c.uploadContent(file, { type: file.type, name: file.name });
      content.url = up.content_uri;
    }
    await c.sendMessage(roomId, content as never);
  }

  /** Download (and decrypt) media as an object URL; Matrix media needs an auth header. */
  private mediaCache = new Map<string, Promise<string>>();
  media(msg: Pick<ChatMessage, "mxc" | "file" | "mimetype">, thumb = false): Promise<string> {
    const mxc = msg.file?.url ?? msg.mxc;
    if (!mxc || !this.client) return Promise.reject(new Error("no media"));
    const key = `${mxc}:${thumb && !msg.file}`;
    let p = this.mediaCache.get(key);
    if (!p) {
      const url = thumb && !msg.file ? this.client.mxcUrlToHttp(mxc, 480, 360, "scale", false, true, true) : this.client.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, true, true);
      p = fetch(url!, { headers: { authorization: `Bearer ${this.client.getAccessToken()}` } })
        .then((r) => {
          if (!r.ok) throw new Error(`media ${r.status}`);
          return r.arrayBuffer();
        })
        .then(async (buf) => {
          const data = msg.file ? await decryptAttachment(buf, msg.file) : buf;
          return URL.createObjectURL(new Blob([data], { type: msg.mimetype || "application/octet-stream" }));
        });
      p.catch(() => this.mediaCache.delete(key));
      this.mediaCache.set(key, p);
    }
    return p;
  }

  async createRoom(opts: { name: string; topic?: string; isPublic: boolean; encrypted: boolean; history: HistoryVisibility; parent?: string | null }) {
    const c = this.client!;
    const initial_state: { type: string; state_key: string; content: Record<string, unknown> }[] = [
      { type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: opts.history } },
    ];
    if (opts.encrypted && !opts.isPublic) initial_state.push({ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } });
    const { room_id } = await c.createRoom({
      name: opts.name,
      topic: opts.topic || undefined,
      preset: opts.isPublic ? Preset.PublicChat : Preset.PrivateChat,
      visibility: opts.isPublic ? Visibility.Public : Visibility.Private,
      initial_state,
    });
    if (opts.parent) await this.addToSpace(opts.parent, room_id);
    return room_id;
  }

  async createSpace(name: string, isPublic: boolean) {
    const { room_id } = await this.client!.createRoom({
      name,
      preset: isPublic ? Preset.PublicChat : Preset.PrivateChat,
      visibility: isPublic ? Visibility.Public : Visibility.Private,
      creation_content: { type: "m.space" },
      power_level_content_override: { events_default: 100 },
    });
    return room_id;
  }

  async addToSpace(spaceId: string, roomId: string) {
    const server = this.userId.split(":").slice(1).join(":");
    await this.client!.sendStateEvent(spaceId, EventType.SpaceChild, { via: [server] } as never, roomId);
  }

  async removeFromSpace(spaceId: string, roomId: string) {
    await this.client!.sendStateEvent(spaceId, EventType.SpaceChild, {} as never, roomId);
  }

  /** Open (or create) the direct-message room with a user; DMs are always encrypted. */
  async dm(userId: string): Promise<string> {
    const c = this.client!;
    const dms = this.dmMap();
    for (const [roomId, u] of dms) {
      const room = c.getRoom(roomId);
      if (u === userId && room && room.getMyMembership() === "join") return roomId;
    }
    const { room_id } = await c.createRoom({
      preset: Preset.TrustedPrivateChat,
      is_direct: true,
      invite: [userId],
      initial_state: [{ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    const direct = { ...((c.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>) };
    direct[userId] = [...(direct[userId] ?? []), room_id];
    await c.setAccountData(EventType.Direct, direct as never);
    // Wait until the invite has synced: room keys are only shared with members we know about,
    // so a message sent earlier would be unreadable for the invitee.
    for (let i = 0; i < 50; i++) {
      const m = c.getRoom(room_id)?.getMember(userId)?.membership;
      if (m === "invite" || m === "join") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return room_id;
  }

  async acceptInvite(roomId: string) {
    const c = this.client!;
    const room = c.getRoom(roomId);
    const inviter = room?.getDMInviter();
    await c.joinRoom(roomId);
    if (inviter) {
      const direct = { ...((c.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>) };
      if (!direct[inviter]?.includes(roomId)) {
        direct[inviter] = [...(direct[inviter] ?? []), roomId];
        await c.setAccountData(EventType.Direct, direct as never);
      }
    }
  }

  async join(idOrAlias: string) {
    const room = await this.client!.joinRoom(idOrAlias);
    return room.roomId;
  }

  /** Join the room linked to a map area ("#lobby" / "lobby" / "!id:server"), creating it on first use. */
  async joinAreaRoom(ref: string, name: string): Promise<string> {
    const server = this.userId.split(":").slice(1).join(":");
    const local = ref.replace(/^#/, "").split(":")[0];
    const alias = ref.startsWith("!") ? ref : `#${local}:${server}`;
    try {
      return await this.join(alias);
    } catch (e) {
      if (ref.startsWith("!")) throw e;
      const { room_id } = await this.client!.createRoom({
        name,
        room_alias_name: local,
        preset: Preset.PublicChat,
        visibility: Visibility.Public,
      });
      return room_id;
    }
  }

  async leave(roomId: string) {
    await this.client!.leave(roomId);
    if (this.activeRoomId === roomId) this.open(null);
  }

  async invite(roomId: string, userId: string) {
    await this.client!.invite(roomId, userId);
  }

  async publicRooms(): Promise<{ id: string; name: string; topic: string; members: number; alias?: string }[]> {
    const res = await this.client!.publicRooms({ limit: 100 });
    return res.chunk.map((r) => ({ id: r.room_id, name: r.name ?? r.canonical_alias ?? r.room_id, topic: r.topic ?? "", members: r.num_joined_members, alias: r.canonical_alias }));
  }

  // ---------------------------------------------------------------- E2EE key backup

  private storedRecoveryKey(): Uint8Array<ArrayBuffer> | null {
    const k = lsGet(RECOVERY_KEY(this.userId));
    if (!k) return null;
    try {
      return decodeRecoveryKey(k) as Uint8Array<ArrayBuffer>;
    } catch {
      return null;
    }
  }

  async checkBackup() {
    const crypto = this.client?.getCrypto();
    if (!crypto) return;
    try {
      const ready = await crypto.isSecretStorageReady();
      const info = await crypto.getKeyBackupInfo();
      if (!info && !ready) {
        this.backup = "none";
        return;
      }
      if (this.storedRecoveryKey()) {
        this.backup = "ok";
        // make sure this device can read the backup and uses it
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => {});
        await crypto.checkKeyBackupAndEnable();
        crypto.restoreKeyBackup().then(() => this.queueRefresh()).catch(() => {});
        return;
      }
      this.backup = (await crypto.getSessionBackupPrivateKey()) ? "ok" : "locked";
    } catch (e) {
      console.warn("backup check failed", e);
    }
  }

  /** First-time setup: create a recovery key, secret storage, cross-signing and key backup. Returns the key to show. */
  async setupBackup(): Promise<string> {
    const c = this.client!;
    const crypto = c.getCrypto()!;
    const key = await crypto.createRecoveryKeyFromPassphrase();
    this.pendingKey = key.privateKey as Uint8Array<ArrayBuffer>;
    try {
      await crypto.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: async (makeRequest) => {
          await makeRequest(null);
        },
      });
      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => key,
        setupNewSecretStorage: true,
        setupNewKeyBackup: true,
      });
    } finally {
      this.pendingKey = null;
    }
    lsSet(RECOVERY_KEY(this.userId), key.encodedPrivateKey!);
    this.backup = "ok";
    return key.encodedPrivateKey!;
  }

  /** On a new browser: unlock the backup with the saved recovery key. */
  async unlockBackup(recoveryKey: string) {
    const crypto = this.client!.getCrypto()!;
    const raw = decodeRecoveryKey(recoveryKey.trim()) as Uint8Array<ArrayBuffer>;
    this.pendingKey = raw;
    try {
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.checkKeyBackupAndEnable();
      await crypto.restoreKeyBackup();
    } finally {
      this.pendingKey = null;
    }
    lsSet(RECOVERY_KEY(this.userId), recoveryKey.trim());
    this.backup = "ok";
    this.queueRefresh();
  }

  recoveryKey(): string | null {
    return lsGet(RECOVERY_KEY(this.userId));
  }

  // ---------------------------------------------------------------- notifications

  private maybeNotify(ev: MatrixEvent, room: Room) {
    if (ev.getSender() === this.client?.getUserId()) return;
    if (!isVisibleMessage(ev) && ev.getType() !== EventType.RoomMessageEncrypted) return;
    const visible = document.visibilityState === "visible";
    if (visible && this.activeRoomId === room.roomId) return;
    const name = room.getMember(ev.getSender()!)?.name ?? ev.getSender();
    const show = () => {
      if (!visible && "Notification" in window && Notification.permission === "granted") {
        const n = new Notification(room.name === name ? name! : `${name} in ${room.name}`, { body: preview(ev), tag: room.roomId });
        n.onclick = () => {
          window.focus();
          window.dispatchEvent(new CustomEvent("werk:open-room", { detail: room.roomId }));
        };
      }
    };
    // wait for decryption before showing text
    if (ev.isBeingDecrypted() || ev.getType() === EventType.RoomMessageEncrypted) ev.once(MatrixEventEvent.Decrypted, show);
    else show();
  }
}

// -------------------------------------------------------------------- helpers

function isVisibleMessage(e: MatrixEvent): boolean {
  if (e.getType() !== EventType.RoomMessage) return false;
  const rel = e.getContent()?.["m.relates_to"];
  return rel?.rel_type !== "m.replace";
}

function preview(e: MatrixEvent): string {
  if (e.isRedacted()) return "Message deleted";
  if (e.isDecryptionFailure()) return "🔒 Encrypted message";
  const c = e.getContent();
  switch (c.msgtype) {
    case MsgType.Image:
      return "📷 Image";
    case MsgType.File:
      return `📎 ${c.body}`;
    case MsgType.Video:
      return "🎬 Video";
    case MsgType.Audio:
      return "🎵 Audio";
    default:
      return stripReplyFallback(String(c.body ?? ""));
  }
}

function stripReplyFallback(body: string): string {
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("> ")) i++;
  if (i > 0 && lines[i] === "") i++;
  return lines.slice(i).join("\n");
}

function buildTimeline(room: Room, events: MatrixEvent[], me: string): ChatMessage[] {
  const edits = new Map<string, MatrixEvent>();
  const reactions = new Map<string, Map<string, Reaction>>();
  for (const e of events) {
    if (e.isRedacted()) continue;
    const rel = e.getContent()?.["m.relates_to"] ?? e.getRelation();
    if (!rel?.event_id) continue;
    if (e.getType() === EventType.RoomMessage && rel.rel_type === "m.replace" && e.getSender()) {
      const prev = edits.get(rel.event_id);
      if (!prev || prev.getTs() < e.getTs()) edits.set(rel.event_id, e);
    } else if (e.getType() === EventType.Reaction && rel.rel_type === "m.annotation" && rel.key) {
      let m = reactions.get(rel.event_id);
      if (!m) reactions.set(rel.event_id, (m = new Map()));
      const r = m.get(rel.key) ?? { key: rel.key, count: 0, mine: null, senders: [] };
      r.count++;
      r.senders.push(room.getMember(e.getSender()!)?.name ?? e.getSender()!);
      if (e.getSender() === me) r.mine = e.getId() ?? null;
      m.set(rel.key, r);
    }
  }

  const byId = new Map(events.map((e) => [e.getId(), e]));
  const out: ChatMessage[] = [];
  for (const e of events) {
    const type = e.getType();
    const id = e.getId() ?? `local-${out.length}`;
    const sender = e.getSender() ?? "";
    const base = {
      id,
      sender,
      senderName: room.getMember(sender)?.name ?? sender,
      ts: e.getTs(),
      reactions: [...(reactions.get(id)?.values() ?? [])],
      edited: false,
      pending: !!e.status,
      mine: sender === me,
    };
    if (type === EventType.RoomMember) {
      const c = e.getContent();
      const prev = e.getPrevContent();
      const who = c.displayname ?? e.getStateKey();
      let text = "";
      if (c.membership === "join" && prev.membership !== "join") text = `${who} joined`;
      else if (c.membership === "leave" && prev.membership === "join") text = `${who} left`;
      else if (c.membership === "invite") text = `${base.senderName} invited ${who}`;
      if (text) out.push({ ...base, kind: "state", body: text });
      continue;
    }
    if (type === EventType.RoomEncryption) {
      out.push({ ...base, kind: "state", body: "🔒 End-to-end encryption enabled" });
      continue;
    }
    if (type === EventType.RoomCreate) {
      out.push({ ...base, kind: "state", body: `${base.senderName} created the room` });
      continue;
    }
    if (e.isDecryptionFailure() || type === EventType.RoomMessageEncrypted) {
      out.push({ ...base, kind: "undecryptable", body: "🔒 Unable to decrypt this message (it was sent before this device joined, or your key backup is locked)" });
      continue;
    }
    if (type !== EventType.RoomMessage) continue;
    if (e.isRedacted()) {
      out.push({ ...base, kind: "deleted", body: "Message deleted" });
      continue;
    }
    const orig = e.getContent();
    if (orig["m.relates_to"]?.rel_type === "m.replace") continue;
    const edit = edits.get(id);
    const c = (edit?.getContent()["m.new_content"] as Record<string, unknown> | undefined) ?? orig;
    const msgtype = String(c.msgtype ?? orig.msgtype);
    const info = (orig.info ?? {}) as { mimetype?: string; size?: number };
    const msg: ChatMessage = {
      ...base,
      kind: msgtype === MsgType.Image ? "image" : msgtype === MsgType.File ? "file" : msgtype === MsgType.Video ? "video" : msgtype === MsgType.Audio ? "audio" : msgtype === MsgType.Emote ? "emote" : msgtype === MsgType.Notice ? "notice" : "text",
      body: stripReplyFallback(String(c.body ?? "")),
      mxc: orig.url as string | undefined,
      file: orig.file as EncryptedFile | undefined,
      mimetype: info.mimetype ?? (orig.file as EncryptedFile | undefined)?.mimetype,
      size: info.size,
      edited: !!edit,
    };
    const replyId = orig["m.relates_to"]?.["m.in_reply_to"]?.event_id;
    if (replyId) {
      const target = byId.get(replyId) ?? room.findEventById(replyId);
      msg.replyTo = {
        id: replyId,
        senderName: target ? room.getMember(target.getSender()!)?.name ?? target.getSender()! : "",
        body: target ? preview(target) : "Original message not loaded",
      };
    }
    out.push(msg);
  }
  return out;
}

function imageSize(file: File): Promise<{ w?: number; h?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve({});
    img.src = url;
  });
}

export const chat = new MatrixChat();
