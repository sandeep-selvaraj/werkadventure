import { Canvas, hex, noise, shade, type RGBA } from "./canvas.js";

export const T = 32;

export interface TileDef {
  name: string;
  collides: boolean;
  paint: (c: Canvas, ox: number, oy: number) => void;
}

// neighbour mask bits for auto-tiled furniture
export const N = 1, E = 2, S = 4, W = 8;

function textured(c: Canvas, ox: number, oy: number, base: RGBA, amount: number, seed: number) {
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) c.px(ox + x, oy + y, shade(base, (noise(x, y, seed) - 0.5) * amount));
}

function wood(c: Canvas, ox: number, oy: number) {
  const base = hex("#b88a5c");
  for (let y = 0; y < T; y++) {
    const plank = Math.floor(y / 8);
    const tone = shade(base, (noise(plank, 0, 7) - 0.5) * 0.18);
    for (let x = 0; x < T; x++) {
      const seam = (x + plank * 13) % 32 === 0 || y % 8 === 7;
      c.px(ox + x, oy + y, seam ? shade(base, -0.25) : shade(tone, (noise(x, y, 3) - 0.5) * 0.08));
    }
  }
}

function wallFace(c: Canvas, ox: number, oy: number) {
  c.rect(ox, oy, T, T, hex("#ebe3d3"));
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (noise(x, y, 11) > 0.93) c.px(ox + x, oy + y, hex("#ddd4c2"));
  c.rect(ox, oy, T, 2, hex("#2c2a36"));
  c.rect(ox, oy + 2, T, 1, hex("#c9bfad"));
  c.rect(ox, oy + T - 5, T, 5, hex("#7b6450"));
  c.rect(ox, oy + T - 5, T, 1, hex("#9b8470"));
}

function autoTop(c: Canvas, ox: number, oy: number, mask: number, top: RGBA, edge: RGBA, front: RGBA) {
  const l = mask & W ? 0 : 2, r = mask & E ? T : T - 2, t = mask & N ? 0 : 3, b = mask & S ? T : T - 8;
  c.rect(ox + l, oy + t, r - l, b - t, top);
  for (let y = t; y < b; y++) for (let x = l; x < r; x++) if (noise(x, y, 5) > 0.9) c.px(ox + x, oy + y, shade(top, 0.06));
  if (!(mask & N)) c.rect(ox + l, oy + t, r - l, 1, shade(top, 0.25));
  if (!(mask & W)) c.rect(ox + l, oy + t, 1, b - t, edge);
  if (!(mask & E)) c.rect(ox + r - 1, oy + t, 1, b - t, edge);
  if (!(mask & S)) {
    c.rect(ox + l, oy + b, r - l, 5, front);
    c.rect(ox + l, oy + b + 5, r - l, 1, shade(front, -0.4));
    // legs
    if (!(mask & W)) c.rect(ox + l + 1, oy + b + 5, 2, 3, shade(front, -0.3));
    if (!(mask & E)) c.rect(ox + r - 3, oy + b + 5, 2, 3, shade(front, -0.3));
  }
}

