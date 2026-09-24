/** Tiny RGBA pixel canvas used to paint the procedural tileset. */
export type RGBA = [number, number, number, number];

export function hex(h: string, a = 255): RGBA {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export function shade(c: RGBA, f: number): RGBA {
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return [k(c[0]), k(c[1]), k(c[2]), c[3]];
}

export class Canvas {
  data: Uint8Array;
  constructor(public w: number, public h: number) {
    this.data = new Uint8Array(w * h * 4);
  }

  px(x: number, y: number, c: RGBA): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = c[3] / 255;
    if (a >= 1) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = 255;
      return;
    }
    const d = this.data;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa === 0) return;
    for (let k = 0; k < 3; k++) d[i + k] = Math.round((c[k] * a + d[i + k] * da * (1 - a)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
  }

  outline(x: number, y: number, w: number, h: number, c: RGBA): void {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  circle(cx: number, cy: number, r: number, c: RGBA): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c);
  }

  /** blit another canvas at (dx, dy) */
  blit(src: Canvas, dx: number, dy: number, sx = 0, sy = 0, w = src.w, h = src.h): void {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((sy + y) * src.w + sx + x) * 4;
        if (src.data[i + 3] === 0) continue;
        this.px(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
      }
  }
}

/** deterministic per-pixel noise in [0,1) */
export function noise(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
