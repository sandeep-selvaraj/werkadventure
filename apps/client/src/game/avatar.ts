import type { Avatar } from "@werk/shared";

export const FRAME = 32;
/** row order in the generated sheet */
export const DIRS = ["down", "left", "right", "up"] as const;
export const FRAMES_PER_DIR = 3;

export const PALETTE = {
  skin: ["#f1c9a5", "#e0ac84", "#c68642", "#8d5524", "#5c3a1e"],
  hair: ["#2b1d14", "#6b3e1f", "#c49a4a", "#e5e1d8", "#b33a2b", "#3b4bb3"],
  shirt: ["#4f7cff", "#e5484d", "#30a46c", "#f5a524", "#8e4ec6", "#2b2d42", "#f1f1f1"],
  pants: ["#2b2d42", "#3d5a80", "#5c4033", "#6b6b6b", "#1f1f1f"],
};

export function randomAvatar(): Avatar {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return {
    skin: pick(PALETTE.skin),
    hair: pick(PALETTE.hair),
    shirt: pick(PALETTE.shirt),
    pants: pick(PALETTE.pants),
    hairStyle: Math.floor(Math.random() * 4),
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Paints a 3x4 walking sheet (32px frames) for the avatar. */
export function drawAvatarSheet(a: Avatar): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = FRAME * FRAMES_PER_DIR;
  cv.height = FRAME * DIRS.length;
  const g = cv.getContext("2d")!;
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < FRAMES_PER_DIR; f++) drawFrame(g, a, dir, f, f * FRAME, row * FRAME);
  });
  return cv;
}

function drawFrame(g: CanvasRenderingContext2D, a: Avatar, dir: (typeof DIRS)[number], frame: number, ox: number, oy: number) {
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(ox + x, oy + y, w, h);
  };
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const bob = frame === 0 ? 0 : -1;
  const side = dir === "left" || dir === "right";

  // shadow
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.beginPath();
  g.ellipse(ox + 16, oy + 29, 7, 2.5, 0, 0, Math.PI * 2);
  g.fill();

  // legs
  if (side) {
    r(13 + step, 22, 3, 7, a.pants);
    r(16 - step, 22, 3, 7, shade(a.pants, -0.2));
    r(13 + step, 28, 3, 1, "#222");
    r(16 - step, 28, 3, 1, "#222");
  } else {
    r(12, 22, 3, 7 - Math.max(0, step), a.pants);
    r(17, 22, 3, 7 - Math.max(0, -step), a.pants);
    r(12, 28 - Math.max(0, step), 3, 1, "#222");
    r(17, 28 - Math.max(0, -step), 3, 1, "#222");
  }

  // torso
  const ty = 14 + bob;
  r(10, ty, 12, 9, a.shirt);
  r(10, ty + 8, 12, 1, shade(a.shirt, -0.3));
  // arms
  if (side) {
    r(15 - step, ty + 1, 3, 7, shade(a.shirt, -0.15));
    r(15 - step, ty + 7, 3, 2, a.skin);
  } else {
    r(8, ty + 1 + step, 2, 6, shade(a.shirt, -0.15));
    r(22, ty + 1 - step, 2, 6, shade(a.shirt, -0.15));
    r(8, ty + 7 + step, 2, 2, a.skin);
    r(22, ty + 7 - step, 2, 2, a.skin);
  }

  // head
  const hy = 3 + bob;
  r(10, hy, 12, 11, a.skin);
  r(10, hy + 10, 12, 1, shade(a.skin, -0.15));
  const hair = a.hair;
  // hair styles: 0 short, 1 long, 2 spiky, 3 bald-ish cap
  if (dir === "up") {
    r(9, hy - 1, 14, a.hairStyle === 1 ? 13 : 10, hair);
  } else {
    r(9, hy - 1, 14, 4, hair);
    if (a.hairStyle === 1) {
      if (dir !== "right") r(9, hy + 2, 3, 10, hair);
      if (dir !== "left") r(20, hy + 2, 3, 10, hair);
    } else if (a.hairStyle === 2) {
      for (let i = 0; i < 4; i++) r(10 + i * 3, hy - 3, 2, 2, hair);
    } else if (a.hairStyle === 3) {
      r(9, hy - 1, 14, 2, shade(hair, 0.15));
    }
    if (dir === "left") r(18, hy + 2, 4, 5, hair);
    if (dir === "right") r(10, hy + 2, 4, 5, hair);
    // eyes
    const eye = "#1b1b24";
    if (dir === "down") {
      r(13, hy + 5, 2, 2, eye);
      r(17, hy + 5, 2, 2, eye);
      r(15, hy + 8, 2, 1, shade(a.skin, -0.3));
    } else if (dir === "left") {
      r(11, hy + 5, 2, 2, eye);
    } else {
      r(19, hy + 5, 2, 2, eye);
    }
  }
}
