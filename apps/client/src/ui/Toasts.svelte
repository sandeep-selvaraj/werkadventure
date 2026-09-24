<script lang="ts">
  import { app } from "../state.svelte";
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <div class="toast" class:error={t.kind === "error"}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts { position: fixed; left: 12px; bottom: 76px; display: flex; flex-direction: column; gap: 6px; z-index: 50; max-width: min(360px, calc(100vw - 24px)); }
  .toast { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent); padding: 8px 12px; border-radius: 8px; }
  .toast.error { border-left-color: var(--danger); }
</style>
