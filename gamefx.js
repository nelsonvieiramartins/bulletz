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
import * as levelUp from './vendor/pixelfx/src/fx/ui/level-up.js'
import * as cannonball from './vendor/pixelfx/src/fx/projectiles/cannonball.js'
import * as smallExplosion from './vendor/pixelfx/src/fx/explosions/small-explosion.js'
import * as bigExplosion from './vendor/pixelfx/src/fx/explosions/big-explosion.js'
import * as rain from './vendor/pixelfx/src/fx/weather/rain.js?v=2'
import * as campfire from './vendor/pixelfx/src/fx/fire/campfire.js'
import * as critHit from './vendor/pixelfx/src/fx/impacts/crit-hit.js'
import * as lightningStrike from './vendor/pixelfx/src/fx/lightning/lightning-strike.js'
import * as wheelSpray from './effects/respingo-roda.js?v=2'   // respingo das rodas sobre a água
import * as rainSplash from './effects/alagado.js'   // cópia do rain-splash do pixelfx, sem o reflexo do poste

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
  const ambient = []   // efeitos contínuos (fogo e fumaça em cima do helicóptero destruído)
  const muzzles = [null, null]   // um clarão de cano por jogador
  // faixa de texto (combo-counter) e transição de tela (shatter-wipe, que tem tela própria de 320x180, esticada para a do jogo)
  let banner = null, bannerTime = 0, bannerLength = 0
  // texto "CHECK POINT" (level-up do pixelfx) no meio da tela
  let checkpoint = null, checkpointTime = 0
  const wipeFrame = createFrame(320, 180)
  const wipeCanvas = document.createElement('canvas')
  wipeCanvas.width = 320
  wipeCanvas.height = 180
  const wipeContext = wipeCanvas.getContext('2d')
  const wipeImage = wipeContext.createImageData(320, 180)
  let wipe = null
  const bannerHold = 2
  // quadro de trabalho do clarão da ponta da faca (tamanho cheio; origem do efeito em tipOrigin)
  const tipFrame = createFrame(200, 150)
  // a faixa foi desenhada para a tela de 480 de largura: na tela estreita (celular em pé) é desenhada inteira num quadro à parte e reduzida
  const bannerFrame = createFrame(480, 270)
  const bannerScale = Math.min(1, (width / 480) * 1.02)
  const tipOrigin = [100, 100]
  // chuva por cima de toda a tela (rain do pixelfx, só as gotas): uma camada a cada 320 de largura, caindo até o chão da tela
  const rainFrame = createFrame(width, height)
  const rainCanvas = document.createElement('canvas')
  rainCanvas.width = width
  rainCanvas.height = height
  const rainContext = rainCanvas.getContext('2d')
  const rainImage = rainContext.createImageData(width, height)
  const rainFx = (width > 360 ? [0.25, 0.75] : [0.5]).map((u, i) => createFx(rain, { x: Math.round(width * u), y: height - 8, seed: 4 + i * 7, bare: true, reach: height - 8, density: 1 }))
  // asfalto alagado (rain-splash do pixelfx, poças com gotas, coroas e anéis): poças bem juntas, uma sobre a outra, para a água cobrir o
  // asfalto inteiro. A água é cortada reta no meio-fio (puddleTop), então não aparece a borda arredondada das poças. Ficam paradas na tela
  // (é a rua que passa) e são desenhadas atrás da carreta.
  const puddleFrame = createFrame(width, height)
  const puddleCanvas = document.createElement('canvas')
  puddleCanvas.width = width
  puddleCanvas.height = height
  const puddleContext = puddleCanvas.getContext('2d')
  const puddleImage = puddleContext.createImageData(width, height)
  const puddleTop = 216    // onde o asfalto começa na tela (o meio-fio fica logo acima)
  const puddleY = 243      // centro das poças: a borda de trás (centro - 27) cai no meio-fio e a da frente passa da base da tela
  // respingo das rodas: um efeito por roda (wheelSpray), num quadro à parte do tamanho da tela
  const sprayFrame = createFrame(width, height)
  const sprayCanvas = document.createElement('canvas')
  sprayCanvas.width = width
  sprayCanvas.height = height
  const sprayContext = sprayCanvas.getContext('2d')
  const sprayImage = sprayContext.createImageData(width, height)
  const sprayFx = Array.from({ length: 4 }, (_, i) => createFx(wheelSpray, { x: 0, y: 0, seed: 5 + i * 11, density: 1 }))
  const puddleGap = 60
  let puddleAge = 1, puddleDrawn = false   // as poças redesenham a 30 quadros por segundo (a taxa do efeito): metade do custo
  const puddleFx = Array.from({ length: Math.ceil(width / puddleGap) + 2 }, (_, i) => createFx(rainSplash, { x: Math.round(i * puddleGap - 20), y: puddleY, seed: 9 + i * 13 }))
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
    /** Final do 3º golpe do sword-combo (heavy-cleave, só o clarão) na ponta da faca, em escala menor, depois de delay s. */
    tip({ x, y, flip, scale = .42, delay = 0 }) {
      const inner = createFx(heavyCleave, { x: tipOrigin[0], y: tipOrigin[1], flip, seed: seed(), slamOnly: true, burst: true })
      let wait = delay
      oneShots.push({
        update(dt) { if (wait > 0) wait -= dt; else inner.update(dt) },
        done() { return wait <= 0 && inner.done() },
        draw(f, layer) {
          if (layer !== 'front' || wait > 0) return
          clearFrame(tipFrame)
          inner.draw(tipFrame, 'back')
          inner.draw(tipFrame, 'front')
          const reach = Math.ceil(tipOrigin[0] * scale)
          for (let dy = -Math.ceil(tipOrigin[1] * scale); dy <= Math.ceil((tipFrame.h - tipOrigin[1]) * scale); dy++)
            for (let dx = -reach; dx <= reach; dx++) {
              const sx = Math.round(tipOrigin[0] + dx / scale), sy = Math.round(tipOrigin[1] + dy / scale)
              if (sx < 0 || sy < 0 || sx >= tipFrame.w || sy >= tipFrame.h) continue
              const px = Math.round(x) + dx - f.ox, py = Math.round(y) + dy - f.oy
              if (px < 0 || py < 0 || px >= f.w || py >= f.h) continue
              const c = tipFrame.color[sy * tipFrame.w + sx], l = tipFrame.light[sy * tipFrame.w + sx]
              if (c) f.color[py * f.w + px] = c
              if (l & 0xffffff) f.light[py * f.w + px] = l
            }
        }
      })
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
      banner = createFx(comboCounter, { x: width / 2, y: 135, seed: seed(), text, label, hold, light: 1,
        palette: ['#07140f', '#0c3a2a', '#12704a', '#1fb870', '#5df08d', '#b6ffc8', '#e8ffe2', '#ffffff'] })
      bannerTime = 0
      bannerLength = 1.45 + hold
    },
    /** "CHECK POINT" no meio da tela: pilar de luz, as letras caem e brilham (level-up). Dura 3,2 s. */
    checkpoint({ text = 'CHECK POINT' } = {}) {
      checkpoint = createFx(levelUp, { x: width / 2, y: 205, seed: seed(), text, titleOnly: true })
      checkpointTime = 0
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
    /** Explosão (clarão, faíscas, brasas e fumaça do cannonball, sem a bala) em x, na altura do chão floor; height = altura do centro. */
    blast({ x, floor, flip = false, height = 14 }) {
      oneShots.push(createFx(cannonball, { x, y: floor, flip, seed: seed(), height, ball: false }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Explosão de bomba no chão (small-explosion do pixelfx): clarão, fogo que vira fumaça, faíscas e pedras. size = tamanho (1 = o do efeito). */
    bomb({ x, floor, size = .6 }) {
      oneShots.push(createFx(smallExplosion, { x, y: floor, seed: seed(), size }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Explosão enorme no chão (big-explosion do pixelfx: cúpula branca, bola de fogo, coluna de fumaça em cogumelo, pedras e fogo que fica): a morte do chefe. */
    huge({ x, floor }) {
      oneShots.push(createFx(bigExplosion, { x, y: floor, seed: seed() }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Fogo contínuo com fumaça e brasas (campfire do pixelfx, sem as toras) com a base em x,y; height = altura das chamas. Fica até clear(). */
    fire({ x, y, height = 26 }) {
      ambient.push(createFx(campfire, { x, y, seed: seed(), height, props: false }))
    },
    /** Golpe crítico (crit-hit) onde o ataque acertou: x, chão do alvo e altura do peito. */
    crit({ x, floor, flip, height = 28 }) {
      oneShots.push(createFx(critHit, { x, y: floor, flip, seed: seed(), height }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Raio da tempestade (lightning-strike do pixelfx) caindo em x, na altura do chão floor: o símbolo no chão carrega (aviso) por
     .76 s, então o raio cai (e mais duas vezes, piscando) e o canal se desfaz. Dura uns 3 s. */
    lightning({ x, floor }) {
      oneShots.push(createFx(lightningStrike, { x, y: floor, seed: seed() }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Estouro ao pegar um item, centrado em x,y. */
    collect({ x, y }) {
      oneShots.push(createFx(collectBurst, { x, y: y + 30, seed: seed(), palette: goldPalette }))
      if (oneShots.length > maxOneShots) oneShots.shift()
    },
    /** Chamar a cada quadro: { x, floor, height, flip, casingFloor, scale } enquanto o Edu atira, ou null.
     casingFloor = distância dos pés do Edu até o chão onde os cartuchos caem (0 no chão; maior no ar). */
    muzzle(state, slot = 0) {
      if (!state) {
        if (muzzles[slot]) { muzzles[slot].stop(); muzzles[slot] = null }
        return
      }
      if (!muzzles[slot]) muzzles[slot] = createFx(muzzleSmg, { seed: seed() })
      const muzzle = muzzles[slot]
      Object.assign(muzzle.options, { x: state.x, y: state.floor, height: state.height, flip: state.flip, casingFloor: state.casingFloor ?? -0.5, scale: state.scale ?? 1 })
      if (!muzzle.live) { muzzle.live = true; oneShots.push(muzzle) }
    },
    update(dt) {
      if (banner) {
        bannerTime += dt
        banner.update(dt)
        if (bannerTime >= bannerLength) banner = null
      }
      if (checkpoint) {
        checkpointTime += dt
        checkpoint.update(dt)
        if (checkpoint.done()) checkpoint = null
      }
      if (wipe) wipe.update(dt)
      for (const fx of ambient) fx.update(dt)
      for (let i = oneShots.length - 1; i >= 0; i--) {
        const fx = oneShots[i]
        fx.update(dt)
        if (fx.done()) oneShots.splice(i, 1)
      }
    },
    /** Anda a chuva. */
    updateRain(dt) { for (const fx of rainFx) fx.update(dt); for (const fx of puddleFx) fx.update(dt); for (const fx of sprayFx) fx.update(dt); puddleAge += dt },
    /** Desenha o asfalto alagado (já com a escala do jogo). amount = 0 a 1: a mesma força da chuva. */
    drawPuddles(ctx, amount, calm = null) {
      if (amount < .08) return
      if (puddleAge >= 1 / 30 || !puddleDrawn) {
        puddleAge = 0
        puddleDrawn = true
        clearFrame(puddleFrame)
        for (const fx of puddleFx) fx.draw(puddleFrame, 'back')
        for (const fx of puddleFx) fx.draw(puddleFrame, 'front')
        composite(puddleFrame, puddleImage.data, null)
        puddleContext.putImageData(puddleImage, 0, 0)
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, puddleTop, width, height - puddleTop)
      ctx.clip()
      ctx.globalAlpha = Math.min(1, amount * 1.6)
      if (!calm) ctx.drawImage(puddleCanvas, 0, 0)
      else {
        // calm = [x0, x1]: o trecho da tela sob a carreta. Ali a água fica parada (sem gotas, coroas e anéis); fora dele, com tudo
        const x0 = Math.max(0, calm[0]), x1 = Math.min(width, calm[1])
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, puddleTop, Math.max(0, x0), height - puddleTop)
        ctx.rect(Math.max(x1, 0), puddleTop, width, height - puddleTop)
        ctx.clip()
        ctx.drawImage(puddleCanvas, 0, 0)
        ctx.restore()
        if (x1 > x0) {
          const sheet = ctx.createLinearGradient(0, puddleTop, 0, height)
          sheet.addColorStop(0, 'rgba(18,48,99,.82)')
          sheet.addColorStop(1, 'rgba(10,22,48,.94)')
          ctx.fillStyle = sheet
          ctx.fillRect(x0, puddleTop, x1 - x0, height - puddleTop)
        }
      }
      ctx.restore()
    },
    /** Respingo das rodas sobre a água (já com a escala do jogo). spots = [{ x, y }] com o ponto onde cada roda toca a água, na tela.
     amount = 0 a 1: a força do respingo (chuva x velocidade da carreta). */
    drawSpray(ctx, amount, spots) {
      if (amount < .08) return
      clearFrame(sprayFrame)
      spots.forEach((spot, i) => {
        const fx = sprayFx[i]
        if (!fx) return
        fx.options.x = Math.round(spot.x)
        fx.options.y = Math.round(spot.y)
        fx.options.density = Math.min(1, .25 + amount * .9)
        fx.draw(sprayFrame, 'back')
        fx.draw(sprayFrame, 'front')
      })
      composite(sprayFrame, sprayImage.data, null)
      sprayContext.putImageData(sprayImage, 0, 0)
      ctx.drawImage(sprayCanvas, 0, 0)
    },
    /** Desenha a chuva (já com a escala do jogo). amount = 0 a 1: a quantidade de gotas e a opacidade. */
    drawRain(ctx, amount) {
      if (amount < .03) return
      clearFrame(rainFrame)
      for (const fx of rainFx) { fx.options.density = .2 + amount * 1.1; fx.draw(rainFrame, 'back'); fx.draw(rainFrame, 'front') }
      composite(rainFrame, rainImage.data, null)
      rainContext.putImageData(rainImage, 0, 0)
      ctx.save()
      ctx.globalAlpha = Math.min(1, .35 + amount * .65)
      ctx.drawImage(rainCanvas, 0, 0)
      ctx.restore()
    },
    clear() {
      oneShots.length = 0
      ambient.length = 0
      muzzles.fill(null)
      banner = null
      checkpoint = null
      wipe = null
    },
    /** Desenha tudo no ctx (já com a escala do jogo). scroll = deslocamento da câmera em unidades do jogo. */
    draw(ctx, scroll) {
      if (!oneShots.length && !ambient.length && !banner && !checkpoint) return
      frame.ox = scroll
      clearFrame(frame)
      if (banner) banner.options.x = bannerScale < 1 ? 240 : scroll + width / 2   // a faixa fica no centro da tela, não do mundo
      if (checkpoint) checkpoint.options.x = scroll + width / 2
      for (const fx of oneShots) fx.draw(frame, 'back')
      if (banner && bannerScale === 1) banner.draw(frame, 'back')
      if (checkpoint) checkpoint.draw(frame, 'back')
      for (const fx of oneShots) fx.draw(frame, 'front')
      for (const fx of ambient) fx.draw(frame, 'front')
      if (banner && bannerScale === 1) banner.draw(frame, 'front')
      if (banner && bannerScale < 1) {
        clearFrame(bannerFrame)
        banner.draw(bannerFrame, 'back')
        banner.draw(bannerFrame, 'front')
        const cx = Math.round(scroll + width / 2), cy = 135
        for (let dy = -Math.ceil(cy * bannerScale); dy <= Math.ceil((270 - cy) * bannerScale); dy++)
          for (let dx = -Math.ceil(240 * bannerScale); dx <= Math.ceil(240 * bannerScale); dx++) {
            const sx = Math.round(240 + dx / bannerScale), sy = Math.round(cy + dy / bannerScale)
            if (sx < 0 || sy < 0 || sx >= 480 || sy >= 270) continue
            const px = cx + dx - frame.ox, py = cy + dy
            if (px < 0 || py < 0 || px >= frame.w || py >= frame.h) continue
            const c = bannerFrame.color[sy * 480 + sx], l = bannerFrame.light[sy * 480 + sx]
            if (c) frame.color[py * frame.w + px] = c
            if (l & 0xffffff) frame.light[py * frame.w + px] = l
          }
      }
      if (checkpoint) checkpoint.draw(frame, 'front')
      composite(frame, image.data, null)
      context.putImageData(image, 0, 0)
      ctx.drawImage(canvas, 0, 0)
    }
  }
}
