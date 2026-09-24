/** 8-way A* on a tile grid (no corner cutting). Returns tile waypoints excluding the start. */
export function findPath(
  blocked: (x: number, y: number) => boolean,
  w: number,
  h: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = 4000,
): [number, number][] | null {
  if (blocked(tx, ty) || tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
  const key = (x: number, y: number) => y * w + x;
  const g = new Map<number, number>([[key(sx, sy), 0]]);
  const came = new Map<number, number>();
  const open: { k: number; f: number }[] = [{ k: key(sx, sy), f: 0 }];
  const closed = new Set<number>();
  const hdist = (x: number, y: number) => {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  while (open.length && closed.size < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { k } = open.splice(bi, 1)[0];
    if (closed.has(k)) continue;
    closed.add(k);
    const x = k % w, y = Math.floor(k / w);
    if (x === tx && y === ty) {
      const path: [number, number][] = [];
      let c = k;
      while (c !== key(sx, sy)) {
        path.push([c % w, Math.floor(c / w)]);
        c = came.get(c)!;
      }
      return path.reverse();
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked(nx, ny)) continue;
        if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
        const nk = key(nx, ny);
        const ng = g.get(k)! + (dx && dy ? 1.414 : 1);
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          came.set(nk, k);
          open.push({ k: nk, f: ng + hdist(nx, ny) });
        }
      }
  }
  return null;
}
