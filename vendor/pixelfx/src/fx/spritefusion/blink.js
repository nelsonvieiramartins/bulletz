import movement from "../../../../../effects/spritefusion/movement.js";
import { bridge } from "./_sf.js";

export const meta = {
  name: "Blink (Sprite Fusion)",
  desc: "Teletransporte oficial do Sprite Fusion: some num clarão de partículas e reaparece mais à frente. Com um personagem (actor.silhouette) a silhueta se desfaz e se refaz.",
  tags: ["sprite fusion", "movement", "blink", "one-shot"],
  size: [240, 100],
  origin: [30, 80],
  duration: 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { facing: 1, distance: 260, seed: 1 },
};
const b = bridge((o) => movement({ kind: "blink", x: (o.x ?? 0) * 2, y: (o.y ?? 0) * 2, ground: (o.y ?? 0) * 2, facing: o.facing, distance: o.distance, seed: o.seed }));
export const create = b.create;
