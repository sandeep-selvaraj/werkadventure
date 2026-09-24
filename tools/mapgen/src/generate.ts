import { z } from "zod";
import { Canvas } from "./canvas.js";
import { COLUMNS, E, N, S, T, TILES, TILE_INDEX, W } from "./tiles.js";

/**
 * Floor-plan DSL. One YAML file per floor:
 *
 *   name: Ground floor
 *   floor: wood                 # default floor under furniture
 *   layout: |
 *     ##########
 *     #..d..,,,#
 *   areas:
 *     - { name: Meeting A, at: [x, y, w, h], meeting: meeting-a }
 *     - { name: stairs-up, at: [x, y, w, h], exit: floor-1.tmj#stairs-down }
 */
export const LEGEND: Record<string, { floor?: string; wall?: "wall" | "window" | "whiteboard"; item?: string; auto?: string; start?: true; void?: true }> = {
  " ": { void: true },
  "#": { wall: "wall" },
  W: { wall: "window" },
  w: { wall: "whiteboard" },
  ".": { floor: "floor_wood" },
  ",": { floor: "floor_carpet" },
  ";": { floor: "floor_carpet_green" },
  ":": { floor: "floor_carpet_rose" },
  _: { floor: "floor_tile" },
  "=": { floor: "floor_concrete" },
  D: { floor: "door" },
  S: { floor: "stairs" },
  "@": { start: true },
  d: { item: "desk" },
  c: { item: "chair" },
  p: { item: "plant" },
  s: { item: "sofa" },
  b: { item: "bookshelf" },
  m: { item: "coffee" },
  T: { auto: "table" },
  k: { auto: "counter" },
};

const FLOORS: Record<string, string> = {
  wood: "floor_wood",
  carpet: "floor_carpet",
  green: "floor_carpet_green",
  rose: "floor_carpet_rose",
  tile: "floor_tile",
  concrete: "floor_concrete",
};

const Rect = z.tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()]);

export const FloorPlan = z.object({
  name: z.string(),
  floor: z.enum(["wood", "carpet", "green", "rose", "tile", "concrete"]).default("wood"),
  layout: z.string(),
  start: z.tuple([z.number().int(), z.number().int()]).optional(),
  areas: z
    .array(
      z.object({
        name: z.string(),
        at: Rect,
        /** LiveKit meeting room */
        meeting: z.string().optional(),
        silent: z.boolean().optional(),
        /** "floor-1.tmj#stairs-down" */
        exit: z.string().optional(),
        website: z.string().url().optional(),
        matrixRoom: z.string().optional(),
        /** paint this floor under the whole rect (before furniture) */
        floor: z.enum(["wood", "carpet", "green", "rose", "tile", "concrete"]).optional(),
      }),
    )
    .default([]),
});
export type FloorPlan = z.infer<typeof FloorPlan>;

export const TILESET_NAME = "werk-office";

export function renderTileset(): Canvas {
  const rows = Math.ceil(TILES.length / COLUMNS);
  const c = new Canvas(COLUMNS * T, rows * T);
  TILES.forEach((t, i) => t.paint(c, (i % COLUMNS) * T, Math.floor(i / COLUMNS) * T));
  return c;
}

export interface Generated {
  tmj: object;
  /** layers as gid grids, for preview rendering */
  grids: number[][];
  width: number;
  height: number;
  warnings: string[];
}

