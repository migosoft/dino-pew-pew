import type { AiState, Dino, GameState, InputCommand } from './types';
import { getDino } from './defs/dinos';
import { getWeapon } from './defs/weapons';
import { DEG, angleDiff, angleTo, clamp } from './math';
import { rand, randRange } from './rng';
import { getPlayer, isFree } from './world';
import { mountCoverage, mountFrame } from './systems/aiming';

export function makeAiState(state: GameState): AiState {
  return {
    mode: 'approach',
    timer: 0,
    sideDir: rand(state.rng) < 0.5 ? -1 : 1,
    stuckTime: 0,
    aimOffset: { x: 0, y: 0 },
    aimTimer: 0,
    preferredRange: randRange(state.rng, 110, 170),
  };
}

const PROBE_ANGLES = [0, 30, -30, 60, -60, 95, -95].map((a) => a * DEG);

/** Pick a heading near `desired` that is not blocked a short distance ahead. */
function clearHeading(state: GameState, d: Dino, desired: number, sideBias: number): number {
  const r = getDino(d.kind).radius;
  for (const a of PROBE_ANGLES) {
    const h = desired + a * sideBias;
    let clear = true;
    for (const dist of [18, 36]) {
      if (!isFree(state.world, d.x + Math.cos(h) * dist, d.y + Math.sin(h) * dist, r * 0.9)) {
        clear = false;
        break;
      }
    }
    if (clear) return h;
  }
  return desired + Math.PI * 0.5 * sideBias;
}

function steerTo(d: Dino, heading: number): number {
  return clamp(angleDiff(heading, d.heading) * 2.5, -1, 1);
}

/**
 * Produce the same kind of command a human player would. The AI points its body so
 * that one of its mounts' firing arcs covers the target — so a broadside dino would
 * naturally fight side-on, while a Triceratops faces its prey.
 */
export function computeAiCommand(state: GameState, d: Dino, dt: number): InputCommand {
  const ai = d.ai!;
  const target = getPlayer(state);
  const idle: InputCommand = { throttle: 0, turn: 0, aimWorld: { x: d.x + Math.cos(d.heading) * 50, y: d.y + Math.sin(d.heading) * 50 }, fire: false };
  if (!target || !target.alive) return idle;

  const def = getDino(d.kind);
  const dist = Math.hypot(target.x - d.x, target.y - d.y);
  const toTarget = angleTo(d, target);

  // Wobbly aim that gets re-rolled now and then, so AI shots are not laser-perfect.
  ai.aimTimer -= dt;
  if (ai.aimTimer <= 0) {
    ai.aimTimer = randRange(state.rng, 0.4, 0.9);
    ai.aimOffset = { x: randRange(state.rng, -14, 14), y: randRange(state.rng, -14, 14) };
  }
  const weapon = getWeapon(def.mounts[0].weapon);
  const lead = dist / weapon.projectileSpeed;
  const aimWorld = {
    x: target.x + Math.cos(target.heading) * target.speed * lead + ai.aimOffset.x,
    y: target.y + Math.sin(target.heading) * target.speed * lead + ai.aimOffset.y,
  };

  // Body heading that best lines up some mount with the target.
  let bestHeading = toTarget;
  let bestTurn = Infinity;
  for (let i = 0; i < def.mounts.length; i++) {
    const cov = mountCoverage(d, def, i);
    const local = cov.center - d.heading;
    const h = toTarget - local;
    const turn = Math.abs(angleDiff(h, d.heading));
    if (turn < bestTurn) {
      bestTurn = turn;
      bestHeading = h;
    }
  }

  // Stuck detection: driving forward but barely moving.
  if (ai.mode === 'approach' && Math.abs(d.speed) < 8) ai.stuckTime += dt;
  else ai.stuckTime = 0;
  if (ai.stuckTime > 0.7) {
    ai.mode = 'sidestep';
    ai.timer = 0.8;
    ai.sideDir = -ai.sideDir;
    ai.stuckTime = 0;
  }

  let throttle = 0;
  let turn = 0;
  if (ai.mode === 'sidestep') {
    ai.timer -= dt;
    throttle = -0.8;
    turn = ai.sideDir;
    if (ai.timer <= 0) ai.mode = 'approach';
  } else if (dist > ai.preferredRange + 40) {
    ai.mode = 'approach';
    const h = clearHeading(state, d, toTarget, ai.sideDir);
    turn = steerTo(d, h);
    throttle = Math.abs(angleDiff(h, d.heading)) < 70 * DEG ? 1 : 0.35;
  } else {
    ai.mode = 'engage';
    turn = steerTo(d, bestHeading);
    if (dist < ai.preferredRange - 50) throttle = -0.6;
    else if (dist > ai.preferredRange) throttle = 0.5;
    else throttle = 0.15;
  }

  // Only pull the trigger when a barrel is actually roughly on target and in range.
  let fire = false;
  if (dist < weapon.range * 0.95) {
    for (let i = 0; i < def.mounts.length; i++) {
      const f = mountFrame(d, def, i);
      if (Math.abs(angleDiff(angleTo(f, aimWorld), f.angle)) < 12 * DEG) fire = true;
    }
  }

  return { throttle, turn, aimWorld, fire };
}
