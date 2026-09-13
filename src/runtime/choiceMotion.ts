/** 朝远离指针的方向小幅挪动，点击区域始终留在原处。 */
export function evasiveOffset(dx: number, dy: number, random = Math.random) {
  const angle = Math.atan2(dy, dx) + (random() - .5) * .7;
  return { x: -Math.cos(angle) * (24 + random() * 12), y: -Math.sin(angle) * (10 + random() * 6) };
}

export const CHOICE_SETTLE_MS = { warm: 420, resolute: 360, hesitant: 460, guarded: 400, bashful: 640, breezy: 500 } as const;
