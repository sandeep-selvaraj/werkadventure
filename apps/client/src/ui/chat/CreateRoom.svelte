<script lang="ts">
  import { chat, type HistoryVisibility } from "../../chat/matrix.svelte";
  import { toast } from "../../state.svelte";

  let { kind, onclose, oncreated }: { kind: "room" | "folder"; onclose: () => void; oncreated: (id: string) => void } = $props();

  let name = $state("");
  let topic = $state("");
  let isPublic = $state(false);
  let encrypted = $state(true);
  let history = $state<HistoryVisibility>("shared");
  let parent = $state<string | null>(null);
  let busy = $state(false);
  const spaces = $derived(chat.rooms.filter((r) => r.isSpace && r.membership === "join"));

  async function create(e: Event) {
    e.preventDefault();
    busy = true;
    try {
      const id =
        kind === "folder"
          ? await chat.createSpace(name.trim(), isPublic)
          : await chat.createRoom({ name: name.trim(), topic, isPublic, encrypted: encrypted && !isPublic, history, parent });
      oncreated(id);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      busy = false;
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
  <form class="dialog" onsubmit={create} onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Create {kind}">
    <h3>{kind === "folder" ? "New folder" : "New room"}</h3>
    <label>Name <input bind:value={name} required maxlength="80" autofocus /></label>
    {#if kind === "room"}
      <label>Topic <input bind:value={topic} maxlength="200" placeholder="Optional" /></label>
    {/if}
    <fieldset>
      <legend>Visibility</legend>
      <label class="radio"><input type="radio" bind:group={isPublic} value={false} /> Private — invite only</label>
      <label class="radio"><input type="radio" bind:group={isPublic} value={true} /> Public — anyone on this server can find and join</label>
    </fieldset>
    {#if kind === "room"}
      {#if !isPublic}
        <label class="radio">
          <input type="checkbox" bind:checked={encrypted} /> End-to-end encryption
        </label>
        {#if encrypted}<p class="hint">Once enabled, encryption can't be turned off for this room.</p>{/if}
      {/if}
      <label>Who can read the history?
        <select bind:value={history}>
          <option value="shared">Members, including messages from before they joined</option>
          <option value="joined">Members, only since they joined</option>
          <option value="invited">Members, only since they were invited</option>
        </select>
      </label>
      {#if spaces.length}
        <label>Folder
          <select bind:value={parent}>
            <option value={null}>None</option>
            {#each spaces as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
        </label>
      {/if}
    {/if}
    <div class="actions">
      <button type="button" onclick={onclose}>Cancel</button>
      <button class="primary" disabled={busy || !name.trim()}>Create</button>
    </div>
  </form>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; display: grid; place-items: center; z-index: 80; padding: 16px; }
  .dialog { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px; width: min(420px, 100%);
    display: flex; flex-direction: column; gap: 10px; }
  h3 { margin: 0; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
  label.radio { flex-direction: row; align-items: center; gap: 8px; color: var(--text); }
  fieldset { border: 1px solid var(--line); border-radius: 8px; display: flex; flex-direction: column; gap: 6px; }
  legend { font-size: 12px; color: var(--muted); }
  .hint { margin: -4px 0 0; font-size: 12px; color: #f5a524; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
