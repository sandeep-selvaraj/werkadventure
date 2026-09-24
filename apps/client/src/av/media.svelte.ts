import { toast } from "../state.svelte";

const PREFS_KEY = "werk.media";

function loadPrefs(): { cam: boolean; mic: boolean } {
  try {
    return { cam: true, mic: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { cam: true, mic: true };
  }
}

type Listener = () => void;

/** Local camera / microphone / screen, shared by P2P bubbles and LiveKit meetings. */
class LocalMedia {
  cam = $state(loadPrefs().cam);
  mic = $state(loadPrefs().mic);
  screenOn = $state(false);
  /** reactive handle for <video> elements; replaced whenever tracks change */
  stream = $state.raw<MediaStream | null>(null);
  screen = $state.raw<MediaStream | null>(null);
  speaking = $state(false);
  private listeners = new Set<Listener>();
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;

  get tracks(): { audio: MediaStreamTrack | null; video: MediaStreamTrack | null; screen: MediaStreamTrack | null } {
    return { audio: this.mic ? this.audioTrack : null, video: this.cam ? this.videoTrack : null, screen: this.screen?.getVideoTracks()[0] ?? null };
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  async start(): Promise<void> {
    await this.apply();
  }

  async setCam(on: boolean) {
    this.cam = on;
    await this.apply();
  }

  async setMic(on: boolean) {
    this.mic = on;
    await this.apply();
  }

  async toggleScreen() {
    if (this.screen) {
      this.screen.getTracks().forEach((t) => t.stop());
      this.screen = null;
      this.screenOn = false;
      this.emit();
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      s.getVideoTracks()[0].addEventListener("ended", () => {
        if (this.screen === s) {
          this.screen = null;
          this.screenOn = false;
          this.emit();
        }
      });
      this.screen = s;
      this.screenOn = true;
      this.emit();
    } catch {
      /* user cancelled */
    }
  }

  private async apply() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ cam: this.cam, mic: this.mic }));
    } catch {}
    try {
      if (this.cam && !this.videoTrack) {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 20 } });
        this.videoTrack = s.getVideoTracks()[0];
      } else if (!this.cam && this.videoTrack) {
        // release the camera so its light turns off
        this.videoTrack.stop();
        this.videoTrack = null;
      }
      if (this.mic && !this.audioTrack) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        this.audioTrack = s.getAudioTracks()[0];
        this.watchLevel(this.audioTrack);
      }
      if (this.audioTrack) this.audioTrack.enabled = this.mic;
    } catch (e) {
      toast(`Camera/microphone unavailable: ${(e as Error).message}`, "error");
      if (this.cam && !this.videoTrack) this.cam = false;
      if (this.mic && !this.audioTrack) this.mic = false;
    }
    const tracks = [this.videoTrack, this.audioTrack].filter((t): t is MediaStreamTrack => !!t);
    this.stream = tracks.length ? new MediaStream(tracks) : null;
    this.emit();
  }

  private watchLevel(track: MediaStreamTrack) {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      setInterval(() => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) ** 2;
        this.speaking = this.mic && Math.sqrt(sum / buf.length) > 6;
      }, 150);
    } catch {}
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const media = new LocalMedia();
