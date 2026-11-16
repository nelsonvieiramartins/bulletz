import sparkle from "../../../../../effects/spritefusion/sparkle.js";
import { bridge } from "./_sf.js";

export const meta = {
  name: "Sparkle (Sprite Fusion)",
  desc: "Brilho mágico oficial do Sprite Fusion: uma estrela de quatro pontas que pulsa, com faíscas quentes e frias ao redor e partículas flutuando.",
  tags: ["sprite fusion", "sparkle", "magic", "pickup", "glow", "one-shot"],
  size: [120, 100],
  origin: [60, 50],
  duration: 2.6,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { size: 19, flares: 11, seed: 1 },
};
const b = bridge((o) => sparkle({ x: (o.x ?? 0) * 2, y: (o.y ?? 0) * 2, size: o.size, flares: o.flares, seed: o.seed }));
export const create = b.create;