export function generate(plan: FloorPlan, tilesetImage: string): Generated {
  const warnings: string[] = [];
  const rows = plan.layout.replace(/\n+$/, "").split("\n");
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const at = (x: number, y: number) => (y >= 0 && y < height ? rows[y][x] ?? " " : " ");
  const size = width * height;
  const floor = new Array<number>(size).fill(0);
  const walls = new Array<number>(size).fill(0);
  const furniture = new Array<number>(size).fill(0);
  const gid = (name: string) => TILE_INDEX[name] + 1;
  let start = plan.start ?? null;

  const isWall = (x: number, y: number) => !!LEGEND[at(x, y)]?.wall;
  const isVoid = (x: number, y: number) => !!LEGEND[at(x, y)]?.void || !LEGEND[at(x, y)];

  // floor under furniture: area override > most common neighbouring floor > map default
  const areaFloor = (x: number, y: number) => {
    for (const a of plan.areas) {
      const [ax, ay, aw, ah] = a.at;
      if (a.floor && x >= ax && y >= ay && x < ax + aw && y < ay + ah) return FLOORS[a.floor];
    }
    return null;
  };
  const guessFloor = (x: number, y: number) => {
    const counts = new Map<string, number>();
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const f = LEGEND[at(x + dx, y + dy)]?.floor;
        if (f && f !== "door" && f !== "stairs") counts.set(f, (counts.get(f) ?? 0) + 1);
      }
    let best = FLOORS[plan.floor];
    let n = 0;
    for (const [f, k] of counts) if (k > n) [best, n] = [f, k];
    return best;
  };

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      const def = LEGEND[ch];
      const i = y * width + x;
      if (!def) {
        warnings.push(`unknown char '${ch}' at ${x},${y} (treated as void)`);
        continue;
      }
      if (def.void) continue;
      if (def.wall) {
        const faceVisible = !isWall(x, y + 1) && !isVoid(x, y + 1);
        if (def.wall === "wall") walls[i] = gid(faceVisible ? "wall_face" : "wall_top");
        else walls[i] = gid(faceVisible ? (def.wall === "window" ? "wall_window" : "whiteboard") : "wall_top");
        continue;
      }
      const override = def.floor === "door" || def.floor === "stairs" ? null : areaFloor(x, y);
      floor[i] = gid(override ?? def.floor ?? guessFloor(x, y));
      if (def.start) start = [x, y];
      if (def.item) furniture[i] = gid(def.item);
      if (def.auto) {
        const same = (dx: number, dy: number) => at(x + dx, y + dy) === ch;
        const mask = (same(0, -1) ? N : 0) | (same(1, 0) ? E : 0) | (same(0, 1) ? S : 0) | (same(-1, 0) ? W : 0);
        furniture[i] = gid(`${def.auto}_${mask}`);
      }
    }

  if (!start) {
    const i = floor.findIndex((g) => g !== 0);
    start = [i % width, Math.floor(i / width)];
    warnings.push("no start ('@' or start:) given; using first floor tile");
  }

  let objId = 1;
  const prop = (name: string, value: string | boolean) => ({ name, type: typeof value === "boolean" ? "bool" : "string", value });
  const objects = [
    { id: objId++, name: "start", type: "area", x: start[0] * T, y: start[1] * T, width: T, height: T, rotation: 0, visible: true, properties: [prop("start", true)] },
    ...plan.areas.map((a) => {
      // slug-like names ("stairs-up") are entry points, not rooms people talk in
      const isRoom = !a.exit && !/^[a-z0-9_-]+$/.test(a.name);
      const props = isRoom ? [prop("areaName", a.name)] : [];
      if (a.meeting) props.push(prop("livekitRoom", a.meeting));
      if (a.silent) props.push(prop("silent", true));
      if (a.exit) props.push(prop("exitUrl", a.exit));
      if (a.website) props.push(prop("openWebsite", a.website));
      if (a.matrixRoom) props.push(prop("matrixRoom", a.matrixRoom));
      const [x, y, w, h] = a.at;
      if (x < 0 || y < 0 || x + w > width || y + h > height) warnings.push(`area '${a.name}' is outside the map`);
      return { id: objId++, name: a.name, type: "area", x: x * T, y: y * T, width: w * T, height: h * T, rotation: 0, visible: true, properties: props };
    }),
  ];

  const tileLayer = (id: number, name: string, data: number[]) => ({ id, name, type: "tilelayer", x: 0, y: 0, width, height, opacity: 1, visible: true, data });
  const tmj = {
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width,
    height,
    tilewidth: T,
    tileheight: T,
    nextlayerid: 5,
    nextobjectid: objId,
    backgroundcolor: "#1d1b26",
    properties: [prop("mapName", plan.name), prop("generator", "werk-mapgen")],
    layers: [tileLayer(1, "floor", floor), tileLayer(2, "walls", walls), tileLayer(3, "furniture", furniture), { id: 4, name: "areas", type: "objectgroup", draworder: "topdown", opacity: 1, visible: true, x: 0, y: 0, objects }],
    tilesets: [
      {
        firstgid: 1,
        name: TILESET_NAME,
        image: tilesetImage,
        imagewidth: COLUMNS * T,
        imageheight: Math.ceil(TILES.length / COLUMNS) * T,
        tilewidth: T,
        tileheight: T,
        columns: COLUMNS,
        tilecount: TILES.length,
        margin: 0,
        spacing: 0,
        tiles: TILES.map((t, id) => ({ id, properties: [prop("collides", t.collides)] })).filter((_, id) => TILES[id].collides),
      },
    ],
  };
  return { tmj, grids: [floor, walls, furniture], width, height, warnings };
}

/** Compose a preview image of the generated map (areas outlined). */
export function renderPreview(g: Generated, tileset: Canvas, plan: FloorPlan): Canvas {
  const c = new Canvas(g.width * T, g.height * T);
  c.rect(0, 0, c.w, c.h, [29, 27, 38, 255]);
  for (const grid of g.grids)
    grid.forEach((gid, i) => {
      if (!gid) return;
      const t = gid - 1;
      c.blit(tileset, (i % g.width) * T, Math.floor(i / g.width) * T, (t % COLUMNS) * T, Math.floor(t / COLUMNS) * T, T, T);
    });
  for (const a of plan.areas) {
    const [x, y, w, h] = a.at;
    const col: [number, number, number, number] = a.exit ? [240, 180, 40, 255] : a.meeting ? [60, 200, 120, 255] : a.silent ? [220, 70, 70, 255] : [200, 200, 255, 255];
    c.outline(x * T, y * T, w * T, h * T, col);
    c.outline(x * T + 1, y * T + 1, w * T - 2, h * T - 2, col);
  }
  return c;
}
