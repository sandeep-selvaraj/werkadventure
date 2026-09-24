<script lang="ts">
  import { tick } from "svelte";
  import { chat, type ChatMessage } from "../../chat/matrix.svelte";
  import { app, toast } from "../../state.svelte";
  import EmojiPicker from "./EmojiPicker.svelte";
  import MessageItem from "./MessageItem.svelte";

  let { roomId, onback }: { roomId: string; onback: () => void } = $props();

  const room = $derived(chat.rooms.find((r) => r.id === roomId));
  let text = $state("");
  let replyTo = $state<ChatMessage | null>(null);
  let editing = $state<ChatMessage | null>(null);
  let picker = $state(false);
  let showMembers = $state(false);
  let list: HTMLDivElement | undefined = $state();
  let input: HTMLTextAreaElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let stickToBottom = true;
  let typingTimer: number | undefined;

  let loading = false;
  async function loadOlder() {
    if (loading || !chat.canLoadMore) return;
    loading = true;
    try {
      await chat.loadMore();
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void chat.timeline;
    tick().then(() => {
      if (!list) return;
      if (stickToBottom) list.scrollTo({ top: list.scrollHeight });
      // a freshly joined room only contains our join event: fetch history until the view is full
      if (list.scrollHeight <= list.clientHeight + 20) loadOlder();
    });
  });

  function onScroll() {
    if (!list) return;
    stickToBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (list.scrollTop < 20 && chat.canLoadMore && !loading) {
      const h = list.scrollHeight;
      loadOlder().then(() => tick()).then(() => list && (list.scrollTop = list.scrollHeight - h));
    }
  }

  async function submit(e?: Event) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    const r = replyTo, ed = editing;
    text = "";
    replyTo = null;
    editing = null;
    stickToBottom = true;
    chat.setTyping(roomId, false);
    try {
      if (ed) await chat.edit(roomId, ed, t);
      else await chat.send(roomId, t, r ?? undefined);
    } catch (err) {
      toast(`Message not sent: ${(err as Error).message}`, "error");
      text = t;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) submit(e);
    else if (e.key === "Escape") {
      replyTo = null;
      editing = null;
    } else if (e.key === "ArrowUp" && !text) {
      const mine = [...chat.timeline].reverse().find((m) => m.mine && m.kind === "text");
      if (mine) startEdit(mine);
    }
  }

  function onInput() {
    chat.setTyping(roomId, true);
    clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => chat.setTyping(roomId, false), 4000);
  }

  function startEdit(m: ChatMessage) {
    editing = m;
    replyTo = null;
    text = m.body;
    input?.focus();
  }

  async function onFiles(files: FileList | null) {
    for (const f of files ?? []) {
      if (f.size > 50e6) {
        toast(`${f.name} is larger than 50 MB`, "error");
        continue;
      }
      try {
        await chat.upload(roomId, f);
      } catch (err) {
        toast(`Upload failed: ${(err as Error).message}`, "error");
      }
    }
    if (fileInput) fileInput.value = "";
  }

  async function inviteUser(matrixId: string) {
    try {
      await chat.invite(roomId, matrixId);
      toast("Invitation sent");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function leave() {
    if (!confirm(`Leave ${room?.name}?`)) return;
    await chat.leave(roomId);
    onback();
  }

  function day(ts: number) {
    return new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  // re-read on every timeline change so joins/leaves show up
  const members = $derived.by(() => {
    void chat.timeline;
    return showMembers ? chat.members(roomId) : [];
  });
  const invitable = $derived(app.online.filter((u) => u.matrixId && u.matrixId !== chat.userId && !members.some((m) => m.userId === u.matrixId && m.membership === "join")));
</script>

<div class="view" role="region" aria-label={room?.name}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer?.files ?? null); }}>
  <header>
    <button class="icon" onclick={onback} aria-label="Back to rooms">←</button>
    <div class="title">
      <strong>{room?.encrypted ? "🔒 " : ""}{room?.name}</strong>
      <span class="muted">{room?.memberCount ?? 0} members</span>
    </div>
    <button class="icon" onclick={() => (showMembers = !showMembers)} aria-label="Members">👥</button>
    {#if !room?.isDm}<button class="icon" onclick={leave} aria-label="Leave room">⎋</button>{/if}
  </header>

  {#if showMembers}
    <div class="members">
      {#each members.filter((m) => m.membership === "join" || m.membership === "invite") as m (m.userId)}
        <div class="member"><span class="dot" class:on={app.online.some((u) => u.matrixId === m.userId)}></span>{m.name}{m.membership === "invite" ? " (invited)" : ""}</div>
      {/each}
      {#if !room?.isDm && invitable.length}
        <h5>Invite someone online</h5>
        {#each invitable as u (u.id)}
          <button class="member invite" onclick={() => inviteUser(u.matrixId!)}>＋ {u.name}</button>
        {/each}
      {/if}
    </div>
  {/if}

  <div class="timeline" bind:this={list} onscroll={onScroll}>
    {#if !chat.canLoadMore}<div class="start muted">Start of conversation</div>{/if}
    {#each chat.timeline as m, i (m.id)}
      {#if i === 0 || day(chat.timeline[i - 1].ts) !== day(m.ts)}<div class="day">{day(m.ts)}</div>{/if}
      <MessageItem
        msg={m}
        {roomId}
        showSender={i === 0 || chat.timeline[i - 1].sender !== m.sender || chat.timeline[i - 1].kind === "state"}
        onreply={(msg) => { replyTo = msg; editing = null; input?.focus(); }}
        onedit={startEdit}
      />
    {/each}
    {#if chat.readBy.length}<div class="seen">Seen by {chat.readBy.join(", ")}</div>{/if}
  </div>

  <div class="typing">{#if chat.typing.length}{chat.typing.join(", ")} {chat.typing.length > 1 ? "are" : "is"} typing…{/if}</div>

  {#if replyTo || editing}
    <div class="context">
      <span>{editing ? "Editing message" : `Replying to ${replyTo!.senderName}: ${replyTo!.body.slice(0, 60)}`}</span>
      <button class="icon" onclick={() => { replyTo = null; if (editing) text = ""; editing = null; }} aria-label="Cancel">✕</button>
    </div>
  {/if}

  <form class="composer" onsubmit={submit}>
    <input type="file" multiple hidden bind:this={fileInput} onchange={(e) => onFiles((e.target as HTMLInputElement).files)} />
    <button type="button" class="icon" onclick={() => fileInput?.click()} aria-label="Attach file">📎</button>
    <textarea bind:this={input} bind:value={text} rows="1" placeholder="Message {room?.name ?? ''}" onkeydown={onKey} oninput={onInput}></textarea>
    <div class="emoji">
      <button type="button" class="icon" onclick={() => (picker = !picker)} aria-label="Emoji">😀</button>
      {#if picker}<EmojiPicker onpick={(e) => { text += e; input?.focus(); }} onclose={() => (picker = false)} />{/if}
    </div>
    <button class="primary" disabled={!text.trim()}>{editing ? "Save" : "Send"}</button>
  </form>
</div>

<style>
  .view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .title { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .title strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .muted { color: var(--muted); font-size: 12px; }
  .icon { border: none; background: transparent; padding: 4px 8px; }
  .members { max-height: 40%; overflow-y: auto; padding: 6px 12px; border-bottom: 1px solid var(--line); }
  .member { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 13px; width: 100%; }
  .member.invite { border: none; background: transparent; color: var(--accent-2); padding: 3px 0; }
  h5 { margin: 8px 0 2px; color: var(--muted); font-weight: 500; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line); }
  .dot.on { background: var(--ok); }
  .timeline { flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
  .start { text-align: center; margin: 6px 0; }
  .day { text-align: center; font-size: 11px; color: var(--muted); margin: 8px 0 4px; }
  .seen { text-align: right; font-size: 11px; color: var(--muted); }
  .typing { min-height: 18px; padding: 0 12px; font-size: 12px; color: var(--muted); font-style: italic; }
  .context { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; font-size: 12px; background: var(--panel-2); color: var(--muted); }
  .composer { display: flex; gap: 4px; padding: 8px; border-top: 1px solid var(--line); align-items: flex-end; }
  textarea { flex: 1; resize: none; min-width: 0; max-height: 120px; }
  .emoji { position: relative; }
</style>
