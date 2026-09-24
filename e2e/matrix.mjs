// Matrix chat: encrypted room, invite, message, reaction, reply, edit, DM, key backup.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "test-results";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const errors = [];
browser.on("disconnected", () => console.log("BROWSER DISCONNECTED", new Date().toISOString()));
console.log("start", new Date().toISOString());
const check = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) process.exitCode = 1; };
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

async function player(name) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem("werk.media", JSON.stringify({ cam: false, mic: false })));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("dialog", (d) => d.accept());
  page.on("crash", () => console.log(`${name} PAGE CRASHED`));
  page.on("close", () => console.log(`${name} page closed`));
  await page.goto(BASE);
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Enter" }).click();
  await page.getByRole("tab", { name: /^Chat/ }).click();
  return page;
}

const a = await player("Alice");
const b = await player("Bob");
check(await until(() => a.getByText("Rooms", { exact: true }).isVisible()), "Alice chat connected");

// key backup
await a.getByRole("button", { name: "Set up" }).click();
check(await until(() => a.getByText("Save your recovery key").isVisible(), 20000), "recovery key generated");
await a.getByRole("button", { name: "I saved it" }).click();

// create encrypted private room
await a.getByRole("button", { name: "New", exact: true }).click();
await a.getByRole("menuitem", { name: "New room" }).click();
await a.getByLabel("Name").fill("Team");
await a.getByRole("button", { name: "Create" }).click();
check(await until(() => a.getByText("End-to-end encryption enabled").isVisible()), "encrypted room created");

// invite Bob
await a.getByRole("button", { name: "Members" }).click();
await until(() => a.getByRole("button", { name: "＋ Bob" }).isVisible());
await a.getByRole("button", { name: "＋ Bob" }).click();
check(await until(() => b.getByText("Invitations").isVisible()), "Bob gets the invitation");
await b.getByRole("button", { name: "Join" }).click();
check(await until(() => b.getByPlaceholder("Message Team").isVisible()), "Bob joined Team");

await b.getByPlaceholder("Message Team").fill("hello team");
await b.keyboard.press("Enter");
check(await until(() => a.locator(".bubble .text", { hasText: "hello team" }).isVisible()), "Alice decrypts Bob's message");

// reaction
await a.locator(".bubble-wrap", { hasText: "hello team" }).hover();
await a.getByRole("button", { name: "React 👍" }).click();
check(await until(() => b.locator(".reactions button", { hasText: "👍 1" }).isVisible()), "Bob sees Alice's reaction");

// reply
await a.locator(".bubble-wrap", { hasText: "hello team" }).hover();
await a.getByRole("button", { name: "Reply" }).click();
await a.getByPlaceholder("Message Team").fill("welcome!");
await a.keyboard.press("Enter");
check(await until(() => b.locator(".bubble", { hasText: "welcome!" }).locator(".quote").isVisible()), "Bob sees the reply quote");

// edit
await b.getByPlaceholder("Message Team").click();
await b.keyboard.press("ArrowUp");
await b.getByPlaceholder("Message Team").fill("hello team, edited");
await b.keyboard.press("Enter");
const editOk = await until(() => a.locator(".bubble", { hasText: "hello team, edited" }).isVisible());
if (!editOk) console.log("EDIT alice:", await a.locator(".timeline").innerText(), "\nEDIT bob:", await b.locator(".timeline").innerText());
check(editOk, "Alice sees the edit");
await a.screenshot({ path: `${OUT}/matrix-room.png` });

// typing indicator
await b.getByPlaceholder("Message Team").pressSequentially("typ");
check(await until(() => a.getByText("Bob is typing…").isVisible()), "typing indicator");
await b.getByPlaceholder("Message Team").fill("");

// DM from users tab
await b.getByRole("button", { name: "Back to rooms" }).click();
await b.getByRole("tab", { name: /Users/ }).click();
await b.getByTitle("Send a message").click();
await until(() => b.getByPlaceholder(/Message/).isVisible());
await b.locator("textarea").fill("psst, a DM");
await b.keyboard.press("Enter");
await a.getByRole("button", { name: "Back to rooms" }).click();
check(await until(() => a.getByText("wants to chat with you").isVisible()), "Alice gets DM invite");
await a.getByRole("button", { name: "Join" }).click();
const dmOk = await until(() => a.locator(".bubble .text", { hasText: "psst, a DM" }).isVisible(), 20000);
if (!dmOk) console.log("alice timeline:", await a.locator(".timeline").innerText(), "\nbob timeline:", await b.locator(".timeline").innerText());
check(dmOk, "Alice reads the encrypted DM");
await a.getByRole("button", { name: "Back to rooms" }).click();
await a.screenshot({ path: `${OUT}/matrix-list.png` });

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
