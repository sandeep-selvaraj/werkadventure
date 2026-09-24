<script lang="ts">
  import { chat, type ChatMessage } from "../../chat/matrix.svelte";
  import EmojiPicker from "./EmojiPicker.svelte";
  import Media from "./Media.svelte";

  let {
    msg,
    roomId,
    showSender,
    onreply,
    onedit,
  }: { msg: ChatMessage; roomId: string; showSender: boolean; onreply: (m: ChatMessage) => void; onedit: (m: ChatMessage) => void } = $props();

  let picker = $state(false);
  const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

  function time(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  async function del() {
    if (confirm("Delete this message for everyone?")) await chat.remove(roomId, msg.id);
  }
</script>

{#if msg.kind === "state"}
  <div class="state">{msg.body}</div>
{:else}
  <div class="msg" class:mine={msg.mine} class:pending={msg.pending}>
    {#if showSender && !msg.mine}<div class="sender">{msg.senderName}</div>{/if}
    <div class="bubble-wrap">
      <div class="bubble" class:deleted={msg.kind === "deleted" || msg.kind === "undecryptable"}>
        {#if msg.replyTo}
          <div class="quote"><strong>{msg.replyTo.senderName}</strong> {msg.replyTo.body}</div>
        {/if}
        {#if msg.kind === "image" || msg.kind === "file" || msg.kind === "video" || msg.kind === "audio"}
          <Media {msg} />
        {:else if msg.kind === "emote"}
          <em>* {msg.senderName} {msg.body}</em>
        {:else}
          <span class="text">{msg.body}</span>
        {/if}
        <span class="time">{msg.edited ? "edited · " : ""}{time(msg.ts)}</span>
      </div>
      {#if msg.kind !== "deleted" && msg.kind !== "undecryptable" && !msg.pending}
        <div class="actions" class:open={picker}>
          {#each QUICK.slice(0, 3) as e}<button onclick={() => chat.react(roomId, msg, e)} aria-label="React {e}">{e}</button>{/each}
          <button onclick={() => (picker = !picker)} aria-label="More reactions">😀+</button>
          <button onclick={() => onreply(msg)} aria-label="Reply">↩</button>
          {#if msg.mine && (msg.kind === "text" || msg.kind === "emote")}<button onclick={() => onedit(msg)} aria-label="Edit">✎</button>{/if}
          {#if msg.mine}<button onclick={del} aria-label="Delete">🗑</button>{/if}
          {#if picker}
            <EmojiPicker onpick={(e) => { chat.react(roomId, msg, e); picker = false; }} onclose={() => (picker = false)} />
          {/if}
        </div>
      {/if}
    </div>
    {#if msg.reactions.length}
      <div class="reactions">
        {#each msg.reactions as r (r.key)}
          <button class:mine={!!r.mine} title={r.senders.join(", ")} onclick={() => chat.react(roomId, msg, r.key)}>{r.key} {r.count}</button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .state { text-align: center; color: var(--muted); font-size: 12px; margin: 4px 0; }
  .msg { display: flex; flex-direction: column; align-items: flex-start; }
  .msg.mine { align-items: flex-end; }
  .pending { opacity: 0.6; }
  .sender { font-size: 11px; color: var(--accent-2); margin: 4px 0 1px 4px; font-weight: 600; }
  .bubble-wrap { position: relative; display: flex; align-items: center; gap: 4px; max-width: 90%; }
  .mine .bubble-wrap { flex-direction: row-reverse; }
  .bubble { background: var(--panel-2); padding: 6px 10px; border-radius: 12px; word-break: break-word; white-space: pre-wrap; min-width: 0; }
  .mine .bubble { background: var(--accent); color: #fff; }
  .bubble.deleted { font-style: italic; opacity: 0.7; }
  .quote { border-left: 3px solid #fff8; padding-left: 6px; margin-bottom: 4px; font-size: 12px; opacity: 0.85; max-height: 3.2em; overflow: hidden; }
  .time { font-size: 10px; opacity: 0.6; margin-left: 6px; white-space: nowrap; }
  .actions { display: none; position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
  .bubble-wrap:hover .actions, .actions.open { display: flex; }
  .actions button { border: none; background: transparent; padding: 2px 5px; font-size: 13px; }
  .reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .reactions button { padding: 0 6px; font-size: 12px; border-radius: 999px; }
  .reactions button.mine { border-color: var(--accent); background: #4f7cff33; }
</style>
