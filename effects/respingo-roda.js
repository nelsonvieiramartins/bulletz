// Respingo da roda sobre a água (Fase 2.1): a roda joga para trás e para cima um leque de gotas e névoa, e um pouco de água para a frente.
// Feito com os blocos da biblioteca pixelfx (MIT, vendor/pixelfx): gotas com cauda (bead), partículas em ciclo (cycle) e névoa em discos, na
// mesma linguagem do spray do water-jet. O ponto de origem é o chão sob a roda (a água fica em y = 0); o traseiro do caminhão é à esquerda.
import { fit, cycle, WHITE } from "../vendor/pixelfx/src/core/index.js";
import { WATER, bead } from "../vendor/pixelfx/src/fx/water/_lib.js";

export const meta = {
  name: "Respingo de roda",
  desc: "Uma roda passando pela água: um leque de gotas e névoa jogado para trás e para cima, e um pouco de água para a frente, com brilho no contato.",
  tags: ["water", "wheel", "spray", "rain", "road", "loop"],
  size: [140, 70],
  origin: [110, 58],
  duration: 1,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { palette: WATER, seed: 5, density: 1 },
};

const D = meta.duration, G = 560;

export function draw(p, t, o) {
  const C = fit(o.palette, 8), S = o.seed, dens = Math.max(0, Math.min(1, o.density ?? 1));
  // o leque principal: gotas jogadas para trás (esquerda) e para cima; algumas vão adiante, baixas e curtas
  cycle(t, D, 120, S, (g) => g.range(0.32, 0.65), (age, life, r) => {
    if (r.next() > dens) return;
    const fwd = r.next() < 0.22;
    const vx = fwd ? r.range(35, 110) : -r.range(50, 240), vy = -(fwd ? r.range(30, 80) : r.range(55, 150));   // baixo: o respingo fica na base do pneu
    const x = r.range(-3, 3) + vx * age, y = r.range(-2, 0) + vy * age + 0.5 * G * age * age, k = age / life;
    if (y > 1 || (k > 0.8 && r.next() < (k - 0.8) * 4)) return;
    const big = r.next();
    if (big < 0.25) p.px(x, y, k < 0.5 ? WHITE : C[6]);
    else bead(p, x, y, vx, vy + G * age, big < 0.62 ? 2 : big < 0.82 ? 3 : 1, C);
  });
  // névoa: discos suaves que sobem e se espalham para trás
  cycle(t, D, 16, S + 3, (g) => g.range(0.6, 0.95), (age, life, r) => {
    if (r.next() > dens) return;
    const k = age / life, x = -r.range(2, 12) - age * r.range(28, 70), y = -r.range(2, 8) - age * r.range(8, 22);
    const rad = r.range(4, 6) + k * r.range(7, 12), a = r.range(0.2, 0.32) * Math.min(1, k / 0.15) * Math.pow(1 - k, 1.4);
    p.disc(x, y, rad, C[6], (d) => a * (1 - d * d));
  });
  // espuma rente à água, esticada para trás da roda
  cycle(t, D, 26, S + 6, (g) => g.range(0.18, 0.4), (age, life, r) => {
    if (r.next() > dens) return;
    const x = -r.range(2, 10) - age * r.range(40, 120), k = age / life;
    p.px(x, -r.range(0, 2), k < 0.5 ? WHITE : C[6]);
  });
  // brilho no contato da roda com a água
  p.glow(-2, -3, 18, C[5], 0.4 * dens);
}
