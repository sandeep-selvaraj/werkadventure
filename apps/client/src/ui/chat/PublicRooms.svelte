<script lang="ts">
  import { chat } from "../../chat/matrix.svelte";
  import { toast } from "../../state.svelte";

  let { onclose, onjoined }: { onclose: () => void; onjoined: (id: string) => void } = $props();
  let rooms = $state<Awaited<ReturnType<typeof chat.publicRooms>>>([]);
  let loading = $state(true);
  let filter = $state("");

  $effect(() => {
    chat.publicRooms().then((r) => (rooms = r)).catch((e) => toast(e.message, "error")).finally(() => (loading = false));
  });
  const joined = $derived(new Set(chat.rooms.filter((r) => r.membership === "join").map((r) => r.id)));
  const shown = $derived(rooms.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase())));

  async function join(id: string) {
    try {
      onjoined(await chat.join(id));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
  <div class="dialog" role="dialog" aria-label="Public rooms" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === "Escape" && onclose()}>
    <h3>Public rooms</h3>
    <input bind:value={filter} placeholder="Search" />
    <div class="list">
      {#if loading}<p class="muted">Loading…</p>{:else if !shown.length}<p class="muted">No public rooms yet.</p>{/if}
      {#each shown as r (r.id)}
        <div class="row">
          <div><strong>{r.name}</strong><div class="muted">{r.topic || `${r.members} members`}</div></div>
          {#if joined.has(r.id)}
            <button onclick={() => onjoined(r.id)}>Open</button>
          {:else}
            <button class="primary" onclick={() => join(r.id)}>Join</button>
          {/if}
        </div>
      {/each}
    </div>
    <div class="actions"><button onclick={onclose}>Close</button></div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; display: grid; place-items: center; z-index: 80; padding: 16px; }
  .dialog { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px; width: min(440px, 100%); display: flex; flex-direction: column; gap: 10px; max-height: 80vh; }
  h3 { margin: 0; }
  .list { overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px; border-radius: 8px; background: var(--panel-2); }
  .muted { color: var(--muted); font-size: 12px; }
  .actions { display: flex; justify-content: flex-end; }
</style>
