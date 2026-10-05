import Phaser from 'phaser';
import { speciesInfo, type PlayerInfo, type RoundInfo, type SpeciesInfo, type TeamInfo } from '../../net/protocol';
import { listDinos } from '../../sim/defs/dinos';
import { pixelText } from './Hud';
import { DEPTH } from './depth';
import { clawCursor } from '../cursor';
import { TEAM_COLORS } from '../teams';

const W = 290;
const ROW = 16;
const KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'];

/** One mount line, shared by the join screen and this panel. */
export function speciesLabel(s: SpeciesInfo): string {
  return `${(s.kind === 'trex' ? 't-rex' : s.kind).padEnd(13)} ${s.diet.padEnd(9)}  HP ${String(s.hp).padStart(3)}  SPEED ${String(s.speed).padStart(3)}`;
}

type Mode = 'closed' | 'teams' | 'mounts';

/**
 * Shown when the player's own camp has fallen: join another team (then pick a mount) or spectate.
 * While spectating, the number keys bring the team list back.
 */
export class EliminatedPanel {
  private g: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.BitmapText;
  private rows: Phaser.GameObjects.BitmapText[];
  private mode: Mode = 'closed';
  private fallen = false;
  private spectate = false;
  private options: TeamInfo[] = [];
  private pick = '';
  private species = listDinos().slice(0, KEYS.length).map((d) => speciesInfo(d.kind));

  constructor(private scene: Phaser.Scene, private onSwitch: (team: string, kind: string) => void) {
    const depth = DEPTH.hud + 3;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.title = pixelText(scene, 0, 0, '', 0xff8a70).setDepth(depth + 1);
    this.rows = KEYS.concat('S').map((_, i) => {
      const t = pixelText(scene, 0, 0, '').setDepth(depth + 1).setInteractive({ cursor: clawCursor(true) });
      t.on('pointerdown', () => this.choose(this.mode === 'teams' && i === this.options.length ? KEYS.length : i));
      return t;
    });
    const kb = scene.input.keyboard!;
    KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.choose(i)));
    kb.on('keydown-S', () => this.choose(KEYS.length));
    this.render();
  }

  get isOpen(): boolean {
    return this.mode !== 'closed';
  }

  get spectating(): boolean {
    return this.spectate;
  }

  /** Index 0-3: a number key or row; 4: the S key (spectate). */
  private choose(i: number): void {
    if (!this.fallen) return;
    if (this.mode === 'mounts') {
      const s = this.species[i];
      if (!s) return;
      this.mode = 'closed';
      this.onSwitch(this.pick, s.kind);
    } else if (i === KEYS.length) {
      if (this.mode !== 'teams') return;
      this.mode = 'closed';
      this.spectate = true;
    } else {
      // Also reopens the list for a spectator.
      const t = this.options[i];
      if (!t) return;
      this.pick = t.id;
      this.mode = 'mounts';
      this.spectate = false;
    }
    this.render();
  }

  update(me: PlayerInfo | undefined, teams: TeamInfo[], round: RoundInfo): void {
    const mine = teams.find((t) => t.id === me?.team);
    const fallen = !!mine?.eliminated && round.phase !== 'over';
    if (!fallen) {
      if (this.fallen || this.mode !== 'closed' || this.spectate) {
        this.fallen = false;
        this.spectate = false;
        this.mode = 'closed';
        this.render();
      }
      return;
    }
    this.options = teams.filter((t) => !t.eliminated);
    if (!this.fallen) {
      this.fallen = true;
      this.mode = 'teams';
    }
    this.render();
  }

  private render(): void {
    const open = this.mode !== 'closed';
    this.g.clear();
    for (const o of [this.g, this.title, ...this.rows]) o.setVisible(open);
    if (!open) return;
    const lines: { text: string; tint: number }[] =
      this.mode === 'teams'
        ? [
            ...this.options.map((t, i) => ({ text: `${i + 1}  JOIN TEAM ${t.name}`, tint: TEAM_COLORS[t.slot] })),
            { text: 'S  SPECTATE', tint: 0xf4f0e0 },
          ]
        : this.species.map((s, i) => ({ text: `${i + 1}  ${speciesLabel(s)}`, tint: 0xf4f0e0 }));
    const cam = this.scene.cameras.main;
    const x = Math.round(cam.width / 2 - W / 2);
    const y = Math.round(cam.height / 2 - 50);
    const h = 30 + lines.length * ROW;
    this.g.fillStyle(0x0b0805, 0.88).fillRect(x, y, W, h);
    this.g.lineStyle(1, 0xc8a650, 1).strokeRect(x + 0.5, y + 0.5, W - 1, h - 1);
    this.title.setText(this.mode === 'teams' ? 'YOUR CAMP HAS FALLEN' : 'CHOOSE YOUR MOUNT').setPosition(x + 8, y + 7);
    this.rows.forEach((t, i) => {
      const l = lines[i];
      t.setVisible(!!l);
      if (!l) return;
      t.setText(l.text).setTint(l.tint).setPosition(x + 8, y + 26 + i * ROW);
    });
  }
}
