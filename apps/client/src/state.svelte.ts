import type { Avatar, ChatScope, PlayerState } from "@werk/shared";
import type { Connection } from "./net/connection";

export interface Identity {
  sub: string;
  name: string;
  avatar: Avatar;
  registered: boolean;
}

export interface ProximityMessage {
  id: number;
  scope: ChatScope | "system";
  from: string;
  name: string;
  text: string;
  ts: number;
  mine: boolean;
}

export interface Invite {
  from: string;
  name: string;
  map: string;
  x: number;
  y: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

export interface CurrentArea {
  name: string | null;
  silent: boolean;
  meeting: string | null;
  website: string | null;
  matrixRoom: string | null;
}

const TOKEN_KEY = "werk.token";

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const app = $state({
  token: load(TOKEN_KEY),
  identity: null as Identity | null,
  me: null as PlayerState | null,
  map: "",
  mapName: "",
  players: {} as Record<string, PlayerState>,
  bubble: { id: null as string | null, members: [] as string[], locked: false },
  area: { name: null, silent: false, meeting: null, website: null, matrixRoom: null } as CurrentArea,
  online: [] as { id: string; name: string; map: string; matrixId?: string }[],
  proximity: [] as ProximityMessage[],
  typing: {} as Record<string, number>,
  invites: [] as Invite[],
  toasts: [] as Toast[],
  chatOpen: true,
  chatTab: "proximity" as "proximity" | "chat" | "users",
  features: { matrix: false, livekit: false, allowGuests: true, allowSignup: false },
  unreadProximity: 0,
  conn: null as Connection | null,
});

export function saveToken(token: string | null): void {
  app.token = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session-only login */
  }
}

let toastId = 1;
export function toast(text: string, kind: Toast["kind"] = "info"): void {
  const t = { id: toastId++, text, kind };
  app.toasts.push(t);
  setTimeout(() => {
    const i = app.toasts.findIndex((x) => x.id === t.id);
    if (i >= 0) app.toasts.splice(i, 1);
  }, 5000);
}

let msgId = 1;
export function pushProximity(m: Omit<ProximityMessage, "id">): void {
  app.proximity.push({ ...m, id: msgId++ });
  if (app.proximity.length > 300) app.proximity.splice(0, app.proximity.length - 300);
  if (!m.mine && !app.chatOpen) app.unreadProximity++;
}
