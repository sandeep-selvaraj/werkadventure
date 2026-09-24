/**
 * Proximity bubble grouping, modelled on WorkAdventure's back service:
 * a user who walks close to another user either creates a bubble with them
 * or joins their bubble (if it is not full or locked). A user leaves when
 * they drift too far from the bubble's centre.
 */

export interface BubbleUser {
  id: string;
  x: number;
  y: number;
  /** in a silent zone or a meeting room: never part of a bubble */
  excluded: boolean;
}

export interface Bubble {
  id: string;
  members: Set<string>;
  locked: boolean;
}

export interface BubbleOptions {
  /** distance between two users that starts a bubble */
  joinRadius: number;
  /** distance from bubble centre beyond which a member leaves */
  leaveRadius: number;
  maxSize: number;
}

let nextId = 1;

export class BubbleManager {
  private users = new Map<string, BubbleUser>();
  private bubbles = new Map<string, Bubble>();
  private userBubble = new Map<string, string>();

  constructor(private opts: BubbleOptions) {}

  upsert(u: BubbleUser): void {
    this.users.set(u.id, { ...u });
  }

  remove(id: string): Set<string> {
    this.users.delete(id);
    const changed = new Set<string>();
    this.leave(id, changed);
    return changed;
  }

  bubbleOf(id: string): Bubble | undefined {
    const b = this.userBubble.get(id);
    return b ? this.bubbles.get(b) : undefined;
  }

  get(id: string): Bubble | undefined {
    return this.bubbles.get(id);
  }

  setLocked(userId: string, locked: boolean): Bubble | undefined {
    const b = this.bubbleOf(userId);
    if (b) b.locked = locked;
    return b;
  }

  /** Recompute bubbles. Returns ids of bubbles whose membership changed (including dissolved ones). */
  update(): Set<string> {
    const changed = new Set<string>();

    // 1. members that moved away / became excluded leave
    for (const [uid, bid] of [...this.userBubble]) {
      const u = this.users.get(uid);
      const b = this.bubbles.get(bid);
      if (!u || !b) continue;
      if (u.excluded) {
        this.leave(uid, changed);
        continue;
      }
      const c = this.centre(b, uid);
      if (c && dist(u, c) > this.opts.leaveRadius) this.leave(uid, changed);
    }

    // 2. free users look for the nearest neighbour
    for (const u of this.users.values()) {
      if (u.excluded || this.userBubble.has(u.id)) continue;
      let best: BubbleUser | undefined;
      let bestD = Infinity;
      for (const o of this.users.values()) {
        if (o.id === u.id || o.excluded) continue;
        const d = dist(u, o);
        if (d > this.opts.joinRadius || d >= bestD) continue;
        const ob = this.bubbleOf(o.id);
        if (ob && (ob.locked || ob.members.size >= this.opts.maxSize)) continue;
        best = o;
        bestD = d;
      }
      if (!best) continue;
      const ob = this.bubbleOf(best.id);
      if (ob) {
        ob.members.add(u.id);
        this.userBubble.set(u.id, ob.id);
        changed.add(ob.id);
      } else {
        const b: Bubble = { id: `b${nextId++}`, members: new Set([u.id, best.id]), locked: false };
        this.bubbles.set(b.id, b);
        this.userBubble.set(u.id, b.id);
        this.userBubble.set(best.id, b.id);
        changed.add(b.id);
      }
    }
    return changed;
  }

  private leave(uid: string, changed: Set<string>): void {
    const bid = this.userBubble.get(uid);
    if (!bid) return;
    this.userBubble.delete(uid);
    const b = this.bubbles.get(bid);
    if (!b) return;
    b.members.delete(uid);
    changed.add(bid);
    if (b.members.size < 2) {
      for (const m of b.members) this.userBubble.delete(m);
      b.members.clear();
      this.bubbles.delete(bid);
    }
  }

  /** centre of the other members (excluding `except`), so one member can't drag the bubble along */
  private centre(b: Bubble, except: string): { x: number; y: number } | null {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const m of b.members) {
      if (m === except) continue;
      const u = this.users.get(m);
      if (!u) continue;
      x += u.x;
      y += u.y;
      n++;
    }
    return n ? { x: x / n, y: y / n } : null;
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
