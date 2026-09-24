<script lang="ts">
  import { chat } from "../../chat/matrix.svelte";
  import { toast } from "../../state.svelte";

  let shownKey = $state<string | null>(null);
  let entering = $state(false);
  let keyInput = $state("");
  let busy = $state(false);
  let dismissed = $state(false);

  async function setup() {
    busy = true;
    try {
      shownKey = await chat.setupBackup();
    } catch (e) {
      toast(`Backup setup failed: ${(e as Error).message}`, "error");
    } finally {
      busy = false;
    }
  }

  async function unlock(e: Event) {
    e.preventDefault();
    busy = true;
    try {
      await chat.unlockBackup(keyInput);
      entering = false;
      toast("Encrypted history unlocked");
    } catch (err) {
      toast(`Wrong recovery key? ${(err as Error).message}`, "error");
    } finally {
      busy = false;
    }
  }
</script>

{#if shownKey}
  <div class="banner ok">
    <strong>Save your recovery key</strong>
    <p>It is stored in this browser. Keep a copy somewhere safe — you need it to read encrypted messages on another device.</p>
    <code>{shownKey}</code>
    <div class="row">
      <button onclick={() => navigator.clipboard.writeText(shownKey!).then(() => toast("Copied"))}>Copy</button>
      <button class="primary" onclick={() => (shownKey = null)}>I saved it</button>
    </div>
  </div>
{:else if chat.backup === "none" && !dismissed}
  <div class="banner">
    <span>🔐 Secure your encrypted messages with a recovery key.</span>
    <div class="row">
      <button onclick={() => (dismissed = true)}>Later</button>
      <button class="primary" disabled={busy} onclick={setup}>Set up</button>
    </div>
  </div>
{:else if chat.backup === "locked" && !dismissed}
  <div class="banner">
    {#if entering}
      <form onsubmit={unlock}>
        <input bind:value={keyInput} placeholder="Recovery key (EsT… )" autofocus />
        <div class="row">
          <button type="button" onclick={() => (entering = false)}>Cancel</button>
          <button class="primary" disabled={busy || !keyInput.trim()}>Unlock</button>
        </div>
      </form>
    {:else}
      <span>🔒 Enter your recovery key to read older encrypted messages on this device.</span>
      <div class="row">
        <button onclick={() => (dismissed = true)}>Later</button>
        <button class="primary" onclick={() => (entering = true)}>Enter key</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .banner { margin: 8px; padding: 10px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line); font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
  .banner.ok { border-color: var(--ok); }
  p { margin: 0; color: var(--muted); }
  code { background: #15141d; padding: 6px; border-radius: 6px; word-break: break-all; user-select: all; }
  .row { display: flex; justify-content: flex-end; gap: 6px; }
  form { display: flex; flex-direction: column; gap: 6px; }
</style>
