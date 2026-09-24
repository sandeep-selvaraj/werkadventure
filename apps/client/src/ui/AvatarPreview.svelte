<script lang="ts">
  import type { Avatar } from "@werk/shared";
  import { drawAvatarSheet, FRAME } from "../game/avatar";

  let { avatar, size = 64, dir = 0 }: { avatar: Avatar; size?: number; dir?: number } = $props();
  let canvas: HTMLCanvasElement;

  $effect(() => {
    const sheet = drawAvatarSheet(avatar);
    const g = canvas.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, size, size);
    g.drawImage(sheet, 0, dir * FRAME, FRAME, FRAME, 0, 0, size, size);
  });
</script>

<canvas bind:this={canvas} width={size} height={size} style="image-rendering: pixelated"></canvas>
