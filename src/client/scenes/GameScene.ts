import Phaser from 'phaser';
import type { GameEvent, GameState, InputCommand } from '../../sim/types';
import { DT } from '../../sim/types';
import { clamp } from '../../sim/math';
import { createGame, step } from '../../sim/sim';
import { PlayerInput } from '../input/playerInput';
import { WorldView } from '../render/WorldView';
import { DinoView } from '../render/DinoView';
import { ProjectileView } from '../render/ProjectileView';
import { Effects } from '../render/Effects';
import { ArcIndicator } from '../render/ArcIndicator';
import { Hud, pixelText } from '../render/Hud';
import { DEPTH } from '../render/depth';

const MAX_STEPS_PER_FRAME = 5;
const CAMERA_LOOKAHEAD = 0.18;
const CAMERA_LOOKAHEAD_MAX = 40;

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private input2!: PlayerInput;
  private worldView!: WorldView;
  private dinoViews = new Map<number, DinoView>();
  private projectileView!: ProjectileView;
  private fx!: Effects;
  private arc!: ArcIndicator;
  private hud!: Hud;
  private reticle!: Phaser.GameObjects.Image;
  private acc = 0;
  private seed = 0;
  private camX = 0;
  private camY = 0;

  constructor() {
    super('game');
  }

  init(data: { seed?: number; intro?: boolean }): void {
    this.seed = data.seed ?? 1;
    this.acc = 0;
    this.dinoViews = new Map();
    this.registry.set('intro', data.intro ?? false);
  }

  create(): void {
    this.state = createGame(this.seed);
    const { world } = this.state;

    this.worldView = new WorldView(this, world);
    this.projectileView = new ProjectileView(this);
    this.fx = new Effects(this);
    this.arc = new ArcIndicator(this);
    this.hud = new Hud(this);
    this.input2 = new PlayerInput(this);
    this.reticle = this.add.image(0, 0, 'reticle').setDepth(DEPTH.hud + 1);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, world.width, world.height);
    cam.setRoundPixels(true);
    this.camX = world.spawn.x - cam.width / 2;
    this.camY = world.spawn.y - cam.height / 2;
    cam.setScroll(this.camX, this.camY);

    this.syncDinoViews();

    if (this.registry.get('intro')) {
      const t1 = pixelText(this, 0, 0, 'DINORIDERS', 0xffe066).setOrigin(0.5).setScale(3);
      const t2 = pixelText(this, 0, 0, 'W/S MOVE  A/D TURN  MOUSE AIM  CLICK FIRE').setOrigin(0.5);
      const place = () => {
        t1.setPosition(Math.round(cam.width / 2), Math.round(cam.height * 0.32));
        t2.setPosition(Math.round(cam.width / 2), Math.round(cam.height * 0.32) + 22);
      };
      place();
      this.tweens.add({ targets: [t1, t2], alpha: 0, delay: 2400, duration: 700, onComplete: () => (t1.destroy(), t2.destroy()) });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.worldView.destroy());
    // Dev-only handle for debugging from the browser console / test drivers.
    if (import.meta.env.DEV) (window as unknown as { dinoriders: unknown }).dinoriders = { scene: this, state: () => this.state };
  }

  update(_time: number, deltaMs: number): void {
    this.acc += Math.min(deltaMs / 1000, 0.25);
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      const cmd: InputCommand = this.input2.command();
      const commands = new Map<number, InputCommand>();
      if (!this.state.gameOver) commands.set(this.state.playerId, cmd);
      step(this.state, commands, DT);
      this.handleEvents(this.state.events);
      this.acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.render(this.acc / DT);
  }

  private syncDinoViews(): void {
    for (const d of this.state.dinos) {
      if (!this.dinoViews.has(d.id) && d.alive) this.dinoViews.set(d.id, new DinoView(this, d));
    }
  }

  private handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.fx.muzzle(e.x, e.y);
          break;
        case 'hit':
          this.fx.hit(e.x, e.y);
          if (e.targetId === this.state.playerId) this.cameras.main.shake(80, 0.003);
          break;
        case 'impact':
          this.fx.impact(e.x, e.y);
          break;
        case 'death': {
          this.fx.death(e.x, e.y);
          const v = this.dinoViews.get(e.dinoId);
          if (v) {
            v.destroy();
            this.dinoViews.delete(e.dinoId);
          }
          break;
        }
        case 'waveStart':
          this.syncDinoViews();
          this.hud.showBanner(`WAVE ${e.wave}`, `${this.state.dinos.filter((d) => d.team === 'enemy' && d.alive).length} RIDERS INCOMING`);
          break;
        case 'waveCleared':
          this.hud.showBanner('WAVE CLEARED', '+25 HP', 0x8ef06a);
          break;
        case 'gameOver':
          this.time.delayedCall(1400, () => {
            this.scene.pause();
            this.scene.launch('gameover', { score: this.state.score, wave: this.state.wave.number, seed: this.seed });
          });
          break;
      }
    }
  }

  private render(alpha: number): void {
    const state = this.state;
    for (const v of this.dinoViews.values()) v.update(alpha);
    this.projectileView.update(state.projectiles, alpha);

    const playerView = this.dinoViews.get(state.playerId);
    const p = playerView?.lastView;
    this.arc.update(p);
    this.worldView.update(p);

    // Camera: follow the player with a little lookahead toward the cursor.
    const cam = this.cameras.main;
    if (p) {
      const aim = this.input2.aimWorld();
      const lx = clamp((aim.x - p.x) * CAMERA_LOOKAHEAD, -CAMERA_LOOKAHEAD_MAX, CAMERA_LOOKAHEAD_MAX);
      const ly = clamp((aim.y - p.y) * CAMERA_LOOKAHEAD, -CAMERA_LOOKAHEAD_MAX, CAMERA_LOOKAHEAD_MAX);
      const tx = p.x + lx - cam.width / 2;
      const ty = p.y + ly - cam.height / 2;
      this.camX += (tx - this.camX) * 0.12;
      this.camY += (ty - this.camY) * 0.12;
      cam.setScroll(Math.round(this.camX), Math.round(this.camY));
    }

    const ptr = this.input.activePointer;
    const rw = cam.getWorldPoint(ptr.x, ptr.y);
    this.reticle.setPosition(Math.round(rw.x), Math.round(rw.y));

    this.hud.update(state, this.dinoViews);
  }
}
