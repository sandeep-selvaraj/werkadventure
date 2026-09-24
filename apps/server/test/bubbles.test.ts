import { describe, expect, it } from "vitest";
import { BubbleManager } from "../src/bubbles";
import { RateLimiter } from "../src/rateLimit";

const opts = { joinRadius: 64, leaveRadius: 100, maxSize: 4 };
const u = (id: string, x: number, y = 0, excluded = false) => ({ id, x, y, excluded });

describe("BubbleManager", () => {
  it("forms a bubble when two users are close", () => {
    const m = new BubbleManager(opts);
    m.upsert(u("a", 0));
    m.upsert(u("b", 200));
    m.update();
    expect(m.bubbleOf("a")).toBeUndefined();
    m.upsert(u("b", 50));
    m.update();
    expect([...m.bubbleOf("a")!.members].sort()).toEqual(["a", "b"]);
  });

  it("lets a third user join and dissolves when members walk away", () => {
    const m = new BubbleManager(opts);
    m.upsert(u("a", 0));
    m.upsert(u("b", 40));
    m.update();
    m.upsert(u("c", 80));
    m.update();
    expect(m.bubbleOf("c")?.members.size).toBe(3);
    m.upsert(u("c", 500));
    m.update();
    expect(m.bubbleOf("c")).toBeUndefined();
    expect(m.bubbleOf("a")?.members.size).toBe(2);
    m.upsert(u("b", 400));
    m.update();
    expect(m.bubbleOf("a")).toBeUndefined();
  });

  it("respects max size and locking", () => {
    const m = new BubbleManager({ ...opts, maxSize: 2 });
    m.upsert(u("a", 0));
    m.upsert(u("b", 30));
    m.update();
    m.upsert(u("c", 15, 20));
    m.update();
    expect(m.bubbleOf("c")).toBeUndefined();

    const l = new BubbleManager(opts);
    l.upsert(u("a", 0));
    l.upsert(u("b", 30));
    l.update();
    l.setLocked("a", true);
    l.upsert(u("c", 15, 20));
    l.update();
    expect(l.bubbleOf("c")).toBeUndefined();
  });

  it("never includes excluded users (silent zone / meeting room)", () => {
    const m = new BubbleManager(opts);
    m.upsert(u("a", 0));
    m.upsert(u("b", 20, 0, true));
    m.update();
    expect(m.bubbleOf("a")).toBeUndefined();
    m.upsert(u("b", 20));
    m.update();
    expect(m.bubbleOf("a")).toBeDefined();
    m.upsert(u("b", 20, 0, true));
    m.update();
    expect(m.bubbleOf("a")).toBeUndefined();
  });

  it("removing a user dissolves a two-person bubble", () => {
    const m = new BubbleManager(opts);
    m.upsert(u("a", 0));
    m.upsert(u("b", 20));
    m.update();
    m.remove("b");
    expect(m.bubbleOf("a")).toBeUndefined();
  });
});

describe("RateLimiter", () => {
  it("allows 3 invites per 10 minutes", () => {
    let t = 0;
    const r = new RateLimiter(3, 600_000, () => t);
    expect([r.take("x"), r.take("x"), r.take("x"), r.take("x")]).toEqual([true, true, true, false]);
    t = 600_001;
    expect(r.take("x")).toBe(true);
  });
});
