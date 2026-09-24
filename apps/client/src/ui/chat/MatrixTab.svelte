<script lang="ts">
  import { chat } from "../../chat/matrix.svelte";
  import CreateRoom from "./CreateRoom.svelte";
  import PublicRooms from "./PublicRooms.svelte";
  import RoomList from "./RoomList.svelte";
  import RoomView from "./RoomView.svelte";

  let creating = $state<"room" | "folder" | null>(null);
  let browsing = $state(false);

  function open(id: string | null) {
    creating = null;
    browsing = false;
    chat.open(id);
    if (id && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }
</script>

{#if chat.activeRoomId}
  {#key chat.activeRoomId}
    <RoomView roomId={chat.activeRoomId} onback={() => open(null)} />
  {/key}
{:else}
  <RoomList onopen={open} oncreate={(k) => (creating = k)} onbrowse={() => (browsing = true)} />
{/if}

{#if creating}<CreateRoom kind={creating} onclose={() => (creating = null)} oncreated={(id) => open(creating === "folder" ? null : id)} />{/if}
{#if browsing}<PublicRooms onclose={() => (browsing = false)} onjoined={open} />{/if}
