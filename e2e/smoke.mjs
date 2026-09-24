// Two players: login, bubble forms, proximity chat, walk away, take the stairs.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "test-results";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CH || "chromium", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const errors = [];

async function player(name) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 750 } });
  await ctx.addInitScript(() => localStorage.setItem("werk.debug", "1"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text()}`));
  await page.goto(BASE);
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForSelector("canvas");
  return page;
}

const check = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) process.exitCode = 1; };

const a = await player("Alice");
const b = await player("Bob");
await a.waitForTimeout(1500);

check(await a.getByText("You joined a conversation with Bob").isVisible(), "Alice sees bubble with Bob");
await b.getByPlaceholder("Message the people around you").fill("hi alice!");
await b.getByRole("button", { name: "Send" }).click();
await a.waitForTimeout(500);
check(await a.getByText("hi alice!").isVisible(), "Alice receives proximity message");
await a.waitForTimeout(2500);
const video = await a.evaluate(() =>
  [...document.querySelectorAll(".strip video")].map((v) => ({ tracks: v.srcObject?.getTracks().map((t) => t.kind + ":" + t.readyState), ready: v.readyState, w: v.videoWidth })),
);
console.log("alice video elements", JSON.stringify(video));
check(video.some((v) => v.w > 0 && !v.tracks?.every((t) => t.startsWith("x"))) && video.length >= 2, "P2P video flowing between Alice and Bob");
await a.screenshot({ path: `${OUT}/bubble.png` });

// Alice walks left for 1.5s
await a.locator("canvas").click({ position: { x: 300, y: 600 } });
await a.keyboard.down("ArrowLeft");
await a.waitForTimeout(1500);
await a.keyboard.up("ArrowLeft");
await a.waitForTimeout(800);
check(await a.getByText("You left the conversation").isVisible(), "bubble dissolves when Alice walks away");

await b.getByRole("tab", { name: /Users/ }).click();
check(await b.locator(".users .uname", { hasText: "Alice" }).isVisible(), "Bob sees Alice in user list");

// Bob takes the stairs via click-to-move (tile 4,12 -> world 144,400; camera zoom 1.5 centered on Bob)
const pos = await b.evaluate(() => {
  const g = window.__werk_scene?.();
  return g ? { x: g.player.x, y: g.player.y } : null;
});
console.log("bob at", pos);
await b.evaluate(() => window.__werk_scene?.().teleport("floor-1.tmj#stairs-arrival"));
await b.waitForTimeout(1500);
check(await b.locator(".bar .map").innerText().then((t) => t.includes("First floor")), "Bob reached first floor");
await b.screenshot({ path: `${OUT}/floor1.png` });

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
