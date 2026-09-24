<script lang="ts">
  import type { Avatar } from "@werk/shared";
  import { PALETTE, randomAvatar } from "../game/avatar";
  import { app, saveToken } from "../state.svelte";
  import AvatarPreview from "./AvatarPreview.svelte";

  let { onready }: { onready: () => void } = $props();

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem("werk.profile") ?? "null") as { name: string; avatar: Avatar } | null;
    } catch {
      return null;
    }
  })();

  let name = $state(saved?.name ?? "");
  let avatar = $state<Avatar>(saved?.avatar ?? randomAvatar());
  let error = $state("");
  let busy = $state(false);
  let dir = $state(0);

  const parts = [
    ["skin", "Skin"],
    ["hair", "Hair"],
    ["shirt", "Shirt"],
    ["pants", "Pants"],
  ] as const;

  // account sign-in: first credentials, then the same name/avatar step (saved to the account)
  let mode = $state<"guest" | "signin" | "signup">(app.identity?.registered ? "signin" : app.features.allowGuests ? "guest" : "signin");
  let accountToken = $state<string | null>(app.identity?.registered ? app.token : null);
  let username = $state("");
  let password = $state("");

  async function signIn(e: Event) {
    e.preventDefault();
    busy = true;
    error = "";
    try {
      const res = await fetch(mode === "signup" ? "/api/signup" : "/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sign-in failed");
      accountToken = body.token;
      name = body.identity.name;
      if (!body.needsProfile) avatar = body.identity.avatar;
      password = "";
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function enter(e: Event) {
    e.preventDefault();
    busy = true;
    error = "";
    try {
      const res = accountToken
        ? await fetch("/api/profile", {
            method: "PUT",
            headers: { "content-type": "application/json", authorization: `Bearer ${accountToken}` },
            body: JSON.stringify({ name, avatar }),
          })
        : await fetch("/api/guest", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, avatar, token: app.token && !app.identity?.registered ? app.token : undefined }),
          });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Login failed");
      try {
        localStorage.setItem("werk.profile", JSON.stringify({ name, avatar }));
      } catch {}
      saveToken(body.token);
      app.identity = body.identity;
      onready();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  {#if mode !== "guest" && !accountToken}
  <form class="card" onsubmit={signIn}>
    <h1>WerkAdventure</h1>
    <p class="muted">{mode === "signup" ? "Create an account" : "Sign in to your account"}</p>
    <input placeholder="Username" bind:value={username} autocomplete="username" required />
    <input placeholder="Password" type="password" bind:value={password} autocomplete={mode === "signup" ? "new-password" : "current-password"} required minlength={mode === "signup" ? 8 : undefined} />
    {#if error}<p class="error">{error}</p>{/if}
    <button class="primary" disabled={busy}>{mode === "signup" ? "Create account" : "Sign in"}</button>
    <div class="links">
      {#if app.features.allowGuests}<button type="button" class="link" onclick={() => { mode = "guest"; error = ""; }}>Continue as guest</button>{/if}
      {#if app.features.allowSignup}<button type="button" class="link" onclick={() => { mode = mode === "signup" ? "signin" : "signup"; error = ""; }}>{mode === "signup" ? "I have an account" : "Create an account"}</button>{/if}
    </div>
  </form>
  {:else}
  <form class="card" onsubmit={enter}>
    <h1>WerkAdventure</h1>
    <p class="muted">{accountToken ? `Signed in as ${username || name}. ` : ""}Pick a name and a look, then walk in.</p>

    <div class="row">
      <button type="button" class="preview" title="Turn around" onclick={() => (dir = (dir + 1) % 4)}>
        <AvatarPreview {avatar} size={112} {dir} />
      </button>
      <div class="parts">
        {#each parts as [key, label]}
          <div class="part">
            <span>{label}</span>
            <div class="swatches">
              {#each PALETTE[key] as c}
                <button
                  type="button"
                  class="swatch"
                  class:selected={avatar[key] === c}
                  style="background:{c}"
                  aria-label="{label} {c}"
                  onclick={() => (avatar[key] = c)}
                ></button>
              {/each}
            </div>
          </div>
        {/each}
        <div class="part">
          <span>Style</span>
          <div class="swatches">
            {#each [0, 1, 2, 3] as s}
              <button type="button" class="style" class:selected={avatar.hairStyle === s} onclick={() => (avatar.hairStyle = s)}>{s + 1}</button>
            {/each}
            <button type="button" class="style" onclick={() => (avatar = randomAvatar())} title="Random">🎲</button>
          </div>
        </div>
      </div>
    </div>

    <input placeholder="Your name" bind:value={name} maxlength="24" required />
    {#if error}<p class="error">{error}</p>{/if}
    <button class="primary" disabled={busy || !name.trim()}>Enter</button>
    <div class="links">
      {#if accountToken}
        <button type="button" class="link" onclick={() => { accountToken = null; saveToken(null); app.identity = null; mode = "signin"; }}>Sign out</button>
      {:else}
        <button type="button" class="link" onclick={() => { mode = "signin"; error = ""; }}>Sign in with an account</button>
      {/if}
    </div>
  </form>
  {/if}
</div>

<style>
  .wrap { height: 100%; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(circle at 30% 20%, #2d2a4a, var(--bg) 60%); }
  .card { width: min(480px, 100%); background: var(--panel); border: 1px solid var(--line);
    border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 14px; }
  h1 { margin: 0; font-size: 26px; }
  .muted { margin: 0; color: var(--muted); }
  .row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .preview { background: #1a1825; border-radius: 12px; padding: 8px; line-height: 0; }
  .parts { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 220px; }
  .part { display: flex; align-items: center; gap: 8px; }
  .part > span { width: 44px; color: var(--muted); font-size: 12px; }
  .swatches { display: flex; flex-wrap: wrap; gap: 4px; }
  .swatch { width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
  .swatch.selected, .style.selected { border-color: #fff; }
  .style { padding: 0 8px; height: 24px; font-size: 12px; }
  .error { color: var(--danger); margin: 0; }
  .links { display: flex; justify-content: space-between; gap: 8px; }
  .link { border: none; background: none; color: var(--accent-2); padding: 0; font-size: 13px; }
</style>
