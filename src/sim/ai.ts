import type { Dino, DinoDef, FoodSource, GameState, InputCommand, Vec2, WildAi } from './types';
import { WILD_TEAM } from './types';
import { getDino } from './defs/dinos';
import { DEG, angleDiff, angleTo, clamp } from './math';
import { rand, randRange } from './rng';
import { findDino, isAirborne, isDeepWater, isFree, isRiver } from './world';
import { BASE_RADIUS, isInOwnBase } from './players';
import { canEat } from './systems/feeding';
import { isHostile } from './systems/melee';
import { dinosNear, foodNear, maxDinoRadius } from './spatial';

const near: number[] = [];
const nearFood: number[] = [];

// Behaviour of riderless wild dinosaurs. Like a player, the AI only produces an
// InputCommand; movement, eating and melee are the normal systems.

/** Seconds a provoked herbivore keeps fleeing/charging after the last hit. */
export const PROVOKED_TIME = 6;
/** Wild carnivores notice prey within this distance. */
export const HUNT_RANGE = 180;
/** ...and give up the chase beyond this. */
const GIVE_UP_RANGE = 320;
const FORAGE_RANGE = 300;
const WANDER_THROTTLE = 0.35;
/** Per-tick chance that a wild dino uses its ready ability on a target in range (about once a second). */
const ABILITY_CHANCE = 0.015;
/** Dash only at a target roughly straight ahead; a leap can be aimed a bit more freely. */
const DASH_ABILITY_ARC = 20 * DEG;
const LEAP_ABILITY_ARC = 60 * DEG;
const BITE_ABILITY_ARC = 25 * DEG;

export function makeWildAi(state: GameState): WildAi {
  return {
    mode: 'wander',
    target: null,
    timer: randRange(state.rng, 1, 4),
    wanderHeading: rand(state.rng) * Math.PI * 2,
    sideDir: rand(state.rng) < 0.5 ? -1 : 1,
    stuckTime: 0,
  };
}

const PROBE_ANGLES = [0, 30, -30, 60, -60, 95, -95, 140, -140].map((a) => a * DEG);

/**
 * A heading near `desired` that is not blocked a short distance ahead. Calm dinos also keep
 * out of deep water if they can (and out of rivers, if the current would sweep them away);
 * hunting, charging and fleeing ones wade straight in.
 */
function clearHeading(state: GameState, d: Dino, desired: number, sideBias: number): number {
  const ai = d.ai!;
  const def = getDino(d.kind);
  const r = def.radius;
  const swept = (def.currentDrift ?? 0) > 0;
  const wet = (x: number, y: number) => isDeepWater(state.world, x, y) || (swept && isRiver(state.world, x, y));
  const open = (h: number) => [16, 32].every((dist) => isFree(state.world, d.x + Math.cos(h) * dist, d.y + Math.sin(h) * dist, r * 0.9));
  const dry = (h: number) => [24, 48].every((dist) => !wet(d.x + Math.cos(h) * dist, d.y + Math.sin(h) * dist));
  if ((ai.mode === 'wander' || ai.mode === 'graze') && !wet(d.x, d.y)) {
    for (const a of PROBE_ANGLES) {
      const h = desired + a * sideBias;
      if (!open(h) || !dry(h)) continue;
      // Keep the detour around a lake as the new wander direction, so it doesn't turn back into it.
      if (ai.mode === 'wander') ai.wanderHeading = h;
      return h;
    }
  }
  for (const a of PROBE_ANGLES) {
    const h = desired + a * sideBias;
    if (open(h)) return h;
  }
  return desired + Math.PI * sideBias;
}

/** Steer from base camps: wild animals keep out of the riders' camps. */
function avoidBases(state: GameState, d: Dino, desired: number): number {
  for (const t of state.teams) {
    const dist = Math.hypot(d.x - t.base.x, d.y - t.base.y);
    if (dist < BASE_RADIUS + 50) return angleTo(t.base, d);
  }
  return desired;
}

function drive(state: GameState, d: Dino, heading: number, throttle: number, look: Vec2): InputCommand {
  const ai = d.ai!;
  const h = clearHeading(state, d, avoidBases(state, d, heading), ai.sideDir);
  const turnErr = angleDiff(h, d.heading);
  return {
    throttle: Math.abs(turnErr) > 100 * DEG ? throttle * 0.3 : throttle,
    turn: clamp(turnErr * 2.5, -1, 1),
    aimWorld: look,
    fire: false,
  };
}

