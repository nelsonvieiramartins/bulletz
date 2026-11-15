// Lê assets/sprite-config.json (editado em sprites.html) e aplica por cima dos valores padrão do jogo.
// Os "canos" são a saída do tiro em unidades do jogo, relativas ao ponto de ancoragem de cada sprite.
// Se o arquivo faltar ou estiver quebrado, o jogo segue com os valores que já estão no game.js.

const finite = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 500
const isPoint = (p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1])

/**
 * alvos: { runFire: [[x,y]...], idleFire: [x,y], crouch: [x,y], jump: [[x,y],[x,y]], patrol: [x,y], boss: [[x,y]...] }
 * Os arrays do jogo são alterados no lugar, então quem já guardou a referência enxerga os novos valores.
 */
export async function applySpriteConfig(alvos) {
  let cfg
  try {
    const response = await fetch('assets/sprite-config.json?t=' + Date.now(), { cache: 'no-store' })
    if (!response.ok) return
    cfg = (await response.json()).canos
  } catch (error) {
    console.warn('sprite-config.json não carregado; usando os valores padrão.', error)
    return
  }
  if (!cfg) return
  const set = (alvo, ponto) => { if (isPoint(ponto)) alvo.splice(0, 2, ponto[0], ponto[1]) }
  const lista = (alvo, pontos, de = 0) => {
    if (!Array.isArray(pontos)) return
    pontos.forEach((p, i) => { if (isPoint(p) && alvo[i - de] && i >= de) set(alvo[i - de], p) })
  }
  lista(alvos.runFire, cfg.runFire)
  set(alvos.idleFire, cfg.idleFire?.[0])
  set(alvos.crouch, cfg.crouch?.[2])
  lista(alvos.jump, cfg.jump, 2)       // quadros 3 e 4 da folha do pulo: subindo e descendo
  set(alvos.patrol, cfg.patrol?.[0])
  lista(alvos.boss, cfg.boss)
}
