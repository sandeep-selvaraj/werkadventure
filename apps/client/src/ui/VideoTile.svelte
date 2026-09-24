<script lang="ts">
  import type { Avatar } from "@werk/shared";
  import AvatarPreview from "./AvatarPreview.svelte";
  import { srcObject } from "./srcObject";

  let {
    stream,
    name,
    avatar,
    cam,
    mic,
    muted = false,
    mirror = false,
    speaking = false,
    large = false,
  }: {
    stream: MediaStream | null;
    name: string;
    avatar?: Avatar;
    cam: boolean;
    mic: boolean;
    muted?: boolean;
    mirror?: boolean;
    speaking?: boolean;
    large?: boolean;
  } = $props();
</script>

<figure class="tile" class:speaking class:large>
  <video use:srcObject={stream} autoplay playsinline {muted} class:mirror class:hidden={!cam}></video>
  {#if !cam}
    <div class="placeholder">
      {#if avatar}<AvatarPreview {avatar} size={56} />{:else}<span class="initial">{name[0]}</span>{/if}
    </div>
  {/if}
  <figcaption>{#if !mic}<span title="Muted">🔇</span>{/if}{name}</figcaption>
</figure>

<style>
  .tile { position: relative; margin: 0; width: 180px; aspect-ratio: 4 / 3; background: #15141d; border-radius: 10px; overflow: hidden;
    border: 2px solid var(--line); flex: none; }
  .tile.large { width: min(640px, 70vw); }
  .tile.speaking { border-color: var(--ok); }
  video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .large video { object-fit: contain; }
  video.mirror { transform: scaleX(-1); }
  video.hidden { position: absolute; opacity: 0; pointer-events: none; }
  .placeholder { position: absolute; inset: 0; display: grid; place-items: center; }
  .initial { font-size: 32px; font-weight: 700; }
  figcaption { position: absolute; left: 6px; bottom: 6px; background: #000a; padding: 1px 6px; border-radius: 6px; font-size: 12px; display: flex; gap: 4px; }
</style>
