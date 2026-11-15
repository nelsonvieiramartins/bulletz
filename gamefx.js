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

const maxOneShots = 28
// medalha dourada em vez do rosa original do efeito
const goldPalette = ['#2a1604', '#5a3208', '#9a5a0e', '#d98a16', '#ffb938', '#ffd978', '#fff0b8', '#ffffff']
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

  return {
    /** Faísca onde o tiro acertou. x,y = ponto do acerto; floor = pés do alvo; dx = direção do tiro (1 ou -1). */
    hit({ x, y, floor, dx }) {
      const h = Math.max(4, Math.min(60, floor - y))
      oneShots.push(createFx(hitSpark, { x, y: floor, flip: dx < 0, seed: seed(), height: h }))
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
      for (let i = oneShots.length - 1; i >= 0; i--) {
        const fx = oneShots[i]
        fx.update(dt)
        if (fx.done()) oneShots.splice(i, 1)
      }
    },
    clear() {
      oneShots.length = 0
      muzzle = null
    },
    /** Desenha tudo no ctx (já com a escala do jogo). scroll = deslocamento da câmera em unidades do jogo. */
    draw(ctx, scroll) {
      if (!oneShots.length) return
      frame.ox = scroll
      clearFrame(frame)
      for (const fx of oneShots) fx.draw(frame, 'back')
      for (const fx of oneShots) fx.draw(frame, 'front')
      composite(frame, image.data, null)
      context.putImageData(image, 0, 0)
      ctx.drawImage(canvas, 0, 0)
    }
  }
}
