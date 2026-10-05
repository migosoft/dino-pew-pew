import type { GameEvent } from '../../sim/types';
import { CAMP } from '../../sim/camp';
import type { RoundInfo, StructureInfo, TeamInfo } from '../../net/protocol';

/** The zone line under the health bar: shown while the rider is inside their own camp. */
export function zoneLine(inCamp: boolean, hurt: boolean): string {
  return inCamp ? `YOUR CAMP - E: SHOP${hurt ? '  HEALING' : ''}` : '';
}

export interface CampStatus {
  team: string;
  slot: number;
  name: string;
  eliminated: boolean;
  /** Camp hit points, 0..1. */
  hpFrac: number;
  /** One entry per tower slot: standing (true) or rubble (false). */
  towers: boolean[];
  field: boolean;
}

/** One entry per team, sorted by slot, read from the camp and tower structures. */
export function campStatus(structures: StructureInfo[], teams: TeamInfo[]): CampStatus[] {
  return [...teams]
    .sort((a, b) => a.slot - b.slot)
    .map((t) => {
      const camp = structures.find((s) => s.kind === 'camp' && s.team === t.id);
      const towers = structures.filter((s) => s.kind === 'tower' && s.team === t.id).sort((a, b) => a.id - b.id);
      return {
        team: t.id,
        slot: t.slot,
        name: t.name,
        eliminated: t.eliminated,
        hpFrac: camp && camp.maxHp > 0 ? Math.max(0, camp.hp / camp.maxHp) : 0,
        towers: Array.from({ length: CAMP.towers }, (_, i) => (towers[i]?.hp ?? 0) > 0),
        field: !!camp && camp.field,
      };
    });
}

export interface BannerInput {
  round: RoundInfo;
  teams: TeamInfo[];
  meTeam: string | undefined;
  /** The rider has no dino right now. */
  dead: boolean;
  respawn: number;
  spectating: boolean;
}

export interface Banner {
  text: string;
  sub: string;
  /** Team whose colour the text takes (the round winner), if any. */
  winner: string | null;
}

/** Centre-screen text. Precedence: own camp fallen, then respawn countdown, then the round banner. */
export function bannerFor(b: BannerInput): Banner {
  const r = b.round;
  const out = (text: string, sub = '', winner: string | null = null): Banner => ({ text, sub, winner });
  const fallen = !!b.meTeam && !!b.teams.find((t) => t.id === b.meTeam)?.eliminated;
  if (fallen && r.phase !== 'over' && !b.spectating) return out('YOUR CAMP HAS FALLEN');
  if (b.dead && !fallen) return out(`RESPAWN IN ${Math.max(1, Math.ceil(b.respawn))}`);
  switch (r.phase) {
    case 'waiting':
      return out('WAITING FOR RIDERS', 'EVERY TEAM NEEDS A RIDER - CAMPS ARE PROTECTED');
    case 'countdown':
      return out(`ROUND STARTS IN ${r.timer}`);
    case 'over': {
      const w = b.teams.find((t) => t.id === r.winner);
      return out(w ? `TEAM ${w.name} WINS` : 'DRAW', `NEXT ROUND IN ${r.timer}`, w ? w.id : null);
    }
    default:
      return out('');
  }
}

/** Feed line for a camp event (null: nothing to show). `killer` is the name of the rider the event credits. */
export function eventLine(e: GameEvent, killer: string | undefined, teams: TeamInfo[]): { text: string; team: string } | null {
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? '?';
  switch (e.type) {
    case 'towerDown':
      return { text: `${killer ?? 'SOMEONE'} DESTROYED A ${name(e.team)} TOWER`, team: e.team };
    case 'towerUp':
      return { text: `${name(e.team)} TOWER REBUILT`, team: e.team };
    case 'campDown':
      return { text: `${name(e.team)} CAMP ${e.by === null ? 'ABANDONED' : 'DESTROYED'}`, team: e.team };
    case 'eliminated':
      return { text: `TEAM ${name(e.team)} IS OUT`, team: e.team };
    default:
      return null;
  }
}
