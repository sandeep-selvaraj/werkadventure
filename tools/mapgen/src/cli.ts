import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { PNG } from "pngjs";
import { parse } from "yaml";
import type { Canvas } from "./canvas.js";
import { FloorPlan, TILESET_NAME, generate, renderPreview, renderTileset } from "./generate.js";

/**
 * Usage: pnpm mapgen <dir|file.yaml>... [--png]
 * Writes <floor>.tmj next to each <floor>.yaml, the shared tileset to maps/tilesets/,
 * and with --png a preview image to <dir>/preview/<floor>.png.
 */
const args = process.argv.slice(2);
const png = args.includes("--png");
const targets = args.filter((a) => !a.startsWith("--"));
if (!targets.length) {
  console.error("usage: pnpm mapgen <maps/building | floor.yaml>... [--png]");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "../../..");
const tilesetPath = join(root, "maps/tilesets", `${TILESET_NAME}.png`);
const tileset = renderTileset();
mkdirSync(dirname(tilesetPath), { recursive: true });
writePng(tileset, tilesetPath);

let failed = false;
for (const file of targets.flatMap(expand)) {
  const plan = FloorPlan.safeParse(parse(readFileSync(file, "utf8")));
  if (!plan.success) {
    console.error(`✗ ${file}\n${plan.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
    failed = true;
    continue;
  }
  const out = file.replace(/\.ya?ml$/, ".tmj");
  const g = generate(plan.data, relative(dirname(out), tilesetPath));
  writeFileSync(out, JSON.stringify(g.tmj));
  console.log(`✓ ${relative(root, out)}  ${g.width}x${g.height}`);
  for (const w of g.warnings) console.log(`  ! ${w}`);
  if (png) {
    const p = join(dirname(file), "preview", basename(out, ".tmj") + ".png");
    mkdirSync(dirname(p), { recursive: true });
    writePng(renderPreview(g, tileset, plan.data), p);
    console.log(`  preview: ${relative(root, p)}`);
  }
}
process.exit(failed ? 1 : 0);

function expand(p: string): string[] {
  const abs = resolve(p);
  if (statSync(abs).isDirectory())
    return readdirSync(abs).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => join(abs, f));
  return [abs];
}

function writePng(c: Canvas, path: string) {
  const img = new PNG({ width: c.w, height: c.h });
  img.data = Buffer.from(c.data);
  writeFileSync(path, PNG.sync.write(img));
}
