import Phaser from 'phaser';
import type { InputCommand } from '../../sim/types';

/** Keyboard steers the dino (W/S throttle, A/D turn); the mouse aims and fires. */
export class PlayerInput {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    scene.input.mouse?.disableContextMenu();
  }

  /** Current aim point in world space. */
  aimWorld(): { x: number; y: number } {
    const p = this.scene.input.activePointer;
    const cam = this.scene.cameras.main;
    const w = cam.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  }

  command(): InputCommand {
    const k = this.keys;
    const throttle = (k.W.isDown || k.UP.isDown ? 1 : 0) - (k.S.isDown || k.DOWN.isDown ? 1 : 0);
    const turn = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const fire = this.scene.input.activePointer.leftButtonDown() || k.SPACE.isDown;
    return { throttle, turn, aimWorld: this.aimWorld(), fire };
  }
}
