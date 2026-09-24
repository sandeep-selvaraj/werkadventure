import { MapProp } from "@werk/shared";

/** A zone of the map with WorkAdventure-style properties (object rectangle or legacy tile layer). */
export interface MapArea {
  name: string;
  props: Record<string, unknown>;
  contains(x: number, y: number): boolean;
  /** a point inside the area to spawn at */
  spawn(): { x: number; y: number };
}

interface TiledProperty {
  name: string;
  value: unknown;
}
interface TiledObject {
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}
interface TiledLayer {
  name: string;
  type: string;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
  layers?: TiledLayer[];
  properties?: TiledProperty[];
}
export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  properties?: TiledProperty[];
  tilesets: { firstgid: number; name: string; image?: string; source?: string }[];
}

const INTERESTING = new Set<string>(Object.values(MapProp));

export function props(list?: TiledProperty[]): Record<string, unknown> {
  return Object.fromEntries((list ?? []).map((p) => [p.name, p.value]));
}

export function extractAreas(map: TiledMap): MapArea[] {
  const out: MapArea[] = [];
  const walk = (layers: TiledLayer[]) => {
    for (const l of layers) {
      if (l.type === "group" && l.layers) walk(l.layers);
      else if (l.type === "objectgroup") {
        for (const o of l.objects ?? []) {
          if (!o.width || !o.height) continue;
          const p = props(o.properties);
          out.push({
            name: o.name,
            props: p,
            contains: (x, y) => x >= o.x && y >= o.y && x < o.x + o.width! && y < o.y + o.height!,
            spawn: () => ({ x: o.x + o.width! / 2, y: o.y + o.height! / 2 }),
          });
        }
      } else if (l.type === "tilelayer" && l.data) {
        // WA legacy: a tile layer carrying properties (exitUrl, jitsiRoom, silent) or named "start"
        const p = props(l.properties);
        const relevant = l.name === "start" || Object.keys(p).some((k) => INTERESTING.has(k) && k !== MapProp.collides);
        if (!relevant) continue;
        if (l.name === "start") p.start = true;
        const w = l.width ?? map.width;
        const data = l.data;
        const tw = map.tilewidth, th = map.tileheight;
        const cells: number[] = [];
        data.forEach((g, i) => g && cells.push(i));
        if (!cells.length) continue;
        out.push({
          name: l.name,
          props: p,
          contains: (x, y) => {
            const tx = Math.floor(x / tw), ty = Math.floor(y / th);
            return tx >= 0 && tx < w && !!data[ty * w + tx];
          },
          spawn: () => {
            const i = cells[Math.floor(Math.random() * cells.length)];
            return { x: (i % w) * tw + tw / 2, y: Math.floor(i / w) * th + th / 2 };
          },
        });
      }
    }
  };
  walk(map.layers);
  return out;
}

export function findSpawn(areas: MapArea[], map: TiledMap, entry: string | null): { x: number; y: number } {
  const byName = entry ? areas.find((a) => a.name === entry) : undefined;
  const start = byName ?? areas.find((a) => a.props[MapProp.start] === true || a.name === "start");
  if (start) return start.spawn();
  return { x: (map.width * map.tilewidth) / 2, y: (map.height * map.tileheight) / 2 };
}
