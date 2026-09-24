<script lang="ts">
  import { tick } from "svelte";
  import { chat } from "../chat/matrix.svelte";
  import { app, toast } from "../state.svelte";
  import MatrixTab from "./chat/MatrixTab.svelte";

  let { onusercard }: { onusercard: (id: string) => void } = $props();

  let text = $state("");
  let list: HTMLDivElement | undefined = $state();
  let typingSent = 0;
  let now = $state(Date.now());

  const inConversation = $derived(!!app.bubble.id || !!app.area.name);
  const typers = $derived(
    Object.entries(app.typing)
      .filter(([, t]) => now - t < 5000)
      .map(([id]) => app.players[id]?.name ?? "Someone"),
  );
  const floors = $derived.by(() => {
    const m = new Map<string, typeof app.online>();
    for (const u of app.online) {
      if (!m.has(u.map)) m.set(u.map, []);
      m.get(u.map)!.push(u);
    }
    return [...m.entries()];
  });

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  $effect(() => {
    void app.proximity.length;
    if (app.chatOpen) app.unreadProximity = 0;
    tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
  });

  function send(e: Event) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    app.conn?.send({ t: "chat", text: t });
    app.conn?.send({ t: "typing", typing: false });
    typingSent = 0;
    text = "";
  }

  function onInput() {
    if (Date.now() - typingSent > 3000) {
      typingSent = Date.now();
      app.conn?.send({ t: "typing", typing: true });
    }
  }

  async function message(matrixId: string) {
    try {
      const id = await chat.dm(matrixId);
      app.chatTab = "chat";
      chat.open(id);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function time(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function floorName(map: string) {
    return map.split("/").pop()?.replace(/\.tmj$/, "") ?? map;
  }
</script>

{#if app.chatOpen}
  <aside class="panel" aria-label="Chat">
    <header>
      <div class="tabs" role="tablist">
        <button role="tab" class:active={app.chatTab === "proximity"} onclick={() => (app.chatTab = "proximity")}>Proximity</button>
        {#if app.features.matrix}
          <button role="tab" class:active={app.chatTab === "chat"} onclick={() => (app.chatTab = "chat")}>Chat{#if chat.totalUnread}<span class="count unread">{chat.totalUnread}</span>{/if}</button>
        {/if}
        <button role="tab" class:active={app.chatTab === "users"} onclick={() => (app.chatTab = "users")}>Users <span class="count">{app.online.length}</span></button>
      </div>
      <button class="icon" aria-label="Close chat" onclick={() => (app.chatOpen = false)}>✕</button>
    </header>

    {#if app.chatTab === "proximity"}
      <div class="messages" bind:this={list}>
        {#if !app.proximity.length}
          <p class="empty">Walk up to someone to start a conversation. Messages here are not saved and disappear when you reload.</p>
        {/if}
        {#each app.proximity as m (m.id)}
          {#if m.scope === "system"}
            <div class="system">{m.text}</div>
          {:else}
            <div class="msg" class:mine={m.mine}>
              <div class="meta"><strong>{m.mine ? "You" : m.name}</strong> <span>{time(m.ts)}</span>{#if m.scope === "area"}<span class="tag">area</span>{/if}</div>
              <div class="body">{m.text}</div>
            </div>
          {/if}
        {/each}
      </div>
      <div class="typing">{#if typers.length}{typers.join(", ")} {typers.length > 1 ? "are" : "is"} typing…{/if}</div>
      <form class="composer" onsubmit={send}>
        <input
          bind:value={text}
          oninput={onInput}
          disabled={!inConversation}
          placeholder={inConversation ? (app.bubble.id ? "Message the people around you" : `Message ${app.area.name}`) : "Not in a conversation"}
          maxlength="2000"
        />
        <button class="primary" disabled={!inConversation || !text.trim()}>Send</button>
      </form>
    {:else if app.chatTab === "chat"}
      <MatrixTab />
    {:else}
      <div class="users">
        {#each floors as [map, users]}
          <h4>{floorName(map)}{map === app.map ? " (here)" : ""}</h4>
          {#each users as u (u.id)}
            <div class="user">
              <span class="dot"></span><span class="uname">{u.name}{u.id === app.me?.id ? " (you)" : ""}</span>
              {#if u.id !== app.me?.id}
                {#if u.matrixId && chat.status === "ready"}<button class="small" onclick={() => message(u.matrixId!)} title="Send a message">💬</button>{/if}
                <button class="small" onclick={() => onusercard(u.id)} title="Invite to meet">📍</button>
              {/if}
            </div>
          {/each}
        {/each}
      </div>
    {/if}
  </aside>
{/if}

<style>
  .panel { position: fixed; top: 12px; right: 12px; bottom: 76px; width: min(360px, calc(100vw - 24px)); display: flex; flex-direction: column;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px; z-index: 40; overflow: hidden; backdrop-filter: blur(6px); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 8px; border-bottom: 1px solid var(--line); gap: 8px; }
  .tabs { display: flex; gap: 4px; }
  .tabs button { border: none; background: transparent; color: var(--muted); }
  .tabs button.active { background: var(--panel-2); color: var(--text); }
  .count { background: var(--line); border-radius: 999px; padding: 0 6px; font-size: 11px; margin-left: 2px; }
  .icon { border: none; background: transparent; padding: 4px 8px; }
  .messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .empty { color: var(--muted); text-align: center; margin-top: 30%; font-size: 13px; }
  .system { color: var(--muted); font-size: 12px; text-align: center; }
  .msg { align-self: flex-start; max-width: 85%; }
  .msg.mine { align-self: flex-end; text-align: right; }
  .meta { font-size: 11px; color: var(--muted); }
  .meta strong { color: var(--text); }
  .tag { margin-left: 4px; background: var(--line); border-radius: 4px; padding: 0 4px; }
  .body { background: var(--panel-2); padding: 6px 10px; border-radius: 10px; white-space: pre-wrap; word-break: break-word; text-align: left; display: inline-block; }
  .mine .body { background: var(--accent); color: #fff; }
  .typing { min-height: 18px; padding: 0 12px; font-size: 12px; color: var(--muted); font-style: italic; }
  .composer { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line); }
  .composer input { flex: 1; min-width: 0; }
  .users { flex: 1; overflow-y: auto; padding: 8px 12px; }
  h4 { margin: 10px 0 4px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .user { display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px; border-radius: 8px; }
  .user:hover { background: var(--panel-2); }
  .uname { flex: 1; }
  .small { padding: 2px 8px; font-size: 13px; }
  .count.unread { background: var(--accent); color: #fff; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
</style>
