import { z } from "zod";

export * from "./mapProps.js";

/** Pixel radius within which two players join the same bubble (WorkAdventure uses ~48px from each other's edge). */
export const BUBBLE_RADIUS = 64;
/** Max members in a P2P bubble, same as WorkAdventure. */
export const BUBBLE_MAX_SIZE = 4;
export const TILE_SIZE = 32;

export const Direction = z.enum(["up", "down", "left", "right"]);
export type Direction = z.infer<typeof Direction>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const Avatar = z.object({
  skin: hex,
  hair: hex,
  shirt: hex,
  pants: hex,
  hairStyle: z.number().int().min(0).max(3),
});
export type Avatar = z.infer<typeof Avatar>;

export const Name = z.string().trim().min(1).max(24);

export interface PlayerState {
  id: string;
  name: string;
  avatar: Avatar;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  /** true for registered accounts, false for guests */
  registered: boolean;
  matrixId?: string;
}

/** Compact movement tuple: [id, x, y, dir, moving] */
export type MoveTuple = [string, number, number, Direction, boolean];

// ---------- client -> server ----------

export const C2S = z.discriminatedUnion("t", [
  z.object({ t: z.literal("join"), map: z.string().min(1).max(200), x: z.number().optional(), y: z.number().optional() }),
  z.object({
    t: z.literal("move"),
    x: z.number().finite(),
    y: z.number().finite(),
    dir: Direction,
    moving: z.boolean(),
  }),
  z.object({ t: z.literal("chat"), text: z.string().trim().min(1).max(2000) }),
  z.object({ t: z.literal("typing"), typing: z.boolean() }),
  z.object({ t: z.literal("signal"), to: z.string(), data: z.unknown() }),
  z.object({ t: z.literal("lockBubble"), locked: z.boolean() }),
  /** Client reports the zone it stands in: area chat scope, silent flag, meeting (LiveKit) room. */
  z.object({
    t: z.literal("area"),
    area: z.string().max(100).nullable(),
    silent: z.boolean(),
    meeting: z.string().max(100).nullable(),
  }),
  z.object({ t: z.literal("invite"), to: z.string() }),
  z.object({ t: z.literal("inviteReply"), from: z.string(), accept: z.boolean() }),
  z.object({ t: z.literal("ping") }),
]);
export type C2S = z.infer<typeof C2S>;

// ---------- server -> client ----------

export type ChatScope = "bubble" | "area";

export type S2C =
  | { t: "welcome"; you: PlayerState }
  | { t: "players"; map: string; list: PlayerState[] }
  | { t: "joined"; player: PlayerState }
  | { t: "left"; id: string }
  | { t: "moves"; list: MoveTuple[] }
  | { t: "bubble"; id: string | null; members: string[]; locked: boolean }
  | { t: "chat"; scope: ChatScope; from: string; name: string; text: string; ts: number }
  | { t: "typing"; scope: ChatScope; from: string; typing: boolean }
  | { t: "signal"; from: string; data: unknown }
  | { t: "invite"; from: string; name: string; map: string; x: number; y: number }
  | { t: "inviteReply"; from: string; name: string; accept: boolean }
  | { t: "online"; users: { id: string; name: string; map: string; matrixId?: string }[] }
  | { t: "error"; msg: string }
  | { t: "pong" };
