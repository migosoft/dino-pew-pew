import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { JoinScene } from './scenes/JoinScene';

// The game renders at a low internal resolution and is scaled up by an integer
// factor so every art pixel stays a crisp square.
const BASE_W = 480;
const BASE_H = 270;

function fit(): { w: number; h: number; zoom: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const zoom = Math.max(1, Math.round(Math.min(W / BASE_W, H / BASE_H)));
  return { w: Math.ceil(W / zoom), h: Math.ceil(H / zoom), zoom };
}

const initial = fit();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initial.w,
  height: initial.h,
  backgroundColor: '#10140c',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, zoom: initial.zoom },
  scene: [BootScene, JoinScene, GameScene],
});

window.addEventListener('resize', () => {
  const f = fit();
  game.scale.setZoom(f.zoom);
  game.scale.resize(f.w, f.h);
});
