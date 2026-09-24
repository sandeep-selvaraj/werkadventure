/**
 * Map properties understood by the engine. Names follow WorkAdventure's
 * conventions so existing WA maps keep working.
 */
export const MapProp = {
  /** tile property: blocks movement */
  collides: "collides",
  /** layer/area property: spawn point (layer named "start" also works) */
  start: "start",
  /** area property: "floor-1.tmj#stairs-down" — teleport to another map / entry */
  exitUrl: "exitUrl",
  /** area property: no bubbles form here */
  silent: "silent",
  /** area property: LiveKit meeting room name */
  livekitRoom: "livekitRoom",
  /** WA legacy alias for livekitRoom */
  jitsiRoom: "jitsiRoom",
  /** area property: open this URL in a side panel */
  openWebsite: "openWebsite",
  /** area property: Matrix room alias/ID linked to this area */
  matrixRoom: "matrixRoom",
  /** area property: display name for the area */
  areaName: "areaName",
} as const;

/** Parse "floor-1.tmj#stairs-down" relative to the current map URL. */
export function resolveExit(currentMap: string, exitUrl: string): { map: string; entry: string | null } {
  const [path, entry] = exitUrl.split("#");
  let map = currentMap;
  if (path) {
    if (path.startsWith("/")) map = path;
    else {
      const base = currentMap.slice(0, currentMap.lastIndexOf("/") + 1);
      map = normalize(base + path);
    }
  }
  return { map, entry: entry || null };
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "..") out.pop();
    else if (seg !== ".") out.push(seg);
  }
  return out.join("/");
}