function stand(look: Vec2): InputCommand {
  return { throttle: 0, turn: 0, aimWorld: look, fire: false };
}

function ahead(d: Dino, dist = 40): Vec2 {
  return { x: d.x + Math.cos(d.heading) * dist, y: d.y + Math.sin(d.heading) * dist };
}

function nearestFood(state: GameState, d: Dino, def: DinoDef, range: number): FoodSource | undefined {
  let best: FoodSource | undefined;
  let bestD = range * range;
  let bestI = -1;
  for (const i of foodNear(state, d.x, d.y, range, nearFood)) {
    const f = state.food[i];
    if (f.food < 5 || !canEat(def, f.kind)) continue;
    const dd = (f.x - d.x) ** 2 + (f.y - d.y) ** 2;
    if (dd < bestD || (dd === bestD && i < bestI)) {
      best = f;
      bestD = dd;
      bestI = i;
    }
  }
  return best;
}

/** Nearest prey for a wild carnivore: riders outside their camp, or wild herbivores. */
function findPrey(state: GameState, d: Dino): Dino | undefined {
  let best: Dino | undefined;
  let bestD = HUNT_RANGE * HUNT_RANGE;
  for (const j of dinosNear(state, d.x, d.y, HUNT_RANGE, near)) {
    const o = state.dinos[j];
    if (o === d || !o.alive) continue;
    const dd = (o.x - d.x) ** 2 + (o.y - d.y) ** 2;
    if (dd >= bestD || !isHostile(d, o) || isInOwnBase(state, o)) continue;
    // Wild carnivores only take on wild herbivores no bigger than themselves.
    if (o.team === WILD_TEAM && getDino(o.kind).size === 'large' && getDino(d.kind).size === 'small') continue;
    best = o;
    bestD = dd;
  }
  return best;
}

/**
 * A tail-whipping dino sometimes sweeps its tail at a hostile right behind it (a raptor
 * biting its tail, a rider sneaking up), whatever it is doing.
 */
function wantsWhip(state: GameState, d: Dino, def: DinoDef): boolean {
  const ab = def.ability;
  if (ab?.kind !== 'whip' || d.abilityCooldown > 0 || d.abilityT >= 0) return false;
  const back = d.heading + Math.PI;
  const behind = dinosNear(state, d.x, d.y, def.radius + maxDinoRadius() + ab.hitReach, near).some((j) => {
    const o = state.dinos[j];
    if (o === d || !o.alive) return false;
    const reach = def.radius + getDino(o.kind).radius + ab.hitReach - 4;
    if ((o.x - d.x) ** 2 + (o.y - d.y) ** 2 > reach * reach) return false;
    if (isAirborne(o) || !isHostile(d, o) || isInOwnBase(state, o)) return false;
    return Math.abs(angleDiff(angleTo(d, o), back)) < (ab.arc ?? Math.PI / 2) * 0.8;
  });
  return behind && rand(state.rng) < ABILITY_CHANCE * 4;
}

/** Sometimes pounce (leap), charge (dash) or lunge and bite at a chased target that is in range and ahead. */
function wantsAbility(state: GameState, d: Dino, def: DinoDef, target: Dino): boolean {
  const ab = def.ability;
  if (!ab || ab.kind === 'whip' || d.abilityCooldown > 0 || d.abilityT >= 0) return false;
  const dist = Math.hypot(target.x - d.x, target.y - d.y);
  const [lo, hi, arc] =
    ab.kind === 'leap'
      ? [40, ab.maxRange ?? 0, LEAP_ABILITY_ARC]
      : ab.kind === 'bite'
        ? [0, (def.head?.offset.x ?? def.radius) + getDino(target.kind).radius + ab.hitReach + 8, BITE_ABILITY_ARC]
        : [30, 130, DASH_ABILITY_ARC];
  if (dist < lo || dist > hi || Math.abs(angleDiff(angleTo(d, target), d.heading)) > arc) return false;
  return rand(state.rng) < ABILITY_CHANCE;
}

/** Approach the point and stop on it (for eating). */
function goTo(state: GameState, d: Dino, p: Vec2, stopAt: number): InputCommand {
  const dist = Math.hypot(p.x - d.x, p.y - d.y);
  if (dist <= stopAt) return stand(p);
  return drive(state, d, angleTo(d, p), dist < 40 ? 0.4 : 0.8, p);
}

