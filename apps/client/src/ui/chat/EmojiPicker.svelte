<script lang="ts">
  let { onpick, onclose }: { onpick: (e: string) => void; onclose: () => void } = $props();
  const groups: [string, string][] = [
    ["Smileys", "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 🤓 😎 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 😱 😨 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😴 🤤 🤒 🤕 🤧 🥵 🥶 😵 🤠 🤡 👻 💀 🤖"],
    ["Gestures", "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🙏 💪 🫡 🫶"],
    ["Hearts", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝"],
    ["Things", "🎉 🎊 🎈 🎁 🏆 🥇 ⭐ 🌟 ✨ 🔥 💯 ✅ ❌ ⚠️ ❓ ❗ 💡 📌 📎 📝 📅 ⏰ ☕ 🍕 🍔 🍺 🍷 🚀 💻 🖥️ 📱 🎮 🎵 🌈 ☀️ 🌧️ ❄️ 🐶 🐱 🦄 🐛"],
  ];
</script>

<div class="picker" role="dialog" aria-label="Emoji picker">
  <button class="close" onclick={onclose} aria-label="Close">✕</button>
  {#each groups as [name, list]}
    <div class="group">{name}</div>
    <div class="grid">
      {#each list.split(" ") as e}
        <button onclick={() => onpick(e)}>{e}</button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .picker { position: absolute; bottom: calc(100% + 6px); right: 0; width: 290px; max-height: 280px; overflow-y: auto; z-index: 5;
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 8px; box-shadow: 0 8px 30px #0008; }
  .close { position: sticky; top: 0; float: right; padding: 0 6px; border: none; background: var(--panel-2); }
  .group { font-size: 11px; color: var(--muted); margin: 6px 0 2px; }
  .grid { display: grid; grid-template-columns: repeat(8, 1fr); }
  .grid button { border: none; background: transparent; padding: 3px; font-size: 18px; }
  .grid button:hover { background: var(--line); }
</style>