const fixed: TileDef[] = [
  { name: "floor_wood", collides: false, paint: wood },
  { name: "floor_carpet", collides: false, paint: (c, x, y) => textured(c, x, y, hex("#5d6f9c"), 0.16, 1) },
  { name: "floor_carpet_green", collides: false, paint: (c, x, y) => textured(c, x, y, hex("#6a8c5f"), 0.16, 2) },
  { name: "floor_carpet_rose", collides: false, paint: (c, x, y) => textured(c, x, y, hex("#b9786f"), 0.16, 12) },
  {
    name: "floor_tile",
    collides: false,
    paint: (c, ox, oy) => {
      for (let q = 0; q < 4; q++) {
        const qx = (q % 2) * 16, qy = Math.floor(q / 2) * 16;
        c.rect(ox + qx, oy + qy, 16, 16, hex(q % 3 === 0 ? "#dcdad2" : "#cbc8be"));
        c.outline(ox + qx, oy + qy, 16, 16, hex("#b3afa3"));
      }
    },
  },
  { name: "floor_concrete", collides: false, paint: (c, x, y) => textured(c, x, y, hex("#a3a3a0"), 0.12, 4) },
  {
    name: "wall_top",
    collides: true,
    paint: (c, ox, oy) => {
      c.rect(ox, oy, T, T, hex("#3b3847"));
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (noise(x, y, 9) > 0.92) c.px(ox + x, oy + y, hex("#45425a"));
    },
  },
  { name: "wall_face", collides: true, paint: wallFace },
  {
    name: "wall_window",
    collides: true,
    paint: (c, ox, oy) => {
      wallFace(c, ox, oy);
      c.rect(ox + 4, oy + 6, 24, 16, hex("#e9e9ee"));
      c.rect(ox + 6, oy + 8, 20, 12, hex("#8cc6e6"));
      c.rect(ox + 6, oy + 8, 20, 3, hex("#b7def2"));
      c.rect(ox + 15, oy + 8, 2, 12, hex("#e9e9ee"));
    },
  },
  {
    name: "whiteboard",
    collides: true,
    paint: (c, ox, oy) => {
      wallFace(c, ox, oy);
      c.rect(ox + 2, oy + 5, 28, 18, hex("#9a9aa4"));
      c.rect(ox + 3, oy + 6, 26, 16, hex("#fbfbfb"));
      c.rect(ox + 6, oy + 9, 12, 1, hex("#3a6fd8"));
      c.rect(ox + 6, oy + 12, 16, 1, hex("#3a6fd8"));
      c.rect(ox + 6, oy + 15, 9, 1, hex("#d83a3a"));
      c.rect(ox + 20, oy + 16, 6, 4, hex("#46a35a"));
    },
  },
  {
    name: "door",
    collides: false,
    paint: (c, ox, oy) => {
      wood(c, ox, oy);
      c.rect(ox, oy, 3, T, hex("#6b5442"));
      c.rect(ox + T - 3, oy, 3, T, hex("#6b5442"));
      c.rect(ox + 3, oy + 13, T - 6, 6, shade(hex("#b88a5c"), -0.12));
    },
  },
  {
    name: "desk",
    collides: true,
    paint: (c, ox, oy) => {
      autoTop(c, ox, oy, 0, hex("#c59663"), hex("#8e6238"), hex("#7c5430"));
      c.rect(ox + 8, oy + 4, 16, 11, hex("#26262e"));
      c.rect(ox + 9, oy + 5, 14, 8, hex("#4fa3e0"));
      c.rect(ox + 14, oy + 15, 4, 2, hex("#26262e"));
      c.rect(ox + 9, oy + 18, 14, 3, hex("#e4e4ea"));
    },
  },
  {
    name: "chair",
    collides: false,
    paint: (c, ox, oy) => {
      c.rect(ox + 9, oy + 6, 14, 7, hex("#2f3440"));
      c.rect(ox + 9, oy + 6, 14, 2, hex("#4a5163"));
      c.rect(ox + 8, oy + 13, 16, 10, hex("#39404f"));
      c.rect(ox + 8, oy + 13, 16, 2, hex("#566079"));
      c.rect(ox + 15, oy + 23, 2, 4, hex("#22252d"));
      c.rect(ox + 10, oy + 27, 12, 2, hex("#22252d"));
    },
  },
  {
    name: "plant",
    collides: true,
    paint: (c, ox, oy) => {
      c.rect(ox + 10, oy + 20, 12, 10, hex("#a8643c"));
      c.rect(ox + 9, oy + 19, 14, 3, hex("#c47a4c"));
      const g = hex("#3f8d45");
      c.circle(ox + 16, oy + 11, 7, g);
      c.circle(ox + 10, oy + 14, 5, shade(g, -0.15));
      c.circle(ox + 22, oy + 14, 5, shade(g, -0.15));
      c.circle(ox + 15, oy + 8, 4, shade(g, 0.2));
    },
  },
  {
    name: "sofa",
    collides: true,
    paint: (c, ox, oy) => {
      const s = hex("#3f8f8a");
      c.rect(ox + 1, oy + 6, 30, 10, shade(s, -0.2));
      c.rect(ox + 1, oy + 14, 30, 12, s);
      c.rect(ox + 1, oy + 8, 5, 20, shade(s, -0.1));
      c.rect(ox + 26, oy + 8, 5, 20, shade(s, -0.1));
      c.rect(ox + 7, oy + 15, 18, 2, shade(s, 0.2));
      c.rect(ox + 1, oy + 28, 30, 1, shade(s, -0.5));
    },
  },
  {
    name: "bookshelf",
    collides: true,
    paint: (c, ox, oy) => {
      c.rect(ox + 1, oy, 30, 31, hex("#6e4a2c"));
      const books = ["#c0392b", "#2980b9", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22", "#ecf0f1"];
      for (let row = 0; row < 3; row++) {
        const y = oy + 2 + row * 10;
        c.rect(ox + 3, y, 26, 8, hex("#3e2a18"));
        let x = ox + 4;
        let k = row * 3;
        while (x < ox + 27) {
          const w = 2 + Math.floor(noise(k, row, 8) * 3);
          c.rect(x, y + 1 + Math.floor(noise(k, 1, 2) * 2), w, 7, hex(books[k % books.length]));
          x += w + 1;
          k++;
        }
      }
    },
  },
  {
    name: "stairs",
    collides: false,
    paint: (c, ox, oy) => {
      for (let i = 0; i < 4; i++) {
        c.rect(ox, oy + i * 8, T, 8, shade(hex("#9c9c9c"), -0.12 * i));
        c.rect(ox, oy + i * 8, T, 2, shade(hex("#c9c9c9"), -0.1 * i));
      }
      c.rect(ox, oy, 2, T, hex("#5a5a5a"));
      c.rect(ox + T - 2, oy, 2, T, hex("#5a5a5a"));
    },
  },
  {
    name: "coffee",
    collides: true,
    paint: (c, ox, oy) => {
      autoTop(c, ox, oy, 0, hex("#b9bcc2"), hex("#7c8088"), hex("#6d7179"));
      c.rect(ox + 9, oy + 3, 14, 14, hex("#2b2b2f"));
      c.rect(ox + 11, oy + 5, 10, 3, hex("#d33"));
      c.rect(ox + 14, oy + 12, 4, 4, hex("#f2f2f2"));
    },
  },
];

function autoSet(prefix: string, top: RGBA, edge: RGBA, front: RGBA): TileDef[] {
  return Array.from({ length: 16 }, (_, mask) => ({
    name: `${prefix}_${mask}`,
    collides: true,
    paint: (c: Canvas, ox: number, oy: number) => autoTop(c, ox, oy, mask, top, edge, front),
  }));
}

export const TILES: TileDef[] = [
  ...fixed,
  ...autoSet("table", hex("#a8743f"), hex("#7c5028"), hex("#6a4322")),
  ...autoSet("counter", hex("#c4c7cc"), hex("#8d9199"), hex("#e4e1d8")),
];

export const TILE_INDEX = Object.fromEntries(TILES.map((t, i) => [t.name, i])) as Record<string, number>;
export const COLUMNS = 8;