export function computeWildCommand(state: GameState, d: Dino, dt: number): InputCommand {
  const def = getDino(d.kind);
  const cmd = decide(state, d, def, dt);
  if (!cmd.ability && wantsWhip(state, d, def)) cmd.ability = true;
  return cmd;
}

function decide(state: GameState, d: Dino, def: DinoDef, dt: number): InputCommand {
  const ai = d.ai!;
  ai.timer -= dt;

  // Unstick: if pushing against something, back off and turn.
  if ((ai.mode === 'wander' || ai.mode === 'hunt' || ai.mode === 'charge' || ai.mode === 'flee') && Math.abs(d.speed) < 4) ai.stuckTime += dt;
  else ai.stuckTime = 0;
  if (ai.stuckTime > 0.8) {
    ai.stuckTime = 0;
    ai.sideDir = -ai.sideDir;
    ai.wanderHeading = d.heading + Math.PI * 0.6 * ai.sideDir;
  }

  // Reacting to being attacked.
  const attacker = d.lastAttacker !== null ? findDino(state, d.lastAttacker) : undefined;
  if (attacker?.alive && d.sinceHit < PROVOKED_TIME) {
    const lowHp = d.hp < d.maxHp * 0.3;
    if (def.diet !== 'herbivore' || (def.size === 'large' && !lowHp)) {
      ai.mode = def.diet === 'herbivore' ? 'charge' : 'hunt';
      ai.target = attacker.id;
    } else {
      ai.mode = 'flee';
      ai.target = attacker.id;
    }
  } else if (ai.mode === 'flee' || ai.mode === 'charge') {
    ai.mode = 'wander';
    ai.target = null;
  }

  const target = ai.target !== null ? findDino(state, ai.target) : undefined;
  switch (ai.mode) {
    case 'flee':
      if (target) return drive(state, d, angleTo(target, d), 1, ahead(d));
      break;
    case 'charge':
    case 'hunt': {
      if (!target || !target.alive || isInOwnBase(state, target) || Math.hypot(target.x - d.x, target.y - d.y) > GIVE_UP_RANGE) {
        ai.mode = 'wander';
        ai.target = null;
        break;
      }
      const cmd = drive(state, d, angleTo(d, target), 1, target);
      cmd.ability = wantsAbility(state, d, def, target);
      return cmd;
    }
    case 'forage': {
      const food = nearestFood(state, d, def, FORAGE_RANGE);
      if (!food || d.hp >= d.maxHp * 0.95) {
        ai.mode = 'wander';
        break;
      }
      return goTo(state, d, food, food.reach + def.radius - 2);
    }
    case 'graze': {
      const food = nearestFood(state, d, def, 60);
      if (!food || ai.timer <= 0) {
        ai.mode = 'wander';
        ai.timer = randRange(state.rng, 3, 7);
        break;
      }
      return goTo(state, d, food, food.reach + def.radius - 2);
    }
  }

  // Calm decisions.
  if (def.diet !== 'herbivore') {
    const prey = findPrey(state, d);
    if (prey && d.hp > d.maxHp * 0.4) {
      ai.mode = 'hunt';
      ai.target = prey.id;
      return drive(state, d, angleTo(d, prey), 1, prey);
    }
  }
  if (d.hp < d.maxHp * (def.diet === 'carnivore' ? 0.6 : 0.8) && nearestFood(state, d, def, FORAGE_RANGE)) {
    ai.mode = 'forage';
    return stand(ahead(d));
  }
  if (ai.timer <= 0) {
    ai.timer = randRange(state.rng, 3, 7);
    if (def.diet !== 'carnivore' && rand(state.rng) < 0.45 && nearestFood(state, d, def, 60)) {
      ai.mode = 'graze';
      ai.timer = randRange(state.rng, 3, 6);
    } else {
      ai.wanderHeading += randRange(state.rng, -1.4, 1.4);
    }
  }
  ai.mode = ai.mode === 'graze' ? 'graze' : 'wander';
  // Stay away from the map edge.
  const m = 160;
  const { width, height } = state.world;
  if (d.x < m || d.y < m || d.x > width - m || d.y > height - m) ai.wanderHeading = angleTo(d, { x: width / 2, y: height / 2 });
  return drive(state, d, ai.wanderHeading, def.diet === 'carnivore' ? WANDER_THROTTLE + 0.1 : WANDER_THROTTLE, ahead(d));
}
