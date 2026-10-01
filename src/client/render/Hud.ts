import Phaser from 'phaser';
import type { Dino, Vec2 } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { BASE_RADIUS } from '../../sim/players';
import { totalLevels } from '../../sim/upgrades';
import type { PlayerInfo, TeamInfo } from '../../net/protocol';
import { teamColor } from '../teams';
import { FONT_KEY } from './textures';
import { DEPTH } from './depth';

export function pixelText(scene: Phaser.Scene, x: number, y: number, text: string, tint = 0xf4f0e0): Phaser.GameObjects.BitmapText {
  return scene.add.bitmapText(x, y, FONT_KEY, text.toUpperCase()).setTint(tint).setScrollFactor(0).setDepth(DEPTH.hud);
}

/** Everything the HUD needs for one frame. */
export interface HudModel {
  me: PlayerInfo | undefined;
  myDino: Dino | undefined;
  dinos: Dino[];
  players: PlayerInfo[];
  teams: TeamInfo[];
}

const ENEMY_ARROW_RANGE = 650;
const FEED_LINES = 5;
const FEED_SECONDS = 6;

/** Screen-space HUD plus world-space name tags and health bars. */
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private world: Phaser.GameObjects.Graphics;
  private stats: Phaser.GameObjects.BitmapText;
  private center: Phaser.GameObjects.BitmapText;
  private zone: Phaser.GameObjects.BitmapText;
  private hint: Phaser.GameObjects.BitmapText;
  private notice = { text: '', until: 0 };
  private board: Phaser.GameObjects.BitmapText;
  private feed: { text: Phaser.GameObjects.BitmapText; born: number }[] = [];
  private tags: Phaser.GameObjects.BitmapText[] = [];
  private arrows: Phaser.GameObjects.Image[] = [];
  private baseArrow: Phaser.GameObjects.Image;
  private tab: Phaser.Input.Keyboard.Key;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    this.world = scene.add.graphics().setDepth(DEPTH.overlay);
    this.stats = pixelText(scene, 6, 15, '');
    this.center = pixelText(scene, 0, 0, '').setOrigin(0.5).setScale(2);
    this.zone = pixelText(scene, 0, 0, '', 0x8ef06a).setOrigin(0.5, 0);
    this.hint = pixelText(scene, 0, 0, '', 0xe8dcb8).setOrigin(0.5, 1);
    this.board = pixelText(scene, 0, 0, '').setOrigin(0.5, 0).setDepth(DEPTH.hud + 2);
    this.baseArrow = scene.add.image(0, 0, 'arrow').setScrollFactor(0).setDepth(DEPTH.hud).setVisible(false);
    const kb = scene.input.keyboard!;
    this.tab = kb.addKey('TAB');
    kb.addCapture('TAB');
  }

  /** Show a short message in the hint line for a moment. */
  showNotice(text: string): void {
    this.notice = { text, until: this.scene.time.now + 2200 };
  }

  addKill(killer: PlayerInfo | undefined, victim: PlayerInfo | undefined, victimKind: string, teams: TeamInfo[]): void {
    const who = killer?.name ?? 'THE WILD';
    const whom = victim?.name ?? `A WILD ${victimKind}`;
    const t = pixelText(this.scene, 0, 0, `${who} > ${whom}`, killer ? teamColor(killer.team, teams) : 0xc8b48a).setOrigin(1, 0);
    this.feed.unshift({ text: t, born: this.scene.time.now });
    while (this.feed.length > FEED_LINES) this.feed.pop()!.text.destroy();
  }

  update(m: HudModel): void {
    const cam = this.scene.cameras.main;
    const g = this.g;
    g.clear();
    const myTeam = m.me?.team;
    const teamInfo = m.teams.find((t) => t.id === myTeam);

    // Health bar.
    const d = m.myDino;
    const hpFrac = d ? Math.max(0, d.hp / d.maxHp) : 0;
    g.fillStyle(0x17110d, 1).fillRect(5, 5, 72, 7);
    g.fillStyle(0x4a1c18, 1).fillRect(6, 6, 70, 5);
    g.fillStyle(hpFrac > 0.35 ? 0x6fcf4a : 0xe0503c, 1).fillRect(6, 6, Math.round(70 * hpFrac), 5);
    g.fillStyle(0xffffff, 0.35).fillRect(6, 6, Math.round(70 * hpFrac), 1);

    const riders = m.players.length;
    // Right-mouse ability and its cooldown.
    const ability = d ? getDino(d.kind).ability : undefined;
    const abilityLine = ability && d ? `\n${ability.kind === 'leap' ? 'JUMP' : 'DASH'} ${d.abilityCooldown > 0 ? `IN ${Math.ceil(d.abilityCooldown)}` : 'READY'}` : '';
    this.stats
      .setText(
        `TEAM ${teamInfo?.name ?? '?'}\n$ ${m.me?.money ?? 0}\nK ${m.me?.kills ?? 0}  D ${m.me?.deaths ?? 0}\nRIDERS ${riders}` +
          abilityLine +
          (m.me && totalLevels(m.me.upgrades) > 0
            ? `\nDMG${m.me.upgrades.damage} RNG${m.me.upgrades.range} ROF${m.me.upgrades.fireRate} ARM${m.me.upgrades.armor}`
            : ''),
      )
      .setTint(myTeam ? teamColor(myTeam, m.teams) : 0xffffff);

    // Respawn countdown.
    const dead = m.me && m.me.dinoId === null;
    this.center
      .setText(dead ? `RESPAWN IN ${Math.max(1, Math.ceil(m.me!.respawn))}` : '')
      .setPosition(Math.round(cam.width / 2), Math.round(cam.height * 0.35));

    // Safe zone hint.
    const inBase = d && teamInfo && (d.x - teamInfo.base.x) ** 2 + (d.y - teamInfo.base.y) ** 2 < BASE_RADIUS * BASE_RADIUS;
    this.zone.setText(inBase ? 'SAFE ZONE - E: SHOP' : '').setPosition(Math.round(cam.width / 2), 6);

    // Eating feedback, and a reminder of what this species eats when it's hurt.
    let hint = '';
    if (d?.eating) hint = 'EATING...';
    else if (d && d.hp < d.maxHp * 0.7) {
      const def = getDino(d.kind);
      hint =
        def.diet === 'carnivore'
          ? 'HURT? STAND STILL AT A CARCASS TO EAT'
          : def.diet === 'herbivore'
            ? `HURT? STAND STILL AT ${def.size === 'large' ? 'BUSHES, FERNS OR TREES' : 'BUSHES OR FERNS'} TO EAT`
            : 'HURT? STAND STILL AT PLANTS OR A CARCASS TO EAT';
    }
    const showNotice = this.scene.time.now < this.notice.until;
    this.hint
      .setText(showNotice ? this.notice.text : hint)
      .setTint(showNotice ? 0xffb030 : d?.eating ? 0x8ef06a : 0xe8dcb8).setPosition(Math.round(cam.width / 2), cam.height - 6);

    // Kill feed (top right), fading out.
    const now = this.scene.time.now;
    this.feed = this.feed.filter((f) => {
      const age = (now - f.born) / 1000;
      if (age < FEED_SECONDS) return true;
      f.text.destroy();
      return false;
    });
    this.feed.forEach((f, i) => {
      const age = (now - f.born) / 1000;
      f.text.setPosition(cam.width - 6, 6 + i * 10).setAlpha(Math.min(1, (FEED_SECONDS - age) * 1.5));
    });

    this.worldOverlay(m);
    this.edgeArrows(m, teamInfo?.base);
    this.scoreboard(m);
  }

  /** Name tags over other riders, health bars over damaged dinos. */
  private worldOverlay(m: HudModel): void {
    const w = this.world;
    w.clear();
    let tagIdx = 0;
    for (const e of m.dinos) {
      if (e.id === m.myDino?.id) continue;
      const r = getDino(e.kind).radius;
      const x = Math.round(e.x);
      const top = Math.round(e.y - r - 8);
      const color = teamColor(e.team, m.teams);
      if (e.hp < e.maxHp) {
        w.fillStyle(0x17110d, 1).fillRect(x - 9, top - 1, 18, 4);
        w.fillStyle(e.team === m.me?.team ? 0x6fcf4a : 0xe0503c, 1).fillRect(x - 8, top, Math.round(16 * (e.hp / e.maxHp)), 2);
      }
      if (e.playerId !== null) {
        const p = m.players.find((pl) => pl.id === e.playerId);
        if (!this.tags[tagIdx]) this.tags[tagIdx] = this.scene.add.bitmapText(0, 0, FONT_KEY, '').setOrigin(0.5, 1).setDepth(DEPTH.overlay);
        this.tags[tagIdx++].setText(p?.name ?? '').setTint(color).setPosition(x, top - 2).setVisible(true);
      }
    }
    for (let i = tagIdx; i < this.tags.length; i++) this.tags[i].setVisible(false);
  }

  /** Arrows on the screen edge: your base (team color) and nearby off-screen enemies (red). */
  private edgeArrows(m: HudModel, base: Vec2 | undefined): void {
    const cam = this.scene.cameras.main;
    const place = (img: Phaser.GameObjects.Image, wx: number, wy: number): boolean => {
      const sx = wx - cam.scrollX;
      const sy = wy - cam.scrollY;
      if (sx > 0 && sy > 0 && sx < cam.width && sy < cam.height) return false;
      const cx = cam.width / 2;
      const cy = cam.height / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      const margin = 8;
      const k = Math.min((cx - margin) / Math.abs(Math.cos(ang) || 1e-6), (cy - margin) / Math.abs(Math.sin(ang) || 1e-6));
      img.setPosition(Math.round(cx + Math.cos(ang) * k), Math.round(cy + Math.sin(ang) * k)).setRotation(ang).setVisible(true);
      return true;
    };
    if (base && m.me) {
      this.baseArrow.setTint(teamColor(m.me.team, m.teams));
      if (!place(this.baseArrow, base.x, base.y)) this.baseArrow.setVisible(false);
    } else this.baseArrow.setVisible(false);

    const me = m.myDino;
    // Threats only: enemy riders and wild carnivores (grazing herbivores are not worth an arrow).
    const threat = (e: Dino) => e.team !== me!.team && (e.playerId !== null || getDino(e.kind).diet !== 'herbivore');
    const hostiles = me ? m.dinos.filter((e) => threat(e) && (e.x - me.x) ** 2 + (e.y - me.y) ** 2 < ENEMY_ARROW_RANGE ** 2) : [];
    while (this.arrows.length < hostiles.length) this.arrows.push(this.scene.add.image(0, 0, 'arrow').setScrollFactor(0).setDepth(DEPTH.hud));
    this.arrows.forEach((a, i) => {
      const e = hostiles[i];
      if (!e || !place(a, e.x, e.y)) a.setVisible(false);
    });
  }

  /** Hold Tab: riders grouped by team with kills/deaths. */
  private scoreboard(m: HudModel): void {
    if (!this.tab.isDown) {
      this.board.setVisible(false);
      return;
    }
    const cam = this.scene.cameras.main;
    const lines: string[] = ['SCOREBOARD', ''];
    for (const t of m.teams) {
      lines.push(`TEAM ${t.name}`);
      const ps = m.players.filter((p) => p.team === t.id).sort((a, b) => b.kills - a.kills);
      for (const p of ps) lines.push(`${p.id === m.me?.id ? '>' : ' '} ${p.name.padEnd(10)} K ${String(p.kills).padStart(3)}  D ${String(p.deaths).padStart(3)}`);
      lines.push('');
    }
    this.board.setText(lines.join('\n')).setPosition(Math.round(cam.width / 2), 40).setVisible(true);
    this.g.fillStyle(0x0b0805, 0.75).fillRect(Math.round(cam.width / 2 - 110), 34, 220, lines.length * 10 + 8);
  }
}
