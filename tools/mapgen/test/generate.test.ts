import { describe, expect, it } from "vitest";
import { FloorPlan, generate } from "../src/generate";
import { TILE_INDEX } from "../src/tiles";

const plan = (layout: string, extra: object = {}) => FloorPlan.parse({ name: "t", layout, ...extra });
const gid = (name: string) => TILE_INDEX[name] + 1;
type Tmj = { layers: { name: string; data?: number[]; objects?: { name: string; properties: { name: string; value: unknown }[] }[] }[] };

describe("mapgen", () => {
  it("shows a wall face above floor and wall tops elsewhere", () => {
    const g = generate(plan("###\n#@#\n###"), "t.png");
    const walls = (g.tmj as Tmj).layers.find((l) => l.name === "walls")!.data!;
    expect(walls[1]).toBe(gid("wall_face")); // above the floor tile
    expect(walls[3]).toBe(gid("wall_top")); // beside it
  });

  it("auto-tiles tables by neighbours", () => {
    const g = generate(plan("TT\n.."), "t.png");
    const furn = (g.tmj as Tmj).layers.find((l) => l.name === "furniture")!.data!;
    expect(furn[0]).toBe(gid("table_2")); // east neighbour
    expect(furn[1]).toBe(gid("table_8")); // west neighbour
  });

  it("puts the matching floor under furniture", () => {
    const g = generate(plan(",,,\n,d,\n,,,"), "t.png");
    const floor = (g.tmj as Tmj).layers.find((l) => l.name === "floor")!.data!;
    expect(floor[4]).toBe(gid("floor_carpet"));
  });

  it("emits WorkAdventure-style area properties", () => {
    const g = generate(
      plan("....\n....", {
        areas: [
          { name: "Meeting A", at: [0, 0, 2, 2], meeting: "a" },
          { name: "stairs-up", at: [2, 0, 1, 1], exit: "floor-1.tmj#stairs-down" },
        ],
      }),
      "t.png",
    );
    const objs = (g.tmj as Tmj).layers.find((l) => l.name === "areas")!.objects!;
    const props = (n: string) => Object.fromEntries(objs.find((o) => o.name === n)!.properties.map((p) => [p.name, p.value]));
    expect(props("Meeting A")).toEqual({ areaName: "Meeting A", livekitRoom: "a" });
    expect(props("stairs-up")).toEqual({ exitUrl: "floor-1.tmj#stairs-down" });
    expect(g.warnings).toContain("no start ('@' or start:) given; using first floor tile");
  });
});
