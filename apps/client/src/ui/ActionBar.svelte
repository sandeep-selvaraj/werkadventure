<script lang="ts">
  import { media } from "../av/media.svelte";
  import { app } from "../state.svelte";

  let { onleave }: { onleave: () => void } = $props();
</script>

<nav class="bar" aria-label="Actions">
  <span class="map" title={app.map}>{app.mapName}</span>
  <button class:off={!media.mic} onclick={() => media.setMic(!media.mic)} aria-label={media.mic ? "Mute microphone" : "Unmute microphone"}>{media.mic ? "🎙️" : "🔇"}</button>
  <button class:off={!media.cam} onclick={() => media.setCam(!media.cam)} aria-label={media.cam ? "Turn camera off" : "Turn camera on"}>{media.cam ? "📷" : "🚫"}</button>
  <button class:on={media.screenOn} onclick={() => media.toggleScreen()} aria-label="Share screen" title="Share screen">🖥️</button>
  {#if app.bubble.id}
    <button
      class:danger={app.bubble.locked}
      title={app.bubble.locked ? "Unlock conversation" : "Lock conversation: nobody else can join"}
      onclick={() => app.conn?.send({ t: "lockBubble", locked: !app.bubble.locked })}
    >{app.bubble.locked ? "🔒" : "🔓"}</button>
  {/if}
  <button class="chat" onclick={() => { app.chatOpen = !app.chatOpen; app.unreadProximity = 0; }} aria-label="Toggle chat">
    💬{#if app.unreadProximity}<span class="badge">{app.unreadProximity}</span>{/if}
  </button>
  <button onclick={onleave} title="Change name / avatar">👤</button>
</nav>

<style>
  .bar { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 6px; z-index: 45; max-width: calc(100vw - 24px); }
  .map { padding: 0 8px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
  button { position: relative; min-width: 40px; height: 40px; font-size: 18px; }
  .off { background: #4a2330; border-color: var(--danger); }
  .on { background: var(--accent); }
  .badge { position: absolute; top: -4px; right: -4px; background: var(--danger); color: #fff; font-size: 11px; border-radius: 999px; padding: 0 5px; }
</style>
