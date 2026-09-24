<script lang="ts">
  import { chat, type ChatMessage } from "../../chat/matrix.svelte";

  let { msg }: { msg: ChatMessage } = $props();
  let url = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    if (msg.kind === "file") return;
    chat.media(msg, msg.kind === "image").then((u) => (url = u)).catch(() => (failed = true));
  });

  async function download() {
    try {
      const u = await chat.media(msg);
      const a = document.createElement("a");
      a.href = u;
      a.download = msg.body;
      a.click();
    } catch {
      failed = true;
    }
  }
  function size(n?: number) {
    if (!n) return "";
    return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1e3)} kB`;
  }
</script>

{#if failed}
  <span class="muted">⚠️ Could not load {msg.body}</span>
{:else if msg.kind === "image"}
  {#if url}<button class="img" onclick={download} title="Download {msg.body}"><img src={url} alt={msg.body} /></button>{:else}<span class="muted">Loading image…</span>{/if}
{:else if msg.kind === "video"}
  {#if url}<video src={url} controls></video>{/if}
{:else if msg.kind === "audio"}
  {#if url}<audio src={url} controls></audio>{/if}
{:else}
  <button class="file" onclick={download}>📎 {msg.body} <span class="muted">{size(msg.size)}</span></button>
{/if}

<style>
  .img { padding: 0; border: none; background: none; line-height: 0; }
  img, video { max-width: 240px; max-height: 200px; border-radius: 8px; }
  .file { text-align: left; }
  .muted { color: var(--muted); font-size: 12px; }
</style>
