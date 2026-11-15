// Efeitos visuais do jogo feitos com a biblioteca pixelfx (MIT, vendor/pixelfx):
//   - clarão, fumaça e cápsulas do cano enquanto o Edu atira (SMG burst, em loop);
//   - faísca a cada tiro que acerta um inimigo (Hit spark);
//   - estouro dourado ao pegar uma medalha (Collect burst).
// Tudo desenhado num buffer do tamanho do jogo (480x270) e colado no canvas, que já está ampliado 2x.
// Todos os efeitos do catálogo estão em efeitos.html.

import { createFrame, clearFrame, createFx, composite } from './vendor/pixelfx/src/core/index.js'
import * as hitSpark from './vendor/pixelfx/src/fx/impacts/hit-spark.js'
import * as muzzleSmg from './vendor/pixelfx/src/fx/projectiles/muzzle-smg.js'
import * as collectBurst from './vendor/pixelfx/src/fx/pickups/collect-burst.js'
import * as swordSlash from './vendor/pixelfx/src/fx/melee/sword-slash.js'
import * as thrust from './vendor/pixelfx/src/fx/melee/thrust.js'
import * as heavyCleave from './vendor/pixelfx/src/fx/melee/heavy-cleave.js'
import * as groundSlam from './vendor/pixelfx/src/fx/impacts/ground-slam.js'
import * as comboCounter from './vendor/pixelfx/src/fx/ui/combo-counter.js'
import * as shatterWipe from './vendor/pixelfx/src/fx/transitions/shatter-wipe.js'
import * as critHit from './vendor/pixelfx/src/fx/impacts/crit-hit.js'

const maxOneShots = 28
// medalha dourada em vez do rosa original do efeito
const goldPalette = ['#2a1604', '#5a3208', '#9a5a0e', '#d98a16', '#ffb938', '#ffd978', '#fff0b8', '#ffffff']
// vulto frio e prateado da faca (o padrão do efeito é dourado)
const stabPalette = ['#16202e', '#2c4160', '#4f7aa8', '#8fc4ea', '#cfe9fa', '#f0f9ff', '#ffffff']
const seed = () => Math.floor(Math.random() * 9999)

