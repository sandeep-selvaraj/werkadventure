import Phaser from "phaser";
import { MapProp, resolveExit, type Avatar, type Direction, type PlayerState } from "@werk/shared";
import { app } from "../state.svelte";
import { DIRS, FRAME, FRAMES_PER_DIR, drawAvatarSheet } from "./avatar";
import { extractAreas, findSpawn, props, type MapArea, type TiledMap } from "./mapAreas";
import { findPath } from "./pathfinding";

const SPEED = 150;
const SEND_EVERY_MS = 100;

export interface SceneData {
  map: string;
  entry: string | null;
  /** exact position (meeting invite teleport) */
  at?: { x: number; y: number };
}

interface Remote {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  state: PlayerState;
  tx: number;
  ty: number;
}

export function ensureAvatarTexture(scene: Phaser.Scene, a: Avatar): string {
  const key = `avatar:${a.skin}${a.hair}${a.shirt}${a.pants}${a.hairStyle}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.addCanvas(key, drawAvatarSheet(a))!;
  for (let row = 0; row < DIRS.length; row++)
    for (let f = 0; f < FRAMES_PER_DIR; f++) tex.add(row * FRAMES_PER_DIR + f, 0, f * FRAME, row * FRAME, FRAME, FRAME);
  DIRS.forEach((dir, row) => {
    const frames = [1, 0, 2, 0].map((f) => ({ key, frame: row * FRAMES_PER_DIR + f }));
    scene.anims.create({ key: `${key}:walk-${dir}`, frames, frameRate: 8, repeat: -1 });
  });
  return key;
}

export class GameScene extends Phaser.Scene {
  private data0!: SceneData;
  private mapKey = "";
  private tiled!: TiledMap;
  private areas: MapArea[] = [];
  private inside = new Set<MapArea>();
  private collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private avatarKey = "";
  private dir: Direction = "down";
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private remotes = new Map<string, Remote>();
  private bubbleGfx!: Phaser.GameObjects.Graphics;
  private path: [number, number][] = [];
  private lastSent = { x: 0, y: 0, dir: "down", moving: false, at: 0 };
  private unsub: (() => void)[] = [];
  private leaving = false;

  constructor() {
    super("game");
  }

  init(data: SceneData) {
    this.data0 = data;
    this.mapKey = `map:${data.map}`;
    this.areas = [];
    this.inside.clear();
    this.collisionLayers = [];
    this.remotes.clear();
    this.path = [];
    this.leaving = false;
  }

  preload() {
    const url = this.data0.map;
    if (this.cache.tilemap.exists(this.mapKey)) return;
    this.load.tilemapTiledJSON(this.mapKey, url);
    this.load.on(`filecomplete-tilemapJSON-${this.mapKey}`, () => {
      const json = this.cache.tilemap.get(this.mapKey).data as TiledMap;
      for (const ts of json.tilesets) {
        if (!ts.image) {
          console.warn(`external tileset ${ts.source} not supported; embed it in Tiled`);
          continue;
        }
        const key = tilesetKey(url, ts.image);
        if (!this.textures.exists(key)) this.load.image(key, new URL(ts.image, new URL(url, location.href)).href);
      }
    });
  }

  create() {
    const url = this.data0.map;
    this.tiled = this.cache.tilemap.get(this.mapKey).data as TiledMap;
    const map = this.make.tilemap({ key: this.mapKey });
    const tilesets = map.tilesets
      .map((ts) => {
        const src = this.tiled.tilesets.find((t) => t.name === ts.name);
        return src?.image ? map.addTilesetImage(ts.name, tilesetKey(url, src.image)) : null;
      })
      .filter((t): t is Phaser.Tilemaps.Tileset => !!t);

    const mapProps = props(this.tiled.properties);
    app.map = url;
    app.mapName = String(mapProps.mapName ?? url.split("/").pop());
    this.cameras.main.setBackgroundColor((this.tiled as unknown as { backgroundcolor?: string }).backgroundcolor ?? "#1d1b26");

    // tile layers (including those nested in groups); layers named/flagged "above" render over players
    let depth = 0;
    for (const ld of map.layers) {
      const lp = props(ld.properties as { name: string; value: unknown }[]);
      if (!ld.visible && !lp[MapProp.collides]) continue;
      const layer = map.createLayer(ld.name, tilesets, 0, 0);
      if (!layer) continue;
      const above = /above/i.test(ld.name);
      layer.setDepth(above ? 10_000 + depth++ : depth++);
      if (!ld.visible) layer.setVisible(false);
      layer.setCollisionByProperty({ collides: true });
      if (lp[MapProp.collides]) layer.setCollisionByExclusion([-1]);
      this.collisionLayers.push(layer);
      // WA legacy zone layers are usually invisible; keep them hidden
      if (lp[MapProp.exitUrl] || lp[MapProp.jitsiRoom] || ld.name === "start") layer.setVisible(false);
    }
    this.areas = extractAreas(this.tiled);

    const spawn = this.data0.at ?? findSpawn(this.areas, this.tiled, this.data0.entry);
    this.inside = new Set(this.areas.filter((a) => a.contains(spawn.x, spawn.y)));

    // local player
    const me = app.identity!;
    this.avatarKey = ensureAvatarTexture(this, me.avatar);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, this.avatarKey, 0).setOrigin(0.5, 0.9);
    this.player.body!.setSize(14, 8).setOffset(9, 22);
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    for (const l of this.collisionLayers) this.physics.add.collider(this.player, l);
    this.playerLabel = this.nameLabel(me.name, true);

    this.bubbleGfx = this.add.graphics().setDepth(0.5 + depth);

    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setZoom(Number(sessionStorage.getItem("werk.zoom")) || 1.5);
    cam.setRoundPixels(true);

    this.input.keyboard!.disableGlobalCapture();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,Z,Q,UP,DOWN,LEFT,RIGHT", false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const z = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.6, 3);
      cam.setZoom(z);
      sessionStorage.setItem("werk.zoom", String(z));
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.clickTo(p.worldX, p.worldY));

    this.hookNetwork();
    this.join();
    this.reportArea(true);
    this.events.once("shutdown", () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
    });
  }

  private join() {
    app.conn!.send({ t: "join", map: this.data0.map, x: Math.round(this.player.x), y: Math.round(this.player.y) });
    this.lastSent = { x: this.player.x, y: this.player.y, dir: this.dir, moving: false, at: 0 };
  }

  private hookNetwork() {
    const conn = app.conn!;
    this.unsub.push(
      conn.on("welcome", () => {
        // reconnected: re-join our map
        if (conn.reconnecting) {
          conn.reconnecting = false;
          for (const id of [...this.remotes.keys()]) this.removeRemote(id);
          this.join();
          this.reportArea(true);
        }
      }),
      conn.on("players", (m) => {
        if (m.map !== this.data0.map) return;
        for (const p of m.list) this.addRemote(p);
      }),
      conn.on("joined", (m) => this.addRemote(m.player)),
      conn.on("left", (m) => this.removeRemote(m.id)),
      conn.on("moves", (m) => {
        for (const [id, x, y, dir, moving] of m.list) {
          const r = this.remotes.get(id);
          if (!r) continue;
          r.tx = x;
          r.ty = y;
          r.state.dir = dir;
          r.state.moving = moving;
          app.players[id] && Object.assign(app.players[id], { x, y });
        }
      }),
    );
  }

  private addRemote(p: PlayerState) {
    if (p.id === app.me?.id || this.remotes.has(p.id)) return;
    const key = ensureAvatarTexture(this, p.avatar);
    const sprite = this.add.sprite(p.x, p.y, key, 0).setOrigin(0.5, 0.9).setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      window.dispatchEvent(new CustomEvent("werk:user-card", { detail: p.id }));
    });
    const label = this.nameLabel(p.name, false);
    this.remotes.set(p.id, { sprite, label, state: { ...p }, tx: p.x, ty: p.y });
    app.players[p.id] = { ...p };
  }

  private removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.sprite.destroy();
    r.label.destroy();
    this.remotes.delete(id);
    delete app.players[id];
  }

  private nameLabel(name: string, mine: boolean) {
    return this.add
      .text(0, 0, name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: "#ffffff",
        backgroundColor: mine ? "#4f7cffcc" : "#1d1b26bb",
        padding: { x: 4, y: 1 },
        resolution: 3,
      })
      .setOrigin(0.5, 1);
  }

  private clickTo(wx: number, wy: number) {
    const tw = this.tiled.tilewidth, th = this.tiled.tileheight;
    const blocked = (x: number, y: number) => this.collisionLayers.some((l) => l.getTileAt(x, y)?.collides);
    const path = findPath(blocked, this.tiled.width, this.tiled.height, Math.floor(this.player.x / tw), Math.floor(this.player.y / th), Math.floor(wx / tw), Math.floor(wy / th));
    this.path = path ?? [];
  }

  update(_time: number, delta: number) {
    if (this.leaving) return;
    const typing = isTyping();
    const k = this.keys;
    let vx = 0, vy = 0;
    if (!typing) {
      if (k.LEFT.isDown || k.A.isDown || k.Q.isDown) vx -= 1;
      if (k.RIGHT.isDown || k.D.isDown) vx += 1;
      if (k.UP.isDown || k.W.isDown || k.Z.isDown) vy -= 1;
      if (k.DOWN.isDown || k.S.isDown) vy += 1;
    }
    if (vx || vy) this.path = [];
    else if (this.path.length) {
      const [tx, ty] = this.path[0];
      const px = (tx + 0.5) * this.tiled.tilewidth, py = (ty + 0.7) * this.tiled.tileheight;
      const dx = px - this.player.x, dy = py - this.player.y;
      if (Math.hypot(dx, dy) < 3) this.path.shift();
      else {
        vx = dx;
        vy = dy;
      }
    }
    const moving = !!(vx || vy);
    if (moving) {
      const len = Math.hypot(vx, vy);
      this.player.setVelocity((vx / len) * SPEED, (vy / len) * SPEED);
      this.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? "left" : "right") : vy < 0 ? "up" : "down";
      this.player.anims.play(`${this.avatarKey}:walk-${this.dir}`, true);
    } else {
      this.player.setVelocity(0, 0);
      this.player.anims.stop();
      this.player.setFrame(DIRS.indexOf(this.dir) * FRAMES_PER_DIR);
    }
    this.player.setDepth(depthFor(this.player.y));
    this.playerLabel.setPosition(this.player.x, this.player.y - 30).setDepth(20_000);

    // remote players: interpolate towards last known position
    const t = Math.min(1, delta / 100);
    for (const r of this.remotes.values()) {
      const s = r.sprite;
      s.x += (r.tx - s.x) * t;
      s.y += (r.ty - s.y) * t;
      const key = s.texture.key;
      if (r.state.moving || Math.hypot(r.tx - s.x, r.ty - s.y) > 1) s.anims.play(`${key}:walk-${r.state.dir}`, true);
      else {
        s.anims.stop();
        s.setFrame(DIRS.indexOf(r.state.dir) * FRAMES_PER_DIR);
      }
      s.setDepth(depthFor(s.y));
      r.label.setPosition(s.x, s.y - 30).setDepth(20_000);
    }

    this.sendMove(moving);
    this.drawBubble();
    this.reportArea(false);
  }

  private sendMove(moving: boolean) {
    const now = performance.now();
    const ls = this.lastSent;
    const changed = Math.abs(ls.x - this.player.x) > 0.5 || Math.abs(ls.y - this.player.y) > 0.5 || ls.dir !== this.dir || ls.moving !== moving;
    if (!changed) return;
    if (moving && now - ls.at < SEND_EVERY_MS) return;
    app.conn!.send({ t: "move", x: Math.round(this.player.x), y: Math.round(this.player.y), dir: this.dir, moving });
    this.lastSent = { x: this.player.x, y: this.player.y, dir: this.dir, moving, at: now };
  }

  private drawBubble() {
    const g = this.bubbleGfx;
    g.clear();
    const b = app.bubble;
    if (!b.id) return;
    const pts: { x: number; y: number }[] = [];
    for (const id of b.members) {
      if (id === app.me?.id) pts.push({ x: this.player.x, y: this.player.y });
      else {
        const r = this.remotes.get(id);
        if (r) pts.push({ x: r.sprite.x, y: r.sprite.y });
      }
    }
    if (!pts.length) return;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const radius = Math.max(40, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy) + 28));
    const color = b.locked ? 0xe5484d : 0x4f7cff;
    g.fillStyle(color, 0.12).fillCircle(cx, cy - 10, radius);
    g.lineStyle(2, color, 0.7).strokeCircle(cx, cy - 10, radius);
  }

  private reportArea(force: boolean) {
    const x = this.player.x, y = this.player.y;
    const now = new Set(this.areas.filter((a) => a.contains(x, y)));
    let changed = force;
    for (const a of now) {
      if (!this.inside.has(a)) {
        changed = true;
        const exit = a.props[MapProp.exitUrl];
        if (typeof exit === "string" && !force) {
          this.inside = now;
          this.teleport(exit);
          return;
        }
      }
    }
    for (const a of this.inside) if (!now.has(a)) changed = true;
    this.inside = now;
    if (!changed) return;

    const list = [...now];
    const get = (k: string) => list.map((a) => a.props[k]).find((v) => v !== undefined && v !== "" && v !== false);
    const meeting = (get(MapProp.livekitRoom) ?? get(MapProp.jitsiRoom) ?? null) as string | null;
    const named = list.find((a) => a.props[MapProp.livekitRoom] || a.props[MapProp.jitsiRoom] || a.props[MapProp.areaName]);
    const areaName = named ? String(named.props[MapProp.areaName] ?? named.name) : null;
    const area = {
      name: areaName,
      silent: get(MapProp.silent) === true,
      meeting: meeting ? `${this.data0.map}#${meeting}` : null,
      website: (get(MapProp.openWebsite) as string) ?? null,
      matrixRoom: (get(MapProp.matrixRoom) as string) ?? null,
    };
    app.area = area;
    app.conn!.send({ t: "area", area: areaName ? `${this.data0.map}#${areaName}` : null, silent: area.silent, meeting: area.meeting });
  }

  /** Walk into an exitUrl area: load the other floor / map. */
  teleport(exitUrl: string) {
    const { map, entry } = resolveExit(this.data0.map, exitUrl);
    this.goTo({ map, entry });
  }

  goTo(data: SceneData) {
    this.leaving = true;
    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      if (data.map === this.data0.map && data.at) {
        // same map: just move
        this.player.setPosition(data.at.x, data.at.y);
        this.leaving = false;
        this.cameras.main.fadeIn(150);
        return;
      }
      this.scene.restart(data);
    });
  }
}

function tilesetKey(mapUrl: string, image: string): string {
  return `tiles:${new URL(image, new URL(mapUrl, location.href)).pathname}`;
}

function depthFor(y: number): number {
  return 1000 + y / 100;
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
