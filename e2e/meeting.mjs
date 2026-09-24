// Two players walk into the meeting room: LiveKit connects and video flows.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "test-results";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const errors = [];
const check = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) process.exitCode = 1; };
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

async function player(name) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem("werk.debug", "1"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(BASE);
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1000);
  return page;
}
const walkIn = (p, x, y) => p.evaluate(([x, y]) => { const s = window.__werk_scene(); s.goTo({ map: s.data0.map, entry: null, at: { x, y } }); }, [x, y]);

const a = await player("Alice");
const b = await player("Bob");
await walkIn(a, 720, 110);
await walkIn(b, 880, 170);
check(await until(() => a.getByText("2 in the room").isVisible()), "both in the meeting");
check(await until(() => a.evaluate(() => [...document.querySelectorAll(".meeting video")].some((v) => v.videoWidth > 0 && !v.muted))), "remote video flowing via LiveKit");
check(await a.locator(".strip").count() === 0, "no P2P bubble inside a meeting zone");
await a.waitForTimeout(1000);
await a.screenshot({ path: `${OUT}/meeting.png` });
await walkIn(b, 400, 300);
check(await until(() => a.getByText("1 in the room").isVisible()), "Bob left the meeting");
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
