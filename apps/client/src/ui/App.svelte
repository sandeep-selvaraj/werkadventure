<script lang="ts">
  import { onMount } from "svelte";
  import { app, saveToken } from "../state.svelte";
  import Login from "./Login.svelte";
  import GameView from "./GameView.svelte";

  let config = $state<{ startMap: string; matrix: boolean; livekit: boolean; allowGuests: boolean; allowSignup: boolean } | null>(null);
  let ready = $state(false);

  onMount(async () => {
    config = await (await fetch("/api/config")).json();
    app.features = { matrix: !!config!.matrix, livekit: !!config!.livekit, allowGuests: config!.allowGuests, allowSignup: config!.allowSignup };
    // resume a saved session without showing the login form
    if (app.token) {
      try {
        const [, payload] = app.token.split(".");
        const p = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        if (p.exp * 1000 > Date.now() && p.name && p.avatar) {
          app.identity = { sub: p.sub, name: p.name, avatar: p.avatar, registered: !!p.registered };
          ready = !new URLSearchParams(location.search).has("login");
        } else saveToken(null);
      } catch {
        saveToken(null);
      }
    }
  });
</script>

{#if config}
  {#if ready && app.identity}
    <GameView startMap={config.startMap} onlogout={() => { ready = false; }} />
  {:else}
    <Login onready={() => (ready = true)} />
  {/if}
{/if}
