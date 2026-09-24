import Phaser from "phaser";
import { GameScene, type SceneData } from "./GameScene";

let game: Phaser.Game | null = null;

export function startGame(parent: HTMLElement, first: SceneData): Phaser.Game {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    backgroundColor: "#1d1b26",
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    physics: { default: "arcade", arcade: { debug: false } },
    input: { keyboard: { capture: [] } },
    scene: [],
  });
  game.scene.add("game", GameScene, true, first);
  // test/debug hook (e2e tests set werk.debug)
  let debug = import.meta.env.DEV;
  try {
    debug ||= localStorage.getItem("werk.debug") === "1";
  } catch {}
  if (debug) (window as unknown as Record<string, unknown>).__werk_scene = gameScene;
  return game;
}

export function gameScene(): GameScene | null {
  return (game?.scene.getScene("game") as GameScene) ?? null;
}

export function stopGame(): void {
  game?.destroy(true);
  game = null;
}
