import Phaser from 'phaser';
import type { Dino, World } from '../../sim/types';
import { clamp } from '../../sim/math';
import { generateWorld } from '../../sim/worldgen';
import type { PlayerInfo, TimedEvent, WelcomeMsg } from '../../net/protocol';
import { NetClient, gameSocketUrl } from '../net/NetClient';
import { PlayerInput } from '../input/playerInput';
import { WorldView } from '../render/WorldView';
import { DinoView } from '../render/DinoView';
import { ProjectileView } from '../render/ProjectileView';
import { Effects } from '../render/Effects';
import { ArcIndicator } from '../render/ArcIndicator';
import { Hud, pixelText } from '../render/Hud';
import { DEPTH } from '../render/depth';
import { paletteKey } from '../teams';

const CAMERA_LOOKAHEAD = 0.18;
const CAMERA_LOOKAHEAD_MAX = 40;
const INPUT_INTERVAL_MS = 1000 / 60;

/** The live match as seen by this client: server snapshots, interpolated and drawn. */
export class GameScene extends Phaser.Scene {
  private net!: NetClient;
  private world: World | null = null;
  private playerInput!: PlayerInput;
  private worldView!: WorldView;
  private dinoViews = new Map<number, DinoView>();
  private projectileView!: ProjectileView;
  private fx!: Effects;
  private arc!: ArcIndicator;
  private hud!: Hud;
  private reticle!: Phaser.GameObjects.Image;
  private status!: Phaser.GameObjects.BitmapText;
  private camX = 0;
  private camY = 0;
  private lastInput = 0;
  private leaving = false;

  constructor() {
    super('game');
  }

  init(): void {
    this.world = null;
    this.dinoViews = new Map();
    this.leaving = false;
  }

  create(data: { team: string; kind: string }): void {
    const cam = this.cameras.main;
    this.status = pixelText(this, Math.round(cam.width / 2), Math.round(cam.height / 2), 'JOINING...').setOrigin(0.5);
    this.net = new NetClient(gameSocketUrl(), data.team, data.kind);
    this.net.onWelcome = (w) => this.startWorld(w);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.net.close();
      this.worldView?.destroy();
    });
    // Debug handle for the browser console / test drivers (dev builds, or any build with ?debug).
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
      (window as unknown as { dinoriders: unknown }).dinoriders = { scene: this, net: this.net };
    }
  }

  private startWorld(w: WelcomeMsg): void {
    this.status.setText('');
    this.world = generateWorld(w.seed);
    this.worldView = new WorldView(this, this.world);
    this.projectileView = new ProjectileView(this);
    this.fx = new Effects(this);
    this.arc = new ArcIndicator(this);
    this.hud = new Hud(this);
    this.playerInput = new PlayerInput(this);
    this.reticle = this.add.image(0, 0, 'reticle').setDepth(DEPTH.hud + 1);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.width, this.world.height);
    cam.setRoundPixels(true);
  }

  update(time: number): void {
    if (this.net.status === 'closed') return this.leave(this.net.error ?? 'CONNECTION LOST');
    if (!this.world || !this.net.mirror.ready) return;
    const mirror = this.net.mirror;
    const me = this.net.welcome!.playerId;

    if (time - this.lastInput >= INPUT_INTERVAL_MS - 1) {
      this.lastInput = time;
      this.net.sendInput(this.playerInput.command());
    }

    const rt = mirror.renderTick(performance.now());
    const players = mirror.players();
    const teams = mirror.teams();
    for (const e of mirror.takeEvents(rt)) this.handleEvent(e, players);

    const dinos = mirror.dinosAt(rt);
    this.syncDinoViews(dinos);
    const meInfo = players.find((p) => p.id === me);
    const myDino = dinos.find((d) => d.playerId === me);
    this.projectileView.update(mirror.projectilesAt(rt), meInfo?.team);
    this.worldView.updateBases(teams);
    this.worldView.update(myDino);
    this.arc.update(myDino);
    this.followCamera(myDino ?? teams.find((t) => t.id === meInfo?.team)?.base);

    const cam = this.cameras.main;
    const ptr = this.input.activePointer;
    const rw = cam.getWorldPoint(ptr.x, ptr.y);
    this.reticle.setPosition(Math.round(rw.x), Math.round(rw.y));
    this.hud.update({ me: meInfo, myDino, dinos, players, teams });
  }

  private syncDinoViews(dinos: Dino[]): void {
    const teams = this.net.mirror.teams();
    const seen = new Set<number>();
    for (const d of dinos) {
      seen.add(d.id);
      const v = this.dinoViews.get(d.id);
      if (v) v.update(d);
      else this.dinoViews.set(d.id, new DinoView(this, d, paletteKey(d.team, teams)));
    }
    for (const [id, v] of this.dinoViews) {
      if (seen.has(id)) continue;
      v.destroy();
      this.dinoViews.delete(id);
    }
  }

  private handleEvent(e: TimedEvent, players: PlayerInfo[]): void {
    switch (e.type) {
      case 'shot':
        this.fx.muzzle(e.x, e.y);
        break;
      case 'hit':
        this.fx.hit(e.x, e.y);
        if (this.dinoViews.get(e.targetId)?.lastView.playerId === this.net.welcome!.playerId) this.cameras.main.shake(80, 0.003);
        break;
      case 'impact':
        this.fx.impact(e.x, e.y);
        break;
      case 'death':
        this.fx.death(e.x, e.y);
        break;
      case 'kill':
        this.hud.addKill(
          players.find((p) => p.id === e.killer),
          players.find((p) => p.id === e.victim),
          e.victimKind,
          this.net.mirror.teams(),
        );
        break;
    }
  }

  private followCamera(target: { x: number; y: number } | undefined): void {
    if (!target) return;
    const cam = this.cameras.main;
    const aim = this.playerInput.aimWorld();
    const lx = clamp((aim.x - target.x) * CAMERA_LOOKAHEAD, -CAMERA_LOOKAHEAD_MAX, CAMERA_LOOKAHEAD_MAX);
    const ly = clamp((aim.y - target.y) * CAMERA_LOOKAHEAD, -CAMERA_LOOKAHEAD_MAX, CAMERA_LOOKAHEAD_MAX);
    const tx = target.x + lx - cam.width / 2;
    const ty = target.y + ly - cam.height / 2;
    if (this.camX === 0 && this.camY === 0) {
      this.camX = tx;
      this.camY = ty;
    }
    this.camX += (tx - this.camX) * 0.12;
    this.camY += (ty - this.camY) * 0.12;
    cam.setScroll(Math.round(this.camX), Math.round(this.camY));
  }

  private leave(message: string): void {
    if (this.leaving) return;
    this.leaving = true;
    this.status.setText(`${message} - CLICK TO REJOIN`).setDepth(DEPTH.hud + 5);
    this.input.once('pointerdown', () => this.scene.start('join', { message }));
  }
}
