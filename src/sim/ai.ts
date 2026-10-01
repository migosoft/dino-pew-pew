import type { Dino, DinoDef, FoodSource, GameState, InputCommand, Vec2, WildAi } from './types';
import { WILD_TEAM } from './types';
import { getDino } from './defs/dinos';
import { DEG, angleDiff, angleTo, clamp } from './math';
import { rand, randRange } from './rng';
import { findDino, isFree } from './world';
import { BASE_RADIUS, isInOwnBase } from './players';
import { canEat } from './systems/feeding';
import { isHostile } from './systems/melee';

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

/** A heading near `desired` that is not blocked a short distance ahead. */
function clearHeading(state: GameState, d: Dino, desired: number, sideBias: number): number {
  const r = getDino(d.kind).radius;
  for (const a of PROBE_ANGLES) {
    const h = desired + a * sideBias;
    if ([16, 32].every((dist) => isFree(state.world, d.x + Math.cos(h) * dist, d.y + Math.sin(h) * dist, r * 0.9))) return h;
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
  for (const f of state.food) {
    if (f.food < 5 || !canEat(def, f.kind)) continue;
    const dd = (f.x - d.x) ** 2 + (f.y - d.y) ** 2;
    if (dd < bestD) {
      best = f;
      bestD = dd;
    }
  }
  return best;
}

/** Nearest prey for a wild carnivore: riders outside their camp, or wild herbivores. */
function findPrey(state: GameState, d: Dino): Dino | undefined {
  let best: Dino | undefined;
  let bestD = HUNT_RANGE * HUNT_RANGE;
  for (const o of state.dinos) {
    if (o === d || !o.alive || !isHostile(d, o) || isInOwnBase(state, o)) continue;
    // Wild carnivores only take on wild herbivores no bigger than themselves.
    if (o.team === WILD_TEAM && getDino(o.kind).size === 'large' && getDino(d.kind).size === 'small') continue;
    const dd = (o.x - d.x) ** 2 + (o.y - d.y) ** 2;
    if (dd < bestD) {
      best = o;
      bestD = dd;
    }
  }
  return best;
}

/** Approach the point and stop on it (for eating). */
function goTo(state: GameState, d: Dino, p: Vec2, stopAt: number): InputCommand {
  const dist = Math.hypot(p.x - d.x, p.y - d.y);
  if (dist <= stopAt) return stand(p);
  return drive(state, d, angleTo(d, p), dist < 40 ? 0.4 : 0.8, p);
}

export function computeWildCommand(state: GameState, d: Dino, dt: number): InputCommand {
  const ai = d.ai!;
  const def = getDino(d.kind);
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
      return drive(state, d, angleTo(d, target), 1, target);
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
