import embers from "../../../../../effects/spritefusion/embers.js";
import { bridge } from "./_sf.js";

export const meta = {
  name: "Embers (Sprite Fusion)",
  desc: "Brasas e cinzas oficiais do Sprite Fusion: faíscas e cinzas sobem tremendo com o vento. Bom para ambiente de fase em chamas (camada à frente do cenário).",
  tags: ["sprite fusion", "embers", "ambient", "fire", "ash", "loop"],
  size: [200, 150],
  origin: [100, 135],
  duration: 6,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { density: 1, seed: 1 },
};
const b = bridge((o) => embers({ area: { x: (o.x ?? 0) * 2 - 170, y: (o.y ?? 0) * 2 - 240, w: 340, h: 240 }, density: o.density, seed: o.seed }));
export const create = b.create;
