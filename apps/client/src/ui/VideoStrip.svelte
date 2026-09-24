<script lang="ts">
  import { media } from "../av/media.svelte";
  import { p2p } from "../av/p2p.svelte";
  import { app } from "../state.svelte";
  import VideoTile from "./VideoTile.svelte";
</script>

{#if app.bubble.id && p2p.peers.length}
  <section class="strip" aria-label="Conversation video">
    {#each p2p.peers as peer (peer.id)}
      {#if peer.screen}
        <VideoTile stream={peer.screen} name="{app.players[peer.id]?.name ?? '…'}'s screen" cam={true} mic={true} muted large />
      {/if}
      <VideoTile stream={peer.stream} name={app.players[peer.id]?.name ?? "…"} avatar={app.players[peer.id]?.avatar} cam={peer.cam} mic={peer.mic} />
    {/each}
    {#if media.screen}
      <VideoTile stream={media.screen} name="Your screen" cam={true} mic={true} muted />
    {/if}
    <VideoTile stream={media.stream} name="You" avatar={app.identity?.avatar} cam={media.cam} mic={media.mic} muted mirror speaking={media.speaking} />
  </section>
{/if}

<style>
  .strip { position: fixed; top: 12px; left: 12px; right: 388px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; z-index: 30; pointer-events: none; }
  .strip :global(.tile) { pointer-events: auto; }
  @media (max-width: 760px) { .strip { right: 12px; top: 56px; } .strip :global(.tile) { width: 120px; } }
</style>
