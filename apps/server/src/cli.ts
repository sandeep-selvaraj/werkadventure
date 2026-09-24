import { createInterface } from "node:readline/promises";
import { createAccount, deleteAccount, listAccounts, setPassword } from "./db.js";

/** Admin CLI: `werk user add <name> [--admin]`, `werk user list`, `werk user passwd <name>`, `werk user delete <name>` */
const [cmd, sub, name, ...rest] = process.argv.slice(2);

async function askPassword(): Promise<string> {
  if (process.env.WERK_PASSWORD) return process.env.WERK_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question("Password: ");
  rl.close();
  return pw;
}

try {
  if (cmd === "user" && sub === "add" && name) {
    const a = await createAccount(name, await askPassword(), rest.includes("--admin"));
    console.log(`created ${a.username}${a.admin ? " (admin)" : ""}`);
  } else if (cmd === "user" && sub === "list") {
    for (const a of listAccounts()) console.log(`${a.username}\t${a.name}${a.admin ? "\tadmin" : ""}`);
  } else if (cmd === "user" && sub === "passwd" && name) {
    await setPassword(name, await askPassword());
    console.log("password updated");
  } else if (cmd === "user" && sub === "delete" && name) {
    console.log(deleteAccount(name) ? "deleted" : "no such user");
  } else {
    console.log("usage: werk user add <username> [--admin] | list | passwd <username> | delete <username>");
    process.exit(1);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
