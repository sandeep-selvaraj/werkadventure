<script lang="ts">
  import { chat } from "../chat/matrix.svelte";
  import { app, toast } from "../state.svelte";
  import AvatarPreview from "./AvatarPreview.svelte";

  let { id, onclose }: { id: string; onclose: () => void } = $props();
  const player = $derived(app.players[id]);
  const online = $derived(app.online.find((u) => u.id === id));

  async function message() {
    try {
      const room = await chat.dm(online!.matrixId!);
      app.chatOpen = true;
      app.chatTab = "chat";
      chat.open(room);
      onclose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function invite() {
    app.conn?.send({ t: "invite", to: id });
    onclose();
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
  <div class="card" role="dialog" aria-label="User" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === "Escape" && onclose()}>
    {#if player}<AvatarPreview avatar={player.avatar} size={64} />{/if}
    <h3>{player?.name ?? online?.name ?? "User"}</h3>
    {#if online && online.map !== app.map}<p class="muted">On another floor</p>{/if}
    <div class="actions">
      <button class="primary" onclick={invite}>Invite to meet</button>
      {#if online?.matrixId && chat.status === "ready"}<button onclick={message}>Send message</button>{/if}
      <button onclick={onclose}>Close</button>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: #0006; display: grid; place-items: center; z-index: 70; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px; min-width: 260px; text-align: center; }
  h3 { margin: 8px 0 4px; }
  .muted { color: var(--muted); margin: 0; }
  .actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
</style>
