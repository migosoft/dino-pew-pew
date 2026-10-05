import Phaser from 'phaser';
import type { Dino, World } from '../../sim/types';
import { clamp } from '../../sim/math';
import { generateWorld } from '../../sim/worldgen';
import type { PlayerInfo, TimedEvent, WelcomeMsg } from '../../net/protocol';
import { NetClient, gameSocketUrl } from '../net/NetClient';
import { PlayerInput } from '../input/playerInput';
import { WorldView } from '../render/WorldView';
import { WaterView, wadingOf } from '../render/WaterView';
import { DinoView } from '../render/DinoView';
import { FoodView } from '../render/FoodView';
import { getDino } from '../../sim/defs/dinos';
import { geometry } from '../render/geometry';
import { ProjectileView } from '../render/ProjectileView';
import { Effects } from '../render/Effects';
import { ArcIndicator } from '../render/ArcIndicator';
import { Hud, pixelText } from '../render/Hud';
import { DEPTH } from '../render/depth';
import { FONT_KEY } from '../render/textures';
import { paletteKey } from '../teams';
import { ShopPanel } from '../render/ShopPanel';
import { BASE_RADIUS } from '../../sim/players';
import { UPGRADE_STATS } from '../../sim/upgrades';

const CAMERA_LOOKAHEAD = 0.18;
const CAMERA_LOOKAHEAD_MAX = 40;
const INPUT_INTERVAL_MS = 1000 / 60;

