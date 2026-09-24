<script lang="ts">
  import { onMount } from "svelte";
  import { media } from "../av/media.svelte";
  import { meeting } from "../av/meeting.svelte";
  import { p2p } from "../av/p2p.svelte";
  import { chat } from "../chat/matrix.svelte";
  import { startGame, stopGame } from "../game/game";
  import { startSession } from "../net/session";
  import { app } from "../state.svelte";
  import ActionBar from "./ActionBar.svelte";
  import ChatPanel from "./ChatPanel.svelte";
  import Invites from "./Invites.svelte";
  import Toasts from "./Toasts.svelte";
  import UserCard from "./UserCard.svelte";
  import MeetingGrid from "./MeetingGrid.svelte";
  import VideoStrip from "./VideoStrip.svelte";

  let { startMap, onlogout }: { startMap: string; onlogout: () => void } = $props();
  let host: HTMLDivElement;
  let cardUser = $state<string | null>(null);

  onMount(() => {
    const conn = startSession(app.token!);
    media.start();
    p2p.start(conn, app.token!);
    if (app.features.matrix) chat.start(app.token!, app.identity!.sub);
    const onOpenRoom = (e: Event) => {
      app.chatOpen = true;
      app.chatTab = "chat";
      chat.open((e as CustomEvent<string>).detail);
    };
    window.addEventListener("werk:open-room", onOpenRoom);
    // deep link: /#/maps/office/floor-1.tmj#entry
    const hash = location.hash.slice(1);
    const [map, entry] = hash.startsWith("/") ? [hash.split("#")[0], hash.split("#")[1] ?? null] : [startMap, null];
    startGame(host, { map, entry });
    const onCard = (e: Event) => (cardUser = (e as CustomEvent<string>).detail);
    window.addEventListener("werk:user-card", onCard);
    return () => {
      window.removeEventListener("werk:user-card", onCard);
      window.removeEventListener("werk:open-room", onOpenRoom);
      chat.stop();
      p2p.stop();
      meeting.setRoom(null);
      stopGame();
      conn.close();
      app.conn = null;
    };
  });

  $effect(() => {
    if (app.features.livekit) meeting.setRoom(app.area.meeting);
  });

  // an area with a `matrixRoom` property opens its chat room when you walk in
  $effect(() => {
    const alias = app.area.matrixRoom;
    if (!alias || chat.status !== "ready") return;
    chat
      .joinAreaRoom(alias, app.area.name ?? alias)
      .then((id) => window.dispatchEvent(new CustomEvent("werk:open-room", { detail: id })))
      .catch(() => {});
  });

  $effect(() => {
    if (app.map) history.replaceState(null, "", `#${app.map}`);
  });

  function leave() {
    onlogout();
  }
</script>

<div class="game" bind:this={host}></div>

{#if app.area.name}
  <div class="area-chip">{app.area.name}{app.area.silent ? " · silent" : ""}</div>
{/if}

<VideoStrip />
<MeetingGrid />
<ChatPanel onusercard={(id) => (cardUser = id)} />
<ActionBar onleave={leave} />
<Invites />
<Toasts />
{#if cardUser}
  <UserCard id={cardUser} onclose={() => (cardUser = null)} />
{/if}

<style>
  .game { position: fixed; inset: 0; }
  .area-chip { position: fixed; top: 12px; left: 12px; background: var(--panel); border: 1px solid var(--line);
    padding: 6px 12px; border-radius: 999px; font-weight: 600; pointer-events: none; }
</style>
