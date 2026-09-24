import type { Connection } from "../net/connection";
import { app } from "../state.svelte";
import { media } from "./media.svelte";

export interface RemotePeer {
  id: string;
  stream: MediaStream;
  screen: MediaStream | null;
  cam: boolean;
  mic: boolean;
}

type Signal =
  | { kind: "sdp"; description: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "state"; cam: boolean; mic: boolean; screenId: string | null };

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  senders: { audio?: RTCRtpSender; video?: RTCRtpSender; screen?: RTCRtpSender };
  screenStreamId: string | null;
}

/**
 * Full-mesh WebRTC between members of the current bubble (max 4, like WorkAdventure).
 * Uses the "perfect negotiation" pattern; signaling goes through the werk server.
 */
class P2P {
  peers = $state.raw<RemotePeer[]>([]);
  private conns = new Map<string, Peer>();
  private ice: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  private conn: Connection | null = null;

  async start(conn: Connection, token: string) {
    this.conn = conn;
    conn.on("bubble", (m) => this.sync(m.members.filter((id) => id !== app.me?.id)));
    conn.on("signal", (m) => this.onSignal(m.from, m.data as Signal));
    media.onChange(() => this.updateTracks());
    try {
      const r = await fetch("/api/ice", { headers: { authorization: `Bearer ${token}` } });
      if (r.ok) this.ice = (await r.json()).iceServers;
    } catch {}
  }

  stop() {
    for (const id of [...this.conns.keys()]) this.close(id);
  }

  private sync(members: string[]) {
    for (const id of [...this.conns.keys()]) if (!members.includes(id)) this.close(id);
    for (const id of members) if (!this.conns.has(id)) this.open(id);
  }

  private open(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer: Peer = { pc, polite: (app.me?.id ?? "") > id, makingOffer: false, ignoreOffer: false, senders: {}, screenStreamId: null };
    this.conns.set(id, peer);
    const remote: RemotePeer = { id, stream: new MediaStream(), screen: null, cam: true, mic: true };
    this.peers = [...this.peers, remote];

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.send(id, { kind: "sdp", description: pc.localDescription!.toJSON() });
      } catch (e) {
        console.warn("negotiation failed", e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.send(id, { kind: "ice", candidate: candidate.toJSON() });
    pc.ontrack = ({ track, streams }) => {
      const isScreen = streams[0] && streams[0].id === peer.screenStreamId;
      this.updateRemote(id, (r) => {
        if (isScreen) return { ...r, screen: streams[0] };
        const s = new MediaStream([...r.stream.getTracks().filter((t) => t.kind !== track.kind), track]);
        return { ...r, stream: s };
      });
      track.onunmute = () => this.updateRemote(id, (r) => ({ ...r }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") pc.restartIce();
    };
    this.attachTracks(peer);
    this.sendState(id, peer);
    return peer;
  }

  private attachTracks(peer: Peer) {
    const t = media.tracks;
    const local = media.stream ?? new MediaStream();
    for (const kind of ["audio", "video"] as const) {
      const track = t[kind];
      const sender = peer.senders[kind];
      if (sender) sender.replaceTrack(track);
      else if (track) peer.senders[kind] = peer.pc.addTrack(track, local);
    }
    if (t.screen && !peer.senders.screen) {
      peer.senders.screen = peer.pc.addTrack(t.screen, media.screen!);
    } else if (!t.screen && peer.senders.screen) {
      peer.pc.removeTrack(peer.senders.screen);
      delete peer.senders.screen;
    }
  }

  private updateTracks() {
    for (const [id, peer] of this.conns) {
      this.attachTracks(peer);
      this.sendState(id, peer);
    }
  }

  private sendState(id: string, _peer: Peer) {
    this.send(id, { kind: "state", cam: media.cam, mic: media.mic, screenId: media.screen?.id ?? null });
  }

  private async onSignal(from: string, s: Signal) {
    const peer = this.conns.get(from) ?? (app.bubble.members.includes(from) ? this.open(from) : null);
    if (!peer) return;
    const pc = peer.pc;
    try {
      if (s.kind === "state") {
        peer.screenStreamId = s.screenId;
        this.updateRemote(from, (r) => ({ ...r, cam: s.cam, mic: s.mic, screen: s.screenId ? r.screen : null }));
      } else if (s.kind === "sdp") {
        const offerCollision = s.description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(s.description);
        if (s.description.type === "offer") {
          await pc.setLocalDescription();
          this.send(from, { kind: "sdp", description: pc.localDescription!.toJSON() });
        }
      } else if (s.kind === "ice") {
        try {
          await pc.addIceCandidate(s.candidate);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn("signal error", e);
    }
  }

  private close(id: string) {
    this.conns.get(id)?.pc.close();
    this.conns.delete(id);
    this.peers = this.peers.filter((p) => p.id !== id);
  }

  private updateRemote(id: string, f: (r: RemotePeer) => RemotePeer) {
    this.peers = this.peers.map((p) => (p.id === id ? f(p) : p));
  }

  private send(to: string, data: Signal) {
    this.conn?.send({ t: "signal", to, data });
  }
}

export const p2p = new P2P();
