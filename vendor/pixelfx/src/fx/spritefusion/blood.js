import blood from "../../../../../effects/spritefusion/blood.js";
import { bridge } from "./_sf.js";

export const meta = {
  name: "Blood hit (Sprite Fusion)",
  desc: "Golpe sangrento oficial do Sprite Fusion: jato de gotas em leque, névoa vermelha e manchas que ficam no chão e secam. Sem cortes: use `angle` para a direção do golpe.",
  tags: ["sprite fusion", "blood", "hit", "gore", "one-shot"],
  size: [180, 100],
  origin: [90, 80],
  duration: 3,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { angle: 3.45, amount: 1, size: 1, stainLife: 6, seed: 1 },
};
const b = bridge((o) => blood({ x: (o.x ?? 0) * 2, y: (o.y ?? 0) * 2 - 44, ground: (o.y ?? 0) * 2, angle: o.angle, amount: o.amount, size: o.size, stainLife: o.stainLife, seed: o.seed }));
export const create = b.create;
