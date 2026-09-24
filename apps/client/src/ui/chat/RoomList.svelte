<script lang="ts">
  import { chat, type RoomSummary } from "../../chat/matrix.svelte";
  import { app, toast } from "../../state.svelte";
  import BackupBanner from "./BackupBanner.svelte";

  let { onopen, oncreate, onbrowse }: { onopen: (id: string) => void; oncreate: (k: "room" | "folder") => void; onbrowse: () => void } = $props();

  let filter = $state("");
  let menu = $state(false);
  let collapsed = $state<Record<string, boolean>>({});

  const match = (r: RoomSummary) => r.name.toLowerCase().includes(filter.toLowerCase());
  const invites = $derived(chat.rooms.filter((r) => r.membership === "invite" && match(r)));
  const joined = $derived(chat.rooms.filter((r) => r.membership === "join"));
  const spaces = $derived(joined.filter((r) => r.isSpace));
  const spaceIds = $derived(new Set(spaces.map((s) => s.id)));
  const loose = $derived(joined.filter((r) => !r.isSpace && !r.isDm && !r.parents.some((p) => spaceIds.has(p)) && match(r)));
  const dms = $derived(joined.filter((r) => r.isDm && match(r)));
  const children = (spaceId: string) => joined.filter((r) => !r.isSpace && r.parents.includes(spaceId) && match(r));
  const online = (r: RoomSummary) => !!r.dmUserId && app.online.some((u) => u.matrixId === r.dmUserId);

  async function accept(r: RoomSummary) {
    try {
      await chat.acceptInvite(r.id);
      onopen(r.id);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
</script>

<BackupBanner />
<div class="toolbar">
  <input bind:value={filter} placeholder="Search rooms" aria-label="Search rooms" />
  <div class="menu-wrap">
    <button class="primary" aria-label="New" onclick={() => (menu = !menu)}>＋</button>
    {#if menu}
      <div class="menu" role="menu">
        <button role="menuitem" onclick={() => { menu = false; oncreate("room"); }}>New room</button>
        <button role="menuitem" onclick={() => { menu = false; oncreate("folder"); }}>New folder</button>
        <button role="menuitem" onclick={() => { menu = false; onbrowse(); }}>Browse public rooms</button>
      </div>
    {/if}
  </div>
</div>

<div class="list">
  {#if chat.status === "connecting"}<p class="muted center">Connecting to chat…</p>{/if}
  {#if chat.status === "error"}<p class="muted center">Chat is unavailable right now.</p>{/if}

  {#if invites.length}
    <h4>Invitations</h4>
    {#each invites as r (r.id)}
      <div class="invite">
        <div><strong>{r.name}</strong><div class="muted">{r.isDm ? "wants to chat with you" : `invited by ${r.inviter ?? "someone"}`}</div></div>
        <div class="btns">
          <button onclick={() => chat.leave(r.id)}>Decline</button>
          <button class="primary" onclick={() => accept(r)}>Join</button>
        </div>
      </div>
    {/each}
  {/if}

  {#each spaces as s (s.id)}
    <button class="section" onclick={() => (collapsed[s.id] = !collapsed[s.id])}>
      {collapsed[s.id] ? "▸" : "▾"} 📁 {s.name}
      <span class="add" role="button" tabindex="0" title="Add room here" onclick={(e) => { e.stopPropagation(); oncreate("room"); }} onkeydown={() => {}}>＋</span>
    </button>
    {#if !collapsed[s.id]}
      {#each children(s.id) as r (r.id)}{@render row(r, true)}{/each}
    {/if}
  {/each}

  <h4>Rooms</h4>
  {#each loose as r (r.id)}{@render row(r, false)}{:else}<p class="muted small">No rooms yet — create one with ＋</p>{/each}

  <h4>Direct messages</h4>
  {#each dms as r (r.id)}{@render row(r, false)}{:else}<p class="muted small">Click someone in the Users tab to message them</p>{/each}
</div>

{#snippet row(r: RoomSummary, nested: boolean)}
  <button class="room" class:nested onclick={() => onopen(r.id)}>
    {#if r.isDm}<span class="dot" class:on={online(r)}></span>{:else}<span class="hash">{r.encrypted ? "🔒" : "#"}</span>{/if}
    <span class="info">
      <span class="name" class:bold={r.unread > 0}>{r.name}</span>
      {#if r.lastText}<span class="last">{r.lastText}</span>{/if}
    </span>
    {#if r.unread}<span class="badge" class:hl={r.highlight > 0}>{r.unread}</span>{/if}
  </button>
{/snippet}

<style>
  .toolbar { display: flex; gap: 6px; padding: 8px; }
  .toolbar input { flex: 1; min-width: 0; }
  .menu-wrap { position: relative; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; z-index: 5; display: flex; flex-direction: column; min-width: 180px; overflow: hidden; }
  .menu button { border: none; border-radius: 0; text-align: left; background: transparent; }
  .menu button:hover { background: var(--line); }
  .list { flex: 1; overflow-y: auto; padding: 0 8px 8px; }
  h4 { margin: 12px 4px 4px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .section { display: flex; width: 100%; border: none; background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; margin-top: 8px; padding: 4px; text-align: left; }
  .section .add { margin-left: auto; padding: 0 6px; }
  .room { display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; text-align: left; padding: 6px; border-radius: 8px; }
  .room:hover { background: var(--panel-2); }
  .room.nested { padding-left: 20px; }
  .hash { width: 16px; text-align: center; color: var(--muted); font-size: 12px; }
  .dot { width: 8px; height: 8px; margin: 0 4px; border-radius: 50%; background: var(--line); flex: none; }
  .dot.on { background: var(--ok); }
  .info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .name, .last { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name.bold { font-weight: 700; }
  .last { font-size: 12px; color: var(--muted); }
  .badge { background: var(--accent); color: #fff; font-size: 11px; border-radius: 999px; padding: 0 6px; }
  .badge.hl { background: var(--danger); }
  .invite { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 6px; background: var(--panel-2); border-radius: 8px; margin-bottom: 4px; }
  .btns { display: flex; gap: 4px; }
  .muted { color: var(--muted); font-size: 12px; }
  .small { margin: 2px 6px; }
  .center { text-align: center; }
</style>
