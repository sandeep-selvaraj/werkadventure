<script lang="ts">
  import { gameScene } from "../game/game";
  import { app, type Invite } from "../state.svelte";

  function reply(inv: Invite, accept: boolean) {
    app.conn?.send({ t: "inviteReply", from: inv.from, accept });
    app.invites = app.invites.filter((i) => i !== inv);
    if (accept) gameScene()?.goTo({ map: inv.map, entry: null, at: { x: inv.x, y: inv.y + 24 } });
  }
</script>

<div class="invites">
  {#each app.invites as inv (inv.from)}
    <div class="invite" role="alertdialog" aria-label="Meeting invitation">
      <strong>{inv.name}</strong> invites you to join them.
      <div class="actions">
        <button onclick={() => reply(inv, false)}>Decline</button>
        <button class="primary" onclick={() => reply(inv, true)}>Accept</button>
      </div>
    </div>
  {/each}
</div>

<style>
  .invites { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 60; width: min(380px, calc(100vw - 32px)); }
  .invite { background: var(--panel); border: 1px solid var(--accent); border-radius: var(--radius); padding: 12px 14px; box-shadow: 0 8px 30px #0008; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
</style>
