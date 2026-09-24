import { app, pushProximity, toast } from "../state.svelte";
import { Connection } from "./connection";

/** Open the socket and wire server events into app state. */
export function startSession(token: string): Connection {
  const conn = new Connection(token);
  app.conn = conn;
  let lastBubble: string[] = [];

  conn.on("welcome", (m) => {
    app.me = m.you;
  });
  conn.on("bubble", (m) => {
    const name = (id: string) => app.players[id]?.name ?? "Someone";
    const me = app.me?.id;
    if (!lastBubble.length && m.members.length) {
      pushProximity(sys(`You joined a conversation with ${m.members.filter((id) => id !== me).map(name).join(", ")}`));
    } else if (lastBubble.length && !m.members.length) {
      pushProximity(sys("You left the conversation"));
    } else {
      for (const id of m.members) if (!lastBubble.includes(id) && id !== me) pushProximity(sys(`${name(id)} joined the conversation`));
      for (const id of lastBubble) if (!m.members.includes(id) && id !== me) pushProximity(sys(`${name(id)} left the conversation`));
    }
    lastBubble = m.members;
    app.bubble = { id: m.id, members: m.members, locked: m.locked };
  });
  conn.on("chat", (m) => {
    pushProximity({ scope: m.scope, from: m.from, name: m.name, text: m.text, ts: m.ts, mine: m.from === app.me?.id });
    delete app.typing[m.from];
  });
  conn.on("typing", (m) => {
    if (m.typing) app.typing[m.from] = Date.now();
    else delete app.typing[m.from];
  });
  conn.on("online", (m) => {
    app.online = m.users;
  });
  conn.on("invite", (m) => {
    if (!app.invites.some((i) => i.from === m.from)) app.invites.push({ from: m.from, name: m.name, map: m.map, x: m.x, y: m.y });
  });
  conn.on("inviteReply", (m) => {
    toast(m.accept ? `${m.name} accepted your invitation and is on the way` : `${m.name} declined your invitation`);
  });
  let wasDown = false;
  conn.on("error", (m) => {
    if (m.msg === "disconnected") {
      if (!wasDown) toast("Connection lost, reconnecting…", "error");
      wasDown = true;
      return;
    }
    if (m.msg === "unauthorized") return;
    toast(m.msg, "error");
  });
  conn.on("welcome", () => {
    if (wasDown) toast("Reconnected");
    wasDown = false;
  });
  conn.connect();
  return conn;
}

function sys(text: string) {
  return { scope: "system" as const, from: "", name: "", text, ts: Date.now(), mine: false };
}