export function createGameFx(width, height) {
  const frame = createFrame(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  const image = context.createImageData(width, height)
  const oneShots = []
  let muzzle = null
  // faixa de texto (combo-counter) e transição de tela (shatter-wipe, que tem tela própria de 320x180, esticada para a do jogo)
  let banner = null, bannerTime = 0, bannerLength = 0
  const wipeFrame = createFrame(320, 180)
  const wipeCanvas = document.createElement('canvas')
  wipeCanvas.width = 320
  wipeCanvas.height = 180
  const wipeContext = wipeCanvas.getContext('2d')
  const wipeImage = wipeContext.createImageData(320, 180)
  let wipe = null
  const bannerHold = 2

  return {
    /** Faísca onde o tiro acertou. x,y = ponto do acerto; floor = pés do alvo; dx = direção do tiro (1 ou -1). */
    hit({ x, y, floor, dx }) {
      const h = Math.max(4, Math.min(60, floor - y))
      oneShots.push(createFx(hitSpark, { x, y: floor, flip: dx < 0, seed: seed(), height: h }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Corte em arco (sword-slash) na altura do chão floor; flip = virado para a esquerda. Usado no ataque especial do Fofão. */
    slash({ x, floor, flip, radius = 34 }) {
      oneShots.push(createFx(swordSlash, { x, y: floor, flip, seed: seed(), radius }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Vulto da estocada (thrust): feixe de riscos da mão até a ponta da faca. x = pés do atacante, floor = chão, lift = altura extra da faca. */
    stab({ x, floor, flip, reach = 16, lift = 0 }) {
      oneShots.push(createFx(thrust, { x, y: floor - lift, flip, seed: seed(), reach, star: 9, palette: stabPalette }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Pancada da marreta no chão (3º golpe do sword-combo = heavy-cleave, só a pancada): estrela, rachaduras, poeira e o abalo sísmico (anel de 52 unidades). */
    quake({ x, floor, flip }) {
      oneShots.push(createFx(heavyCleave, { x, y: floor, flip, seed: seed(), slamOnly: true }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Queda do Chapolim (ground-slam do ground-pound): chão racha, duas ondas correm para os lados até reach, poeira e pedras. */
    slam({ x, floor, reach = 90 }) {
      oneShots.push(createFx(groundSlam, { x, y: floor, seed: seed(), reach }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Faixa "ESTÁGIO CONCLUÍDO": entra voando, bate, fica (hold s) e sai. Dura 1,45 + hold s. */
    banner({ text = 'ESTÁGIO', label = 'CONCLUÍDO', hold = bannerHold } = {}) {
      banner = createFx(comboCounter, { x: 240, y: 135, seed: seed(), text, label, hold, light: 1,
        palette: ['#07140f', '#0c3a2a', '#12704a', '#1fb870', '#5df08d', '#b6ffc8', '#e8ffe2', '#ffffff'] })
      bannerTime = 0
      bannerLength = 1.45 + hold
    },
    get bannerActive() { return !!banner },
    /** Transição de tela que fecha (shatter-wipe): o vidro cai, trinca, estoura e os cacos caem. Dura 2,8 s. */
    startWipe() { wipe = createFx(shatterWipe, { seed: seed() }) },
    get wipeTime() { return wipe ? wipe.t : 0 },
    get wipeActive() { return !!wipe },
    stopWipe() { wipe = null },
    drawWipe(ctx, width, height) {
      if (!wipe) return
      clearFrame(wipeFrame)
      wipe.draw(wipeFrame, 'back')
      wipe.draw(wipeFrame, 'front')
      composite(wipeFrame, wipeImage.data, null)
      wipeContext.putImageData(wipeImage, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(wipeCanvas, 0, 0, width, height)
    },
    /** Golpe crítico (crit-hit) onde o ataque acertou: x, chão do alvo e altura do peito. */
    crit({ x, floor, flip, height = 28 }) {
      oneShots.push(createFx(critHit, { x, y: floor, flip, seed: seed(), height }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Estouro ao pegar um item, centrado em x,y. */
    collect({ x, y }) {
      oneShots.push(createFx(collectBurst, { x, y: y + 30, seed: seed(), palette: goldPalette }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Chamar a cada quadro: { x, floor, height, flip, casingFloor, scale } enquanto o Edu atira, ou null.
     casingFloor = distância dos pés do Edu até o chão onde os cartuchos caem (0 no chão; maior no ar). */
    muzzle(state) {
      if (!state) {
        if (muzzle) { muzzle.stop(); muzzle = null }
        return
      }
      if (!muzzle) muzzle = createFx(muzzleSmg, { seed: seed() })
      Object.assign(muzzle.options, { x: state.x, y: state.floor, height: state.height, flip: state.flip, casingFloor: state.casingFloor ?? -0.5, scale: state.scale ?? 1 })
      if (!muzzle.live) { muzzle.live = true; oneShots.push(muzzle) }
    },
    update(dt) {
      if (banner) {
        bannerTime += dt
        banner.update(dt)
        if (bannerTime >= bannerLength) banner = null
      }
      if (wipe) wipe.update(dt)
      for (let i = oneShots.length - 1; i >= 0; i--) {
        const fx = oneShots[i]
        fx.update(dt)
        if (fx.done()) oneShots.splice(i, 1)
      }
    },
    clear() {
      oneShots.length = 0
      muzzle = null
      banner = null
      wipe = null
    },
    /** Desenha tudo no ctx (já com a escala do jogo). scroll = deslocamento da câmera em unidades do jogo. */
    draw(ctx, scroll) {
      if (!oneShots.length && !banner) return
      frame.ox = scroll
      clearFrame(frame)
      if (banner) banner.options.x = scroll + 240   // a faixa fica no centro da tela, não do mundo
      for (const fx of oneShots) fx.draw(frame, 'back')
      if (banner) banner.draw(frame, 'back')
      for (const fx of oneShots) fx.draw(frame, 'front')
      if (banner) banner.draw(frame, 'front')
      composite(frame, image.data, null)
      context.putImageData(image, 0, 0)
      ctx.drawImage(canvas, 0, 0)
    }
  }
}
