import {
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";
import type { Avatar } from "@werk/shared";
import { app, toast } from "../state.svelte";
import { media } from "./media.svelte";

export interface MeetingPeer {
  id: string;
  name: string;
  avatar?: Avatar;
  stream: MediaStream;
  screen: MediaStream | null;
  cam: boolean;
  mic: boolean;
  speaking: boolean;
}

/** LiveKit SFU session for meeting zones (areas with a `livekitRoom` property). */
class Meeting {
  room = $state<string | null>(null);
  peers = $state.raw<MeetingPeer[]>([]);
  connecting = $state(false);
  private lk: Room | null = null;
  private published: { audio?: LocalTrack; video?: LocalTrack; screen?: LocalTrack } = {};
  private unsubMedia: (() => void) | null = null;
  private target: string | null = null;

  /** Called whenever the player's meeting zone changes. */
  async setRoom(room: string | null) {
    if (room === this.target) return;
    this.target = room;
    await this.leave();
    if (room) await this.join(room);
  }

  private async join(roomName: string) {
    this.connecting = true;
    try {
      const res = await fetch("/api/livekit", {
        method: "POST",
        headers: { authorization: `Bearer ${app.token}`, "content-type": "application/json" },
        body: JSON.stringify({ room: roomName, participant: app.me?.id ?? crypto.randomUUID() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "meeting unavailable");
      const { url, token } = (await res.json()) as { url: string; token: string };
      if (this.target !== roomName) return;
      const lk = new Room({ adaptiveStream: true, dynacast: true });
      this.lk = lk;
      const update = () => this.refresh();
      lk.on(RoomEvent.ParticipantConnected, update)
        .on(RoomEvent.ParticipantDisconnected, update)
        .on(RoomEvent.TrackSubscribed, update)
        .on(RoomEvent.TrackUnsubscribed, update)
        .on(RoomEvent.TrackMuted, update)
        .on(RoomEvent.TrackUnmuted, update)
        .on(RoomEvent.ActiveSpeakersChanged, update)
        .on(RoomEvent.Disconnected, () => {
          if (this.lk === lk) {
            this.lk = null;
            this.room = null;
            this.peers = [];
          }
        });
      await lk.connect(absolute(url), token);
      if (this.target !== roomName) {
        await lk.disconnect();
        return;
      }
      this.room = roomName;
      this.unsubMedia = media.onChange(() => this.publish());
      await this.publish();
      this.refresh();
    } catch (e) {
      toast(`Could not join the meeting: ${(e as Error).message}`, "error");
    } finally {
      this.connecting = false;
    }
  }

  private async leave() {
    this.unsubMedia?.();
    this.unsubMedia = null;
    const lk = this.lk;
    this.lk = null;
    this.published = {};
    this.room = null;
    this.peers = [];
    if (lk) await lk.disconnect();
  }

  /** Keep published tracks in sync with local camera / mic / screen. */
  private async publish() {
    const lk = this.lk;
    if (!lk) return;
    const t = media.tracks;
    const want = { audio: t.audio, video: t.video, screen: t.screen };
    for (const kind of ["audio", "video", "screen"] as const) {
      const cur = this.published[kind];
      const next = want[kind];
      if (cur?.mediaStreamTrack === next) continue;
      if (cur) {
        await lk.localParticipant.unpublishTrack(cur, false);
        delete this.published[kind];
      }
      if (!next) continue;
      const track = kind === "audio" ? new LocalAudioTrack(next, undefined, true) : new LocalVideoTrack(next, undefined, true);
      await lk.localParticipant.publishTrack(track, {
        source: kind === "audio" ? Track.Source.Microphone : kind === "video" ? Track.Source.Camera : Track.Source.ScreenShare,
      });
      this.published[kind] = track;
    }
  }

  private refresh() {
    const lk = this.lk;
    if (!lk) return;
    const speaking = new Set(lk.activeSpeakers.map((p) => p.identity));
    this.peers = [...lk.remoteParticipants.values()].map((p) => toPeer(p, speaking.has(p.identity)));
  }
}

function toPeer(p: RemoteParticipant | Participant, speaking: boolean): MeetingPeer {
  const tracks = (src: Track.Source) => p.getTrackPublication(src)?.track?.mediaStreamTrack;
  const cam = p.getTrackPublication(Track.Source.Camera);
  const mic = p.getTrackPublication(Track.Source.Microphone);
  const main = [tracks(Track.Source.Camera), tracks(Track.Source.Microphone)].filter((t): t is MediaStreamTrack => !!t);
  const screen = tracks(Track.Source.ScreenShare);
  let avatar: Avatar | undefined;
  try {
    avatar = JSON.parse(p.metadata ?? "{}").avatar;
  } catch {}
  return {
    id: p.identity,
    name: p.name || p.identity,
    avatar,
    stream: new MediaStream(main),
    screen: screen ? new MediaStream([screen]) : null,
    cam: !!cam?.track && !cam.isMuted,
    mic: !!mic?.track && !mic.isMuted,
    speaking,
  };
}

function absolute(url: string): string {
  if (!url.startsWith("/")) return url;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${url}`;
}

export const meeting = new Meeting();
