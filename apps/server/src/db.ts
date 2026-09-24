import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import type { Avatar } from "@werk/shared";
import { config } from "./config.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface Account {
  username: string;
  name: string;
  avatar: Avatar | null;
  admin: boolean;
}

let db: DatabaseSync | null = null;

function open(): DatabaseSync {
  if (db) return db;
  mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(join(config.dataDir, "werk.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

export const USERNAME = /^[a-z0-9._-]{2,32}$/;

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verify(password: string, stored: string): Promise<boolean> {
  const [, salt, key] = stored.split("$");
  const got = await scrypt(password, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(got, Buffer.from(key, "hex"));
}

function row(r: Record<string, unknown> | undefined): Account | null {
  if (!r) return null;
  return {
    username: String(r.username),
    name: String(r.name),
    avatar: r.avatar ? (JSON.parse(String(r.avatar)) as Avatar) : null,
    admin: r.admin === 1,
  };
}

export async function createAccount(username: string, password: string, admin = false): Promise<Account> {
  if (!USERNAME.test(username)) throw new Error("username must be 2-32 chars of a-z 0-9 . _ -");
  if (password.length < 8) throw new Error("password must be at least 8 characters");
  const d = open();
  if (d.prepare("SELECT 1 FROM accounts WHERE username = ?").get(username)) throw new Error("username taken");
  d.prepare("INSERT INTO accounts (username, password, name, admin, created_at) VALUES (?, ?, ?, ?, ?)").run(
    username,
    await hash(password),
    username,
    admin ? 1 : 0,
    Date.now(),
  );
  return { username, name: username, avatar: null, admin };
}

export async function checkLogin(username: string, password: string): Promise<Account | null> {
  const r = open().prepare("SELECT * FROM accounts WHERE username = ?").get(username.toLowerCase()) as Record<string, unknown> | undefined;
  if (!r || !(await verify(password, String(r.password)))) return null;
  return row(r);
}

export function getAccount(username: string): Account | null {
  return row(open().prepare("SELECT * FROM accounts WHERE username = ?").get(username) as Record<string, unknown> | undefined);
}

export function updateProfile(username: string, name: string, avatar: Avatar): void {
  open().prepare("UPDATE accounts SET name = ?, avatar = ? WHERE username = ?").run(name, JSON.stringify(avatar), username);
}

export async function setPassword(username: string, password: string): Promise<void> {
  open().prepare("UPDATE accounts SET password = ? WHERE username = ?").run(await hash(password), username);
}

export function deleteAccount(username: string): boolean {
  return open().prepare("DELETE FROM accounts WHERE username = ?").run(username).changes > 0;
}

export function listAccounts(): Account[] {
  return (open().prepare("SELECT * FROM accounts ORDER BY username").all() as Record<string, unknown>[]).map((r) => row(r)!);
}
