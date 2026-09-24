<script lang="ts">
  import { media } from "../av/media.svelte";
  import { meeting } from "../av/meeting.svelte";
  import { app } from "../state.svelte";
  import VideoTile from "./VideoTile.svelte";

  let minimized = $state(false);
</script>

{#if app.area.meeting}
  <section class="meeting" class:min={minimized} aria-label="Meeting">
    <header>
      <strong>📹 {app.area.name ?? "Meeting"}</strong>
      <span class="muted">{meeting.connecting ? "connecting…" : `${meeting.peers.length + 1} in the room`}</span>
      <button class="icon" onclick={() => (minimized = !minimized)} aria-label={minimized ? "Expand meeting" : "Minimize meeting"}>{minimized ? "▢" : "–"}</button>
    </header>
    {#if !minimized}
      <div class="grid">
        {#each meeting.peers.filter((p) => p.screen) as p (p.id + ":screen")}
          <VideoTile stream={p.screen} name="{p.name}'s screen" cam={true} mic={true} muted large />
        {/each}
        {#each meeting.peers as p (p.id)}
          <VideoTile stream={p.stream} name={p.name} avatar={p.avatar} cam={p.cam} mic={p.mic} speaking={p.speaking} />
        {/each}
        {#if media.screen}<VideoTile stream={media.screen} name="Your screen" cam={true} mic={true} muted />{/if}
        <VideoTile stream={media.stream} name="You" avatar={app.identity?.avatar} cam={media.cam} mic={media.mic} muted mirror speaking={media.speaking} />
      </div>
    {:else}
      <!-- keep remote audio playing while minimized -->
      {#each meeting.peers as p (p.id)}<audio use:play={p.stream} autoplay></audio>{/each}
    {/if}
  </section>
{/if}

<script module lang="ts">
  export function play(el: HTMLAudioElement, s: MediaStream) {
    el.srcObject = s;
    return { update: (n: MediaStream) => (el.srcObject = n) };
  }
</script>

<style>
  .meeting { position: fixed; top: 12px; left: 12px; right: 388px; max-height: 62vh; overflow-y: auto; z-index: 35;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 8px; }
  .meeting.min { right: auto; }
  header { display: flex; align-items: center; gap: 8px; padding: 0 4px 6px; }
  .muted { color: var(--muted); font-size: 12px; flex: 1; }
  .icon { border: none; background: transparent; padding: 2px 8px; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .grid :global(.tile) { width: 220px; }
  .grid :global(.tile.large) { width: min(720px, 100%); }
  @media (max-width: 760px) { .meeting { right: 12px; } .grid :global(.tile) { width: 140px; } }
</style>
