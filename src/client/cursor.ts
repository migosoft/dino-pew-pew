import { drawClawCursor } from './render/textures/worldArt';

const cache = new Map<boolean, string>();

/** CSS cursor value for the dino-claw pointer (hotspot at the front talon's tip). */
export function clawCursor(hover = false): string {
  let css = cache.get(hover);
  if (!css) {
    css = `url(${drawClawCursor(hover).toDataURL()}) 2 2, auto`;
    cache.set(hover, css);
  }
  return css;
}