/** The live match as seen by this client: server snapshots, interpolated and drawn. */
export class GameScene extends Phaser.Scene {
  private net!: NetClient;
  private world: World | null = null;
  private playerInput!: PlayerInput;
  private worldView!: WorldView;
  private waterView!: WaterView;
  private dinoViews = new Map<number, DinoView>();
  private projectileView!: ProjectileView;
  private foodView!: FoodView;
  private lastFeedFx = 0;
  private lastDashFx = 0;
  private shop!: ShopPanel;
  private inBase = false;
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
    // The default cursor is shared by all scenes: hide it again, the reticle replaces it.
    this.input.setDefaultCursor('none');
    const cam = this.cameras.main;
    this.status = pixelText(this, Math.round(cam.width / 2), Math.round(cam.height / 2), 'JOINING...').setOrigin(0.5);
    this.net = new NetClient(gameSocketUrl(), data.team, data.kind);
    this.net.onWelcome = (w) => this.startWorld(w);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.net.close();
      this.worldView?.destroy();
      this.waterView?.destroy();
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
    this.waterView = new WaterView(this, this.world);
    this.foodView = new FoodView(this, this.world.food);
    this.projectileView = new ProjectileView(this);
    this.fx = new Effects(this);
    this.arc = new ArcIndicator(this);
    this.hud = new Hud(this);
    this.playerInput = new PlayerInput(this);
    this.reticle = this.add.image(0, 0, 'reticle').setDepth(DEPTH.hud + 1);
    this.shop = new ShopPanel(this, (stat) => this.net.buy(stat));
    const kb = this.input.keyboard!;
    kb.on('keydown-E', () => {
      if (this.inBase || this.shop.isOpen) this.shop.toggle();
    });
    kb.on('keydown-ESC', () => this.shop.close());
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((key, i) => kb.on('keydown-' + key, () => this.shop.isOpen && this.net.buy(UPGRADE_STATS[i])));
    // No shooting while browsing the shop (clicks buy instead).
    const command = this.playerInput.command.bind(this.playerInput);
    this.playerInput.command = () => {
      const c = command();
      return this.shop.isOpen ? { ...c, fire: false, ability: false } : c;
    };
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.width, this.world.height);
    cam.setRoundPixels(true);
  }

  update(time: number, delta: number): void {
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

    this.foodView.setPlants(this.net.takePlantUpdates());
    this.foodView.setCarcasses(mirror.latest()!.carcasses);
    const dinos = mirror.dinosAt(rt);
    if (time - this.lastFeedFx > 250) {
      this.lastFeedFx = time;
      for (const d of dinos) if (d.eating) this.fx.feed(d.x + Math.cos(d.heading) * geometry(d).mouth, d.y + Math.sin(d.heading) * geometry(d).mouth, getDino(d.kind).diet === 'carnivore');
    }
    if (time - this.lastDashFx > 40) {
      this.lastDashFx = time;
      for (const d of dinos) {
        if (d.abilityT < 0 || getDino(d.kind).ability?.kind !== 'dash') continue;
        const tx = d.x - Math.cos(d.heading) * 8;
        const ty = d.y - Math.sin(d.heading) * 8;
        // Charging through water throws up spray instead of dust.
        if (this.waterView.isWet(tx, ty)) this.waterView.splash(tx, ty, 10);
        else this.fx.dashTrail(tx, ty);
      }
    }
    this.syncDinoViews(dinos);
    this.waterView.update(delta, dinos);
    // Spent bolts only plink: a small ring and a couple of droplets.
    for (const p of mirror.takeSpent()) this.waterView.splash(p.x, p.y, 3, 2);
    const meInfo = players.find((p) => p.id === me);
    const myDino = dinos.find((d) => d.playerId === me);
    this.projectileView.update(mirror.projectilesAt(rt), meInfo?.team);
    this.worldView.updateBases(teams);
    this.worldView.update(myDino);
    this.arc.update(myDino, this.playerInput.aimWorld());
    this.followCamera(myDino ?? teams.find((t) => t.id === meInfo?.team)?.base);

    const cam = this.cameras.main;
    const ptr = this.input.activePointer;
    const rw = cam.getWorldPoint(ptr.x, ptr.y);
    this.reticle.setPosition(Math.round(rw.x), Math.round(rw.y));
    const myBase = teams.find((t) => t.id === meInfo?.team)?.base;
    this.inBase = !!(myDino && myBase && (myDino.x - myBase.x) ** 2 + (myDino.y - myBase.y) ** 2 < BASE_RADIUS * BASE_RADIUS);
    if (!this.inBase && this.shop.isOpen) this.shop.close();
    this.shop.update(meInfo);
    for (const n of this.net.notices.splice(0)) this.hud.showNotice(n);
    this.hud.update({ me: meInfo, myDino, dinos, players, teams });
  }

  private syncDinoViews(dinos: Dino[]): void {
    const teams = this.net.mirror.teams();
    const seen = new Set<number>();
    for (const d of dinos) {
      seen.add(d.id);
      const v = this.dinoViews.get(d.id);
      const wading = wadingOf(this.world!, d);
      if (v) v.update(d, wading);
      else this.dinoViews.set(d.id, new DinoView(this, d, paletteKey(d.team, teams))).get(d.id)!.update(d, wading);
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
      case 'bounty':
        if (e.playerId === this.net.welcome!.playerId) this.floatText(e.x, e.y, `+$${e.amount}`);
        break;
      case 'melee':
        this.fx.hit(e.x, e.y);
        if (this.dinoViews.get(e.targetId)?.lastView.playerId === this.net.welcome!.playerId) this.cameras.main.shake(100, 0.004);
        break;
      case 'ability':
        if (e.kind === 'whip') break;
        if (this.waterView.isWet(e.x, e.y)) this.waterView.splash(e.x, e.y, 14);
        else this.fx.takeOff(e.x, e.y);
        break;
      case 'whip': {
        if (this.waterView.isWet(e.x, e.y)) this.waterView.splash(e.x, e.y, 20);
        else this.fx.whip(e.x, e.y);
        const cam = this.cameras.main;
        if (cam.worldView.contains(e.x, e.y)) cam.shake(90, 0.003);
        break;
      }
      case 'bite': {
        if (this.waterView.isWet(e.x, e.y)) this.waterView.splash(e.x, e.y, 10);
        this.fx.bite(e.x, e.y, e.targetId !== null);
        const cam = this.cameras.main;
        if (e.targetId !== null && this.dinoViews.get(e.targetId)?.lastView.playerId === this.net.welcome!.playerId) cam.shake(160, 0.006);
        else if (cam.worldView.contains(e.x, e.y)) cam.shake(70, 0.002);
        break;
      }
      case 'slam': {
        const cam = this.cameras.main;
        if (this.waterView.isWet(e.x, e.y)) this.waterView.splash(e.x, e.y, 24);
        else this.fx.slam(e.x, e.y);
        if (cam.worldView.contains(e.x, e.y)) cam.shake(140, 0.005);
        break;
      }
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

  private floatText(x: number, y: number, text: string): void {
    const t = this.add.bitmapText(Math.round(x), Math.round(y - 14), FONT_KEY, text).setOrigin(0.5).setTint(0xffe066).setDepth(DEPTH.hud);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, delay: 500, duration: 900, onComplete: () => t.destroy() });
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
