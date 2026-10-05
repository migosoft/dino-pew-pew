import Phaser from 'phaser';
import type { LobbyInfo, TeamInfo } from '../../net/protocol';
import { RANDOM_MAP, mapsFor, type RoundSettings } from '../../sim/maps';
import { TEAM_NAMES } from '../../sim/players';
import { speciesLabel } from '../render/EliminatedPanel';
import { pixelText } from '../render/Hud';
import { TEAM_COLORS } from '../teams';
import { clawCursor } from '../cursor';

interface Option {
  label: string;
  tint: number;
  enabled: boolean;
  pick: () => void;
}

/** Join screen: the first rider sets up the round, then everyone picks a team and a species. */
export class JoinScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private team = '';
  /** The round chosen on this screen (only when this client is the first rider). */
  private setup: RoundSettings | undefined;

  constructor() {
    super('join');
  }

  create(data: { message?: string }): void {
    this.objects = [];
    this.setup = undefined;
    this.cameras.main.setBackgroundColor('#10140c');
    // The canvas hides the OS cursor (the game draws a reticle); menus show a claw instead.
    this.input.setDefaultCursor(clawCursor());
    this.title(data.message ?? 'CONNECTING...');
    fetch('/api/lobby')
      .then((r) => r.json() as Promise<LobbyInfo>)
      .then((lobby) => this.teamStep(lobby, data.message))
      .catch(() => this.title('GAME SERVER UNREACHABLE - CLICK TO RETRY', () => this.scene.restart({})));
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.input.keyboard!.removeAllListeners();
  }

  private title(sub: string, onClick?: () => void): void {
    this.clear();
    const cam = this.cameras.main;
    this.objects.push(pixelText(this, Math.round(cam.width / 2), 40, 'DINORIDERS', 0xffe066).setOrigin(0.5).setScale(3));
    const s = pixelText(this, Math.round(cam.width / 2), 70, sub).setOrigin(0.5);
    this.objects.push(s);
    if (onClick) this.input.once('pointerdown', onClick);
  }

  private menu(heading: string, options: Option[], footer = ''): void {
    const cam = this.cameras.main;
    this.objects.push(pixelText(this, Math.round(cam.width / 2), 92, heading, 0xc8b48a).setOrigin(0.5));
    options.forEach((o, i) => {
      const t = pixelText(this, Math.round(cam.width / 2), 112 + i * 16, `${i + 1}  ${o.label}`, o.enabled ? o.tint : 0x5a5a5a).setOrigin(0.5);
      if (o.enabled) {
        t.setInteractive({ cursor: clawCursor(true) });
        t.on('pointerover', () => t.setScale(1.15));
        t.on('pointerout', () => t.setScale(1));
        t.on('pointerdown', o.pick);
        this.input.keyboard!.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][i]}`, o.pick);
      }
      this.objects.push(t);
    });
    if (footer) this.objects.push(pixelText(this, Math.round(cam.width / 2), 120 + options.length * 16, footer, 0x8a8a7a).setOrigin(0.5));
  }

  private teamStep(lobby: LobbyInfo, message?: string): void {
    if (lobby.setup === null && !this.setup) return this.setupTeamsStep(lobby);
    this.title(message ?? `${lobby.players} RIDER${lobby.players === 1 ? '' : 'S'} IN THE WORLD`);
    if (!lobby.canJoin) {
      this.title('THE WORLD IS FULL - CLICK TO RETRY', () => this.scene.restart({}));
      return;
    }
    const round = lobby.setup;
    const mapName = round?.map === RANDOM_MAP ? 'RANDOM' : (lobby.maps.find((m) => m.id === round?.map)?.name ?? 'RANDOM');
    const options: Option[] = lobby.teams.map((t) => ({
      label: t.eliminated ? `TEAM ${t.name} - OUT` : `JOIN TEAM ${t.name} (${t.players})`,
      tint: TEAM_COLORS[t.slot],
      enabled: !t.eliminated,
      pick: () => this.speciesStep(lobby, t.id),
    }));
    this.menu('CHOOSE YOUR TEAM', options, `MAP: ${mapName}  TEAMS: ${lobby.teams.length}`);
  }

  private setupTeamsStep(lobby: LobbyInfo): void {
    this.title('YOU ARE THE FIRST RIDER - SET UP THE WORLD');
    this.menu(
      'HOW MANY TEAMS?',
      [2, 3, 4].map((n) => ({ label: `${n} TEAMS`, tint: 0xf4f0e0, enabled: true, pick: () => this.setupMapStep(lobby, n) })),
    );
  }

  private setupMapStep(lobby: LobbyInfo, n: number): void {
    this.title('YOU ARE THE FIRST RIDER - SET UP THE WORLD');
    const maps = mapsFor(n);
    this.menu(
      'CHOOSE A MAP',
      maps.map((m) => ({
        label: m.name,
        tint: 0xf4f0e0,
        enabled: true,
        pick: () => {
          this.setup = { teams: n, map: m.id };
          const teams: TeamInfo[] = Array.from({ length: n }, (_, slot) => ({ id: `team${slot}`, slot, name: TEAM_NAMES[slot], base: { x: 0, y: 0 }, players: 0, eliminated: false }));
          this.teamStep({ ...lobby, setup: this.setup, teams });
        },
      })),
    );
  }

  private speciesStep(lobby: LobbyInfo, team: string): void {
    this.team = team;
    this.title('CHOOSE YOUR MOUNT');
    const options: Option[] = lobby.species.map((s) => ({
      label: speciesLabel(s),
      tint: 0xf4f0e0,
      enabled: true,
      pick: () => this.scene.start('game', { join: { team: this.team, kind: s.kind, ...(this.setup ? { setup: this.setup } : {}) } }),
    }));
    this.menu('W/S MOVE  A/D TURN  MOUSE AIM  CLICK FIRE  R-CLICK ABILITY  TAB SCORES', options);
  }
}
