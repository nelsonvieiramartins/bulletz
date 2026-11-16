import movement from "../../../../../effects/spritefusion/movement.js";
import { bridge } from "./_sf.js";

export const meta = {
  name: "Dash (Sprite Fusion)",
  desc: "Investida oficial do Sprite Fusion: rastro de vento e poeira atrás de quem corre, com impulso na saída e derrapada na chegada.",
  tags: ["sprite fusion", "movement", "dash", "one-shot"],
  size: [240, 100],
  origin: [30, 80],
  duration: 1.2,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { facing: 1, distance: 260, seed: 1 },
};
const b = bridge((o) => movement({ kind: "dash", x: (o.x ?? 0) * 2, y: (o.y ?? 0) * 2, ground: (o.y ?? 0) * 2, facing: o.facing, distance: o.distance, seed: o.seed }));
export const create = b.create;
