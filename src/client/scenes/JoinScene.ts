import Phaser from 'phaser';
import { NEW_TEAM, type LobbyInfo } from '../../net/protocol';
import { pixelText } from '../render/Hud';
import { TEAM_COLORS } from '../teams';

interface Option {
  label: string;
  tint: number;
  enabled: boolean;
  pick: () => void;
}

/** Join screen: choose an existing team or found a new one, then pick a species. */
export class JoinScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private team = '';

  constructor() {
    super('join');
  }

  create(data: { message?: string }): void {
    this.objects = [];
    this.cameras.main.setBackgroundColor('#10140c');
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
        t.setInteractive({ useHandCursor: true });
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
    this.title(message ?? `${lobby.players} RIDER${lobby.players === 1 ? '' : 'S'} IN THE WORLD`);
    if (!lobby.canJoin) {
      this.title('THE WORLD IS FULL - CLICK TO RETRY', () => this.scene.restart({}));
      return;
    }
    const options: Option[] = lobby.teams.map((t) => ({
      label: `JOIN TEAM ${t.name} (${t.players})`,
      tint: TEAM_COLORS[t.slot],
      enabled: true,
      pick: () => this.speciesStep(lobby, t.id),
    }));
    options.push({ label: 'FOUND A NEW TEAM', tint: 0xf4f0e0, enabled: lobby.canCreateTeam, pick: () => this.speciesStep(lobby, NEW_TEAM) });
    this.menu('CHOOSE YOUR TEAM', options, 'CLICK OR PRESS A NUMBER');
  }

  private speciesStep(lobby: LobbyInfo, team: string): void {
    this.team = team;
    this.title('CHOOSE YOUR MOUNT');
    const options: Option[] = lobby.species.map((s) => ({
      label: `${s.kind.padEnd(12)} ${s.diet.padEnd(9)}  HP ${String(s.hp).padStart(3)}  SPEED ${String(s.speed).padStart(3)}`,
      tint: 0xf4f0e0,
      enabled: true,
      pick: () => this.scene.start('game', { team: this.team, kind: s.kind }),
    }));
    this.menu('W/S MOVE  A/D TURN  MOUSE AIM  CLICK FIRE  TAB SCORES', options);
  }
}
