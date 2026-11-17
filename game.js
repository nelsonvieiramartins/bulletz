import createSpriteFusionExplosion from './effects/spritefusion-explosion.js'
import { sfx } from './sfx.js?v=2'
import { createGameFx } from './gamefx.js?v=12'
import { applySpriteConfig } from './spriteconfig.js'
import { fase2 } from './fase2.js?v=3'
import { fase21 } from './fase21.js?v=2'
import { createMidiPlayer } from './midiplayer.js'

// Troca de fase SEM recarregar a página (recarregar tira o navegador da tela cheia): a instância atual é encerrada
// (listeners removidos, laço parado, música pausada) e game.js é importado de novo com outra URL, lendo a nova fase.
// Para saber o que remover, todo addEventListener feito pela página fica registrado.
const bootAt = performance.now()
if (!window.__bulletzListeners) {
  window.__bulletzListeners = []
  const nativeAdd = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    window.__bulletzListeners.push([this, type, listener, options])
    return nativeAdd.call(this, type, listener, options)
  }
}
let disposed = false
function disposeInstance() {
  disposed = true
  for (const [target, type, listener, options] of window.__bulletzListeners.splice(0)) target.removeEventListener(type, listener, options)
  try { music.pause() } catch {}
  try { menuCursor.remove() } catch {}   // o contorno do menu é desta instância: sem isso ele ficava parado na tela inicial
  for (const b of document.querySelectorAll('button.sel')) b.classList.remove('sel')
  window.__bulletzAudio = { soundContext, shotSound, deathGruntSound, deathScreamSound }   // a próxima instância reaproveita o áudio já liberado
}
function goToStage(fase, { autostart = true, extra = {} } = {}) {
  const params = new URLSearchParams(location.search)
  if (fase) params.set('fase', fase); else params.delete('fase')
  params.delete('fim')
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  const url = location.pathname + (params.toString() ? '?' + params.toString() : '')
  history.replaceState(null, '', url)
  try { if (autostart) sessionStorage.setItem('bulletz.autostart', '1'); else sessionStorage.removeItem('bulletz.autostart') } catch {}
  document.documentElement.classList.add('booting')   // CARREGANDO até a nova instância ter toda a arte
  if (autostart) document.documentElement.classList.add('stage-loading')   // preto enquanto a nova fase carrega
  else { try { sessionStorage.setItem('bulletz.skipSelect', '1') } catch {} }   // o SAIR volta direto à tela inicial
  disposeInstance()
  import('./game.js?boot=' + Date.now()).catch((error) => { console.error('Troca de fase sem recarregar falhou:', error); try { sessionStorage.setItem('bulletz.bootError', String(error?.stack || error)) } catch {} location.href = url })   // plano B: recarrega a página
}

const select = (selector) => document.querySelector(selector)
const game = select('#game')
const preview = select('#sprite')
const ctx = game.getContext('2d')
const sample = preview.getContext('2d')
// O mundo continua em 480x270; o canvas tem o dobro de pixels para o Edu (sprites de ~133px)
// aparecer 1:1 em alta definição, enquanto cenário e inimigos são ampliados 2x.
// No celular em pé (e só nele) o mundo mostrado é mais estreito (300 de largura) e a tela quase quadrada, com uma faixa em cima só para o HUD:
// o jogo fica maior e o HUD não cobre a ação. Ao girar o aparelho a largura troca na hora (applyViewport).
const portraitQuery = matchMedia('(pointer:coarse) and (orientation:portrait)')
const wideWidth = 480, squareWidth = 300
const isMobileView = () => portraitQuery.matches || document.documentElement.classList.contains('modo-celular')   // 'modo-celular': pré-visualização na versão local
let width = isMobileView() ? squareWidth : wideWidth
const height = 270
const pixelScale = 2
game.width = width * pixelScale
game.height = height * pixelScale
ctx.imageSmoothingEnabled = false
sample.imageSmoothingEnabled = false
const end = 6930
const cell = 96
const breathingFps = 3
// Intervalo entre tiros do Edu em segundos (metralhadora). Maior = atira mais devagar.
const fireInterval = .09
// Variação de altura de cada bala, em unidades do jogo, para a rajada não sair em linha reta perfeita
const fireSpread = 1.5
// O som e o clarão seguem fireInterval; só 1 a cada bulletEvery disparos solta uma bala de verdade
const bulletEvery = 2
// Folhas do Edu (assets/edu-v2): células de 192x160, eixo do corpo em x=80 e pés em y=152,
// desenhadas na metade do tamanho em unidades do mundo (1:1 nos pixels do canvas).
const heroCell = { w: 192, h: 160, anchorX: 80, feetY: 152 }
// Aumenta o Edu em 5 unidades visuais, mantendo os pés presos ao chão e a hitbox original.
// Tamanho dos personagens (Edu e inimigos): 1 normalmente; a Fase 2.1 usa 0,9 (10% menores). Vale para o desenho, as caixas de
// acerto, a saída dos tiros e o clarão do cano, para tudo continuar alinhado.
const charScale = new URLSearchParams(location.search).get('fase') === '2.1' ? .9 : 1
const heroVisualScale = (heroCell.h / pixelScale + 5) / (heroCell.h / pixelScale) * charScale
const heroSheets = new Set(['idle','run','runFire','idleFire','playerFall','crouch','jump'])
const jumpTuckLift = 10
const crouchFireMuzzle = [26,-31]
// Cano por quadro: o tronco da corrida atirando segue o balanço das pernas da corrida
const runFireMuzzles = [[26,-48.5],[28,-50],[27,-49.5],[28,-51],[28,-47.5],[28,-49.5],[28,-50],[28,-50]]
const idleFireMuzzle = [23,-54]
const jumpFireMuzzles = [[29,-39-jumpTuckLift],[27,-52]]
const sequences = {
  idle: { file: 'edu-v2/respiracao.png', count: 4 },
  run: { file: 'edu-v2/corrida.png?v=3', count: 8 },
  runFire: { file: 'edu-v2/corrida-atirando.png?v=2', count: 8 },
  idleFire: { file: 'edu-v2/parado-atirando.png', count: 1 },
  playerFall: { file: 'edu-v2/queda.png?v=2', count: 4 },
  jump: { file: 'edu-v2/pulo.png', count: 4 }
}
// Personagens jogáveis: o Edu e o Operador (assets/operador, só na versão de teste). Cada um tem as suas folhas (as do Operador entram como
// 'op_run', 'op_jump'...) e o seu canto de cano por pose. As folhas do Operador já trazem as pernas encolhidas desenhadas no pulo: sem "lift".
let operadorCfg = null
try { operadorCfg = await (await fetch('assets/operador/config.json?v=12')).json() } catch (error) { console.warn('config do Operador não carregada', error) }
const operadorFiles = { idle: 'respiracao.png', run: 'corrida.png', runFire: 'corrida-atirando.png', idleFire: 'parado-atirando.png', playerFall: 'queda.png', jump: 'pulo.png', crouch: 'agachamento.png' }
const heroSets = {
  edu: { prefix: '', tuckLift: jumpTuckLift, runFire: runFireMuzzles, idleFire: idleFireMuzzle, crouch: crouchFireMuzzle, jump: jumpFireMuzzles },
  operativo: operadorCfg ? { prefix: 'op_', tuckLift: operadorCfg.tuckLift ?? 0, runFire: operadorCfg.runFire, idleFire: operadorCfg.idleFire[0], crouch: operadorCfg.crouch[2], jump: [operadorCfg.jump[2], operadorCfg.jump[3]] } : null
}
const fallFrameDuration = .11
const fallDuration = .68
// Fase escolhida pela URL: index.html?fase=2 abre a Fase 2 (Av. T-9, Goiânia).
// Por enquanto a Fase 2 troca só o cenário; traçado, inimigos e chefe ainda são os da Fase 1.
const faseParam = new URLSearchParams(location.search).get('fase')
// 1 = Cidade dos Boletos; 2 = Av. T-9; 2.1 = em cima da Carreta Furação em movimento (usa a arte e a música da Fase 2)
const onTruck = faseParam === '2.1'
const stage = faseParam === '2' || onTruck ? 2 : 1
const stageData = onTruck ? fase21 : fase2
// Altura do chão onde o Edu nasce, os inimigos patrulham e o chefe fica (a Fase 2 pisa mais baixo, no asfalto)
const groundY = stage === 2 ? stageData.groundY : 224
// Impulso do pulo. A Fase 2 pula mais alto para alcançar o teto dos carros (~68 acima do chão: 360 sobe ~82; 315 sobe ~62).
// Na Fase 2.1 o pulo do Edu é igual ao dos soldados (292, sobe ~54): ele sobe os andares da carreta como eles.
const jumpSpeed = onTruck ? 292 : stage === 2 ? 360 : 315
// Fase em três setores: Cidade dos Boletos, Viadutos da Pensão e Distrito dos Juros
const platforms = [
  // Setor 1 · A Cidade dos Boletos
  [0,224,510], [295,170,115], [551,224,520], [813,171,108],
  [1110,224,405], [1270,174,102], [1556,224,560],
  // Setor 2 · Viadutos da Pensão
  [2380,224,300], [2470,170,100],
  [2760,224,240], [2800,170,90], [2930,118,90],
  [3080,190,48],
  [3200,224,380], [3330,172,110], [3470,124,90],
  [3660,224,260],
  [4200,224,420], [4300,172,96], [4460,172,96],
  // Setor 3 · Distrito dos Juros
  [4700,224,330], [4800,170,100],
  [5110,196,44], [5225,170,44], [5335,196,44],
  [5420,224,360], [5560,170,110],
  [6080,224,1150]   // vai além do fim da câmera (6980): sem buraco no final
]
// Plataformas móveis: x/y é o início do trajeto, ax/ay é o deslocamento total
const movers = [
  { x: 2145, y: 210, w: 64, ax: 140, ay: 0, period: 3.4, phase: 0 },
  { x: 3960, y: 200, w: 60, ax: 140, ay: 0, period: 3, phase: 1.2 },
  { x: 5810, y: 206, w: 56, ax: 100, ay: 0, period: 3.2, phase: 0 },
  { x: 5955, y: 186, w: 56, ax: 90, ay: 0, period: 3.2, phase: Math.PI }
]
const checkpoints = [1150, 3300, 5500]
const goal = 6870
// Fase 2: depois que o chefe cai o Edu ainda anda um bom trecho (a rua continua) antes de as caminhonetes fecharem a pista e a Carreta chegar
const convoyWalk = stage === 2 && !onTruck ? 330 : 0
const finishX = goal + convoyWalk   // onde o final da fase dispara
const walkEnd = end + convoyWalk     // até onde o Edu e a câmera vão
const bossArena = 6460
const zones = [
  [2116, 'SETOR 2 · VIADUTOS DA PENSÃO'],
  [4620, 'SETOR 3 · DISTRITO DOS JUROS']
]
// Medalhas de vida extra escondidas em pontos difíceis
const pickupSpots = [[2975,100], [3515,106], [5247,150]]
const pickups = []
// Power-up visual de teste: não altera atributos; apenas dispara o VFX ao ser coletado.
const powerUpSpots = [[2560,170]]
const powerUps = []
const P = (x,min,max,y=224) => ({ x, type: 'patrol', min, max, y })
const E = (x,min,max,y=224) => ({ x, type: 'elite', min, max, y })
const D = (x,y=161) => ({ x, type: 'drone', y })
const H = (x,y=161) => ({ x, type: 'heavyDrone', y })
const enemySpawns = [
  // Setor 1
  P(295,220,438), P(460,413,621), P(674,602,789), P(820,751,978),
  D(960), P(1035,974,1217), P(1210,1160,1370), P(1425,1360,1630),
  D(1610), P(1680,1595,1762), P(1830,1750,1935), D(2040),
  // Setor 2
  P(2450,2390,2670), P(2520,2475,2565,170), D(2620),
  P(2850,2770,2990), P(2975,2935,3015,118), D(2880,150),
  D(3090,150),
  P(3260,3210,3570), P(3380,3335,3435,172), P(3510,3475,3555,124), D(3450),
  P(3700,3670,3910), E(3800,3680,3910), D(3760),
  D(4060,150),
  P(4250,4210,4610), P(4340,4305,4390,172), P(4500,4465,4550,172), D(4380), D(4560,140),
  // Setor 3
  E(4800,4710,5020), P(4850,4805,4895,170), H(4900),
  H(5225,128),
  E(5600,5430,5770), P(5610,5565,5665,170), E(5720,5430,5770), H(5650),
  H(5930,140),
  E(6200,6090,6420), H(6260), P(6350,6100,6440)
]
// Fase 2: troca o traçado acima pelo de fase2.js (mesmo formato, mesma arena do chefe)
if (stage === 2) {
  for (const [target, source] of [[platforms, stageData.platforms], [movers, stageData.movers], [checkpoints, stageData.checkpoints],
    [zones, stageData.zones], [pickupSpots, stageData.pickupSpots], [powerUpSpots, stageData.powerUpSpots], [enemySpawns, stageData.enemySpawns]])
    target.splice(0, target.length, ...source)
  const menuHead = document.querySelector('.menu-head')
  menuHead.querySelector('.eyebrow').textContent = stageData.eyebrow ?? 'PAUSA · FASE 2'
  menuHead.querySelector('strong').textContent = stageData.title
}
const enemyTypes = {
  patrol: { hp: 3, points: 150, interval: 2.25, speed: 86, reach: 225, shotSpeed: 125 },
  elite: { hp: 5, points: 300, interval: 1.45, speed: 102, reach: 250, shotSpeed: 150 },
  drone: { hp: 5, points: 250, interval: 2.1, speed: 32, reach: 280 },
  heavyDrone: { hp: 8, points: 350, interval: 1.35, speed: 48, reach: 330, shotSpeed: 178, burstShots: 8, burstRate: .095 },
  // Fofão: ataque corpo a corpo. Corre até o Edu em qualquer distância, prepara o golpe de faca e dá a estocada.
  fofao: { hp: 4, points: 250, speed: 120, strike: 34, windup: .42, slash: .22, recover: .12, cooldown: .55 },
  // Chapolim Colorado: corpo a corpo com a marreta. Mais lento e resistente que o Fofão; levanta a marreta (aviso longo)
  // e desce de uma vez. Ao bater no chão (hitAt) solta o abalo sísmico do pixelfx no ponto de impacto (impactX à frente) e o dano é essa onda: o anel cresce de 6 a 52 unidades em .45 s (quakeRing) e machuca quem ele alcança no chão.
  chapolim: { hp: 6, points: 400, speed: 125, strike: 46, windup: .4, slash: .2, recover: .3, cooldown: .6, hitAt: .54, impactX: 36 }
}
const enemyFrames = {
  patrol: [80,72,40,70],
  patrolFall: [88,72,40,70],
  drone: [60,60,30,40],
  elite: [80,72,40,70],
  eliteFall: [88,72,40,70],
  heavyDrone: [60,60,30,40],
  droneDeath: [60,60,30,57],
  eliteDroneDeath: [60,60,30,57],
  boss: [112,64,60,63],
  // Fofão (assets/fofao, em 2x: desenhado na metade do tamanho): [largura, altura, âncora x, pés y] de cada quadro, em px da folha
  fofaoRun: [116,152,59,146],
  fofaoAttack: [147,142,84,136],
  fofaoAttack2: [148,144,84,138],
  fofaoFall: [131,148,68,142],
  // Chapolim (assets/chapolim, também em 2x)
  chapolimRun: [132,158,66,152],
  chapolimAttack: [167,154,87,148],
  chapolimFall: [145,154,70,148],
  chapolimJump: [140,143,71,137]
}
const enemyMuzzles = { patrol: [27,-55], drone: [8,0], heavyDrone: [25,3] }
// A folha preta tem uma silhueta visualmente mais pesada; comprime só a largura para casar com o patrulheiro padrão.
const eliteWidthScale = .92
// O drone padrão tem mais área transparente útil na destruição; reduz o voo para casar com a carcaça desmontada.
const standardDroneScale = .76
const bossMuzzles = [[-56,-41],[-57,-41],[-57,-33]]
// Canos editados em sprites.html (assets/sprite-config.json) substituem os valores acima
await applySpriteConfig({ runFire: runFireMuzzles, idleFire: idleFireMuzzle, crouch: crouchFireMuzzle, jump: jumpFireMuzzles, patrol: enemyMuzzles.patrol, boss: bossMuzzles })
const enemies = []
const enemyShots = []
const maxLives = 3
let score = 0
// Fase 1: o chefe é o Oficial de Justiça no helicóptero (assets/boss-heli, montado por tools/montar_heli.py). Fase 2: O Cobrador a pé.
const heliBoss = stage === 1
const heliMeta = heliBoss ? await (await fetch('assets/boss-heli/heli.json')).json() : null
const bossHp = heliBoss ? 36 : 24
const boss = { x: 6680, y: groundY, hp: bossHp, delay: .75, volley: 0 }
// As 3 ondas que o Oficial chama (esquerda e direita); ao fim da terceira (depois do bombardeio e da descida) o helicóptero é destruído
const heliCameoX = 4150   // 60% da fase: o helicóptero passa soltando bombas (a mesma investida do chefe, com a porta fechada)
const heliWaves = [
  { left: ['patrol', 'patrol'], right: ['patrol', 'patrol'] },
  { left: ['patrol', 'elite'], right: ['patrol', 'patrol', 'patrol'] },
  { left: ['elite', 'patrol', 'patrol'], right: ['elite', 'patrol', 'patrol'] }   // a 3ª é a última: no fim dela o helicóptero cai
]
// Altura dos esquis: lá em cima (o casco fica acima do alcance até dos tiros dados em salto) e baixo (exposto, na altura dos tiros do Edu).
// O helicóptero é desenhado em 340 de largura (2x); na tela estreita do celular em pé encolhe para caber (heliScale).
const heliHigh = 125, heliLow = 214
const heliScale = () => width < 480 ? .8 : 1
// Onde o Edu fica na tela enquanto a câmera o segue (distância da borda esquerda). Na tela estreita do celular em pé ele fica mais recuado
// (uns 36% da largura) para sobrar tela à frente e os inimigos não aparecerem colados nele.
const walkLead = () => width < 480 ? 108 : 154
// Alcance do tiro do Edu: .75 s a 430/s (uns 320 unidades) na tela larga. Na tela estreita do celular em pé (300 de largura, ele fica no meio)
// o tiro iria muito além da borda e mataria os inimigos antes de entrarem na tela: lá o alcance é de ~190 unidades (contando o cano): vai até a borda da tela, já que o Edu fica mais recuado.
const shotLife = () => width < 480 ? .4 : .75
const bombs = []   // bombas caindo: { x, y, vx, vy, rot }
const heliSmoke = []   // fumaça do helicóptero caindo e do destroço: { x, y, vx, vy, r0, r1, age, life }
const heliWreckScale = .8   // o destroço é desenhado um pouco menor que a arte (que tem o tamanho do helicóptero inteiro, com as pás quebradas abertas)
let farHeli = null   // o helicóptero que cruza o fundo depois do 1º checkpoint (porta fechada): { delay, sx, y }
function resetHeli() {
  boss.heli = { phase: 'idle', t: 0, wave: 0, pending: [], pose: 0, sway: 0, calm: 0, exposedT: 0, vx: 0, tilt: 0, hitUntil: 0, dyingT: 0, nextBlast: 0, gone: false, face: 1, sx: 0, dir: 1, runs: 0, cols: [], smokeT: 0, cameo: false, cameoDone: false }
  farHeli = null
  bombs.length = 0
  heliSmoke.length = 0
  if (heliBoss) { boss.x = 6680; boss.y = heliHigh }
}
resetHeli()

function createEnemy({ x, type, min, max, y }) {
  const drone = type === 'drone' || type === 'heavyDrone'
  return { x, origin: x, kind: drone ? 'drone' : type === 'fofao' || type === 'chapolim' ? 'melee' : 'patrol', type, elite: type === 'elite' || type === 'heavyDrone',
    y, spawnY: y, min, max,
    hp: enemyTypes[type].hp, delay: drone ? 1.25 : 1.1+(x%7)*.14, face: -1, moving: false,
    route: x % 3 === 0 ? 1 : -1, vx: 0, vy: 0, stride: 0, grounded: true, airTime: 0, landing: 0,
    attackAge: -1, attackKind: 0, struck: false, cooldown: 0, jumpWait: 0,
    special: null, specialAge: 0, specialUses: 0, aliveTime: 0, ghostTimer: 0,
    standOff: .4 + Math.random()*.35, paceDir: 1, paceTimer: 0, slot: Math.random() - .5 }
}

function populateEnemies(at) {
  enemies.length = 0
  for (const spawn of enemySpawns) if (spawn.x > at) enemies.push(createEnemy(spawn))
  pickups.length = 0
  for (const [x,y] of pickupSpots) if (x > at) pickups.push({ x, y, taken: false })
  powerUps.length = 0
  for (const [x,y] of powerUpSpots) if (x > at) powerUps.push({ x, y, taken: false })
  boss.hp = bossHp
  boss.delay = .75
  boss.volley = 0
  resetHeli()
}
populateEnemies(70)
const keys = new Set()
const keyboard = new Set(['ArrowLeft','ArrowRight','ArrowDown','KeyA','KeyD','KeyS','Space','ArrowUp','KeyW','KeyG','KeyL','Numpad0','Numpad1','Numpad4'])
const neutralPad = { direction: 0, jump: false, fire: false, crouch: false, restart: false }
const padButtons = { south: 0, west: 2, start: 9, down: 13, left: 14, right: 15 }
const stickDeadzone = 0.20
let padIndex = null
let padId = null
let padProfile = null
let calibration = null
let padJumpHeld = false
let padStartHeld = false
let canReadPads = typeof navigator.getGamepads === 'function'
const shots = []
const impacts = []
const sparks = []
const powerUpMotes = []
const powerUpDuration = 2.95
const droneExplosions = []
let gameFx = createGameFx(width, height)   // pixelfx: cano, faísca de acerto, medalha
const explosionColorCanvas = document.createElement('canvas')
const explosionLightCanvas = document.createElement('canvas')
explosionColorCanvas.width = explosionLightCanvas.width = width
explosionColorCanvas.height = explosionLightCanvas.height = height
const explosionColorCtx = explosionColorCanvas.getContext('2d')
const explosionLightCtx = explosionLightCanvas.getContext('2d')
let explosionColorImage, explosionLightImage, explosionFrame
function buildExplosionBuffers() {
  explosionColorCanvas.width = explosionLightCanvas.width = width
  explosionColorImage = explosionColorCtx.createImageData(width,height)
  explosionLightImage = explosionLightCtx.createImageData(width,height)
  explosionFrame = {
    w: width, h: height, ox: 0, oy: 0,
    color: new Uint32Array(explosionColorImage.data.buffer),
    light: new Uint32Array(explosionLightImage.data.buffer)
  }
}
buildExplosionBuffers()
// Troca a largura do mundo ao girar o celular: refaz o canvas e os buffers de efeitos (a fase continua)
function applyViewport() {
  const next = isMobileView() ? squareWidth : wideWidth
  if (next === width) return
  width = next
  game.width = width * pixelScale
  game.height = height * pixelScale
  ctx.imageSmoothingEnabled = false
  buildExplosionBuffers()
  gameFx = createGameFx(width, height)
  camera = Math.max(0, focusX() - walkLead() + 9)
}
portraitQuery.addEventListener('change', applyViewport)
// Modo celular (só na versão local de teste): liga e desliga a visualização do celular em pé no computador (lembrado no navegador)
function setPhoneMode(on) {
  document.documentElement.classList.toggle('modo-celular', on)
  try { localStorage.setItem('bulletz.modoCelular', on ? '1' : '0') } catch {}
  applyViewport()
  const menuPhone = document.querySelector('#menu-phone')
  if (menuPhone) menuPhone.textContent = 'Modo celular: ' + (on ? 'ligado' : 'desligado')
  const link = document.querySelector('#phone-toggle')
  if (link) link.textContent = on ? 'Modo celular ✓' : 'Modo celular'
}
const impactDuration = .12
const flashDuration = .075
const flashSprite = document.createElement('canvas')
flashSprite.width = 200
flashSprite.height = 200
const flashCtx = flashSprite.getContext('2d')
let camera = 0
let elapsed = 0
let last = 0
let respawnX = onTruck ? fase21.startX : 70
let zoneIndex = 0
let finish = false
// Fase 2.1: a rua passa sozinha (roadPos anda com roadSpeed). No final a carreta freia até parar na porta do Vikings Pub (endSeq).
let roadPos = 0, roadSpeed = onTruck ? fase21.speed : 0, wheelAngle = 0
// Fase 2.1: o tempo vai fechando a cada onda (0 = entardecer limpo, 1 = tudo escuro, dessaturado e com chuva forte)
let weather = 0, rainAmount = 0
// Por onda (índice = onda atual, de 0 a 6): quanto o céu escurece e quanto chove. A chuva só começa na onda 3 (fraca), chega ao ápice na 5 e acaba na 6.
// O céu escurece pouco (mesmo no ápice a cena continua clara e legível): ver drawWeatherGrade.
const weatherByWave = [0, 0, 0, .3, .55, .8, .35]
const rainByWave = [0, 0, 0, .3, .65, 1, 0]
let endSeq = null, endGround = null
let previewPlaying = true
let previewSequence = 'run'
let previewFrame = 0
let previewTime = 0
let fps = 12
let readFrame = -1
let progress = -1
let noticeUntil = 0
const startX = onTruck ? fase21.startX : 70
// Jogadores: o Edu (P1) e, no modo de teste com ?jogadores=2, um segundo jogador na mesma tela (por enquanto com o mesmo sprite).
// Todo o estado de cada um fica no próprio objeto. "player" é o jogador da vez: o laço de atualização o troca para cada jogador e a IA
// dos inimigos o aponta para o jogador mais próximo, então o código antigo (que lê "player") continua valendo sem reescrever.
const testHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || new URLSearchParams(location.search).has('debug')
document.body.classList.toggle('hud-bottom', onTruck)   // Fase 2.1: retratos e vidas embaixo (P1 à esquerda, P2 à direita)
document.querySelector('#menu')?.classList.toggle('player-mode', !testHost)   // MODO JOGADOR: pausa enxuta na versão publicada
const twoPlayers = new URLSearchParams(location.search).get('jogadores') === '2'
const makePlayer = (idx) => ({
  idx, x: Math.max(14, startX - idx * 26), y: groundY, vx: 0, vy: 0, face: 1, grounded: true, coyote: 0.09, buffer: 0, phase: 0, cooldown: 0, crouch: 0, trigger: false, mover: null,
  lives: maxLives, inv: 0, fall: null, levelY: groundY /* chão em que pisou por último; os Fofões se orientam por ele */, jumpPressed: false, shotTick: 0, idleTime: 0, powerVisual: 0
})
const players = [makePlayer(0)]
if (twoPlayers) players.push(makePlayer(1))
let player = players[0]
// Teclado: no modo de 1 jogador tudo como sempre; com 2, o P1 usa A/D/W/S (G atira) e o P2 as setas (L ou Numpad 1/4 atiram; seta para cima ou Numpad 0 pulam)
const controlSets = twoPlayers
  ? [{ left: ['KeyA'], right: ['KeyD'], down: ['KeyS'], jump: ['Space', 'KeyW'], fire: ['KeyG'] },
     { left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'], jump: ['ArrowUp', 'Numpad0'], fire: ['KeyL', 'Numpad1', 'Numpad4'] }]
  : [{ left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], down: ['ArrowDown', 'KeyS'], jump: ['Space', 'ArrowUp', 'KeyW'], fire: ['KeyG'] }]
const alivePlayers = () => players.filter((p) => !p.fall && p.lives > 0)
// A câmera segue o jogador mais à frente, mas TRAVA quando o de trás chega ao canto esquerdo da tela: o jogo só prossegue quando ele anda.
const focusX = () => { const live = alivePlayers(); return live.length ? Math.max(...live.map((p) => p.x)) : players[0].x }
// Alvo da câmera com 2 jogadores: o líder puxa a tela, mas ela nunca passa do jogador de trás (ele parado no canto esquerdo = tela travada)
const cameraTarget = (lead) => {
  const live = alivePlayers()
  if (live.length < 2) return focusX() - lead
  return Math.min(Math.max(...live.map((p) => p.x)) - lead, Math.min(...live.map((p) => p.x)) - 14)
}
const notice = select('#notice')
const progressText = select('#progress')
const livesText = select('#lives')
const lifeMedals = [...livesText.querySelectorAll('img')]
const playerHud = select('#player-hud')
// Um bloco de HUD (retrato + vidas) por jogador; o do P2 é uma cópia do primeiro ao lado dele, com o retrato em azul
const hudSlots = players.map((p, i) => {
  if (i === 0) return { root: playerHud, medals: lifeMedals, livesEl: livesText, face: '', lives: -1 }
  const root = playerHud.cloneNode(true)
  root.id = 'player-hud-2'
  root.classList.add('p2')
  root.removeAttribute('data-face')
  root.setAttribute('aria-label', 'HUD do jogador 2')
  const livesEl = root.querySelector('.hud-lives')
  livesEl.id = 'lives-2'
  playerHud.after(root)
  return { root, medals: [...livesEl.querySelectorAll('img')], livesEl, face: '', lives: -1 }
})
const bossMeter = select('#boss-health')
const bossHud = select('#boss-hud')
if (heliBoss) {   // no lugar do Cobrador: nome e vida do Oficial
  bossHud.firstChild.textContent = 'OFICIAL DE JUSTIÇA '
  bossHud.classList.add('heli')   // a barra fica no alto, acima do rotor
  bossMeter.max = bossHp
  bossMeter.value = bossHp
  bossMeter.setAttribute('aria-label', 'Vida do Oficial de Justiça')
}
const scoreDisplay = select('#hud-score')
const scoreCtx = scoreDisplay.getContext('2d')
const scoreDigits = [
  [14,17,19,21,25,17,14], [4,12,4,4,4,4,14],
  [14,17,1,2,4,8,31], [30,1,1,14,1,1,30],
  [2,6,10,18,31,2,2], [31,16,16,30,1,1,30],
  [14,16,16,30,17,17,14], [31,1,2,4,8,8,8],
  [14,17,17,14,17,17,14], [14,17,17,15,1,1,14]
]
const scoreColors = ['#fff5ce','#ffdc99','#ffc06b','#ffa54b','#fa883b','#ef6c31','#d44928']
let hudScore = -1
const padStatus = select('#pad-status')
const padSetup = select('#pad-setup')
const padPrompt = select('#pad-prompt')
const padSteps = ['Mova o direcional para a esquerda.', 'Mova o direcional para a direita.', 'Pressione o botão de salto.', 'Pressione o botão de disparo.']
const frameText = select('#frame')
const play = select('#play')
const sprites = {}
// Fase 1 toca o MP3 do <audio>; a Fase 2 toca um MIDI sintetizado por midiplayer.js (com a mesma interface),
// escolhido num seletor no menu e lembrado entre as partidas
const music = stage === 2 ? createMidiPlayer(fase2.musicas[0].arquivo, { volume: .38, mix: fase2.musicas[0].mix }) : select('#music')
select('#music-controls span').textContent = 'BULLETS — CREED'
if (stage === 2) {
  const label = select('#music-controls span')
  const choose = document.createElement('select')
  choose.setAttribute('aria-label', 'Música da fase')
  for (const m of fase2.musicas) choose.add(new Option(m.nome, m.id))
  let saved = null
  try { saved = localStorage.getItem('bulletz-fase2-musica') } catch {}
  const pick = (id) => fase2.musicas.find(m => m.id === id) ?? fase2.musicas[0]
  choose.value = pick(saved).id
  music.setSource(pick(choose.value).arquivo, pick(choose.value).mix)
  choose.onchange = () => {
    try { localStorage.setItem('bulletz-fase2-musica', choose.value) } catch {}
    music.setSource(pick(choose.value).arquivo, pick(choose.value).mix)
  }
  label.replaceChildren(choose)
}
// Seletor de fase no menu: recarrega a página na fase escolhida (mantém os outros parâmetros da URL, como ?debug)
const phaseSelect = select('#phase-select')   // sem ?debug o seletor é removido da página (e continua removido nas trocas de fase)
if (phaseSelect) {
  phaseSelect.value = onTruck ? '2.1' : String(stage)
  phaseSelect.onchange = () => {
    const params = new URLSearchParams(location.search)
    if (phaseSelect.value === '1') params.delete('fase')
    else params.set('fase', phaseSelect.value)
    const query = params.toString()
    location.href = location.pathname + (query ? '?' + query : '')
  }
}
// Ferramentas de teste (links de FX e sprites, atalhos de fase, seletor de fase e botão do final da Fase 2): só na versão local
// (localhost) ou com ?debug. No jogo publicado fica apenas o INICIAR JOGO, e as fases se encadeiam sozinhas.
const devTools = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || new URLSearchParams(location.search).has('debug')
if (!devTools) {
  document.querySelector('.title-links')?.remove()
  document.querySelector('.phase-pick')?.remove()
  document.querySelector('#test-end')?.remove()
  document.querySelector('#test-boss')?.remove()
  document.querySelector('#phone-toggle')?.remove()
  document.querySelector('#menu-phone')?.remove()
  document.querySelector('#dev-panel')?.remove()
} else {
  const phoneNow = document.documentElement.classList.contains('modo-celular')
  document.querySelector('#menu-phone').textContent = 'Modo celular: ' + (phoneNow ? 'ligado' : 'desligado')
  document.querySelector('#phone-toggle').textContent = phoneNow ? 'Modo celular ✓' : 'Modo celular'
  document.querySelector('#menu-phone').onclick = () => setPhoneMode(!document.documentElement.classList.contains('modo-celular'))
  document.querySelector('#phone-toggle').onclick = (event) => { event.preventDefault(); setPhoneMode(!document.documentElement.classList.contains('modo-celular')) }
  document.querySelector('#dev-phone-off').onclick = () => setPhoneMode(false)
  { const nav = document.querySelector('.title-links'), tog = nav.querySelector('.t-tools-toggle')   // ferramentas de teste recolhidas num canto: a tela inicial fica só com a logo e o INICIAR JOGO
    tog.onclick = () => { const open = nav.classList.toggle('open'); tog.setAttribute('aria-expanded', open); tog.blur() } }
  document.querySelector('#dev-test-end').onclick = () => { if (mode === 'play') document.querySelector('#test-end').click() }   // dispara o final da fase em que o Edu está
  document.querySelector('#dev-test-boss').onclick = () => { if (mode === 'play') document.querySelector('#test-boss').click() }
  document.querySelector('#test-boss').onclick = () => { if (onTruck) { announce('A Fase 2.1 não tem boss', 1.6); return } startBossTest(); resumeGame() }
  // "Fase" + "Ir para" (início, boss, final): vale para a tela inicial e para o painel do modo celular
  const alvos = { '1': [['', 'Início da fase'], ['boss', 'Boss (vida no fim)']], '2': [['', 'Início da fase'], ['boss', 'Boss (vida no fim)'], ['fim', 'Final da fase → 2.1']], '2.1': [['', 'Início da fase'], ['fim', 'Final da Fase 2.1']] }
  const faseAtual = onTruck ? '2.1' : String(stage)
  for (const root of document.querySelectorAll('.title-links, .dev-pick')) {
    const fase = root.querySelector('.t-fase'), alvo = root.querySelector('.t-alvo'), jog = root.querySelector('.t-jog')
    if (jog) {   // 1 ou 2 jogadores: recarrega a página com ?jogadores=2 (ou sem)
      jog.value = twoPlayers ? '2' : '1'
      jog.onchange = () => {
        const u = new URL(location.href)
        if (jog.value === '2') u.searchParams.set('jogadores', '2'); else u.searchParams.delete('jogadores')
        try { sessionStorage.setItem('bulletz.skipSelect', '1') } catch {}
        location.href = u.href
      }
    }
    const fill = () => { alvo.replaceChildren(...alvos[fase.value].map(([v, label]) => new Option(label, v))) }
    fase.value = faseAtual
    fill()
    fase.onchange = fill
    root.querySelector('.t-go').onclick = () => {
      const params = new URLSearchParams()
      if (fase.value !== '1') params.set('fase', fase.value)
      if (alvo.value) params.set(alvo.value, '')
      if (twoPlayers) params.set('jogadores', '2')
      try { sessionStorage.setItem('bulletz.skipSelect', '1') } catch {}
      location.href = 'index.html' + (params.toString() ? '?' + params.toString().replace(/=(&|$)/g, '$1') : '')
    }
  }
}
const musicToggle = select('#music-toggle')
const musicVolume = select('#music-volume')
let musicEnabled = true
let musicStarting = false
music.volume = Number(musicVolume.value) / 100

function startMusic() {
  if (!musicEnabled || !music.paused || musicStarting) return
  musicStarting = true
  music.play().catch(() => {}).finally(() => { musicStarting = false })
}

function showMusicState() {
  const playing = !music.paused
  musicToggle.textContent = playing ? 'Pausar trilha' : 'Tocar trilha'
}

music.addEventListener('playing', showMusicState)
music.addEventListener('pause', showMusicState)
musicToggle.onclick = () => {
  musicEnabled = music.paused
  if (musicEnabled) startMusic()
  else music.pause()
}
musicVolume.oninput = () => { music.volume = Number(musicVolume.value) / 100 }

// volume dos efeitos sonoros (lembrado entre sessões); ao soltar o controle toca um golpe para o jogador ouvir o nível
const sfxVolumeInput = select('#sfx-volume')
try { const saved = localStorage.getItem('bulletz.sfxVolume'); if (saved !== null) sfxVolumeInput.value = saved } catch {}
sfx.level = Number(sfxVolumeInput.value) / 100
sfxVolumeInput.oninput = () => {
  sfx.level = Number(sfxVolumeInput.value) / 100
  try { localStorage.setItem('bulletz.sfxVolume', sfxVolumeInput.value) } catch {}
}
sfxVolumeInput.onchange = () => sfx.play('heavyBlast')

function unlockMusic(event) {
  if (event.target.closest?.('#music-controls')) return
  startMusic()
}

window.addEventListener('keydown', unlockMusic)
window.addEventListener('pointerup', unlockMusic)
let soundContext
let shotSound
let deathGruntSound
let deathScreamSound
let pendingShotAt = -Infinity
{
  const kept = window.__bulletzAudio
  if (kept?.soundContext) {
    ;({ soundContext, shotSound, deathGruntSound, deathScreamSound } = kept)
    window.__bulletzAudio = null
  }
}
// Velocidade do som do tiro (1 = original). Mais alto = mais curto e mais agudo.
const shotSoundRate = 2.3
const shotAudioData = fetch('assets/tiro-blaster.wav')
  .then((response) => {
    if (!response.ok) throw new Error('Falha ao carregar o som do tiro.')
    return response.arrayBuffer()
  })
  .catch((error) => { console.warn(error); return null })
const deathAudioData = Promise.all([
  fetch('FX%20SOUND/Death/edu-death-grunt.wav'),
  fetch('FX%20SOUND/Death/edu-death-scream.wav')
]).then(async (responses) => {
  if (responses.some((response) => !response.ok)) throw new Error('Falha ao carregar os sons de morte do Edu.')
  return Promise.all(responses.map((response) => response.arrayBuffer()))
}).catch((error) => { console.warn(error); return [] })

function flushShotSound() {
  if (!shotSound || soundContext?.state !== 'running') return
  const age = performance.now() - pendingShotAt
  pendingShotAt = -Infinity
  if (age > 140) return
  const source = soundContext.createBufferSource()
  source.buffer = shotSound
  source.playbackRate.value = shotSoundRate * (0.94 + Math.random() * 0.12)
  source.connect(soundContext.destination)
  source.start()
}

function enableSound() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext
  if (!AudioEngine) return
  if (!soundContext) {
    soundContext = new AudioEngine()
    sfx.init(soundContext)
    soundContext.addEventListener('statechange', flushShotSound)
    shotAudioData
      .then((data) => data ? soundContext.decodeAudioData(data) : null)
      .then((buffer) => { shotSound = buffer; flushShotSound() })
      .catch((error) => console.warn(error))
    deathAudioData
      .then((sounds) => Promise.all(sounds.map((data) => soundContext.decodeAudioData(data))))
      .then(([grunt, scream]) => { deathGruntSound = grunt; deathScreamSound = scream })
      .catch((error) => console.warn(error))
  }
  if (soundContext.state !== 'running') soundContext.resume().catch(() => {})
}

function playShotSound() {
  if (!soundContext) return
  pendingShotAt = performance.now()
  flushShotSound()
}

if (soundContext) soundContext.addEventListener('statechange', flushShotSound)
window.addEventListener('keydown', enableSound)
window.addEventListener('pointerdown', enableSound)
window.addEventListener('pointerup', enableSound)

// Carregamento: nada é mostrado antes de todas as imagens estarem baixadas e decodificadas. O #loader (CARREGANDO + barra) cobre
// a tela no início, nas trocas de fase (html.booting) e em qualquer troca de tela cuja arte ainda não chegou (html.screen-loading).
const loaderEl = document.querySelector('#loader')
const loadCount = { total: 0, done: 0 }
function showLoadProgress() {
  if (!loaderEl) return
  const pct = loadCount.total ? Math.round(loadCount.done / loadCount.total * 100) : 0
  loaderEl.querySelector('.loader-bar i').style.width = pct + '%'
  loaderEl.querySelector('.loader-pct').textContent = pct + '%'
}
function trackLoad(promise) { loadCount.total++; showLoadProgress(); return promise.finally(() => { loadCount.done++; showLoadProgress() }) }
const decodeImage = (image) => (image.decode ? image.decode().catch(() => {}) : Promise.resolve())
function preloadUrl(url) {
  return trackLoad(new Promise((resolve) => {
    const image = new Image()
    image.onload = () => decodeImage(image).then(resolve)
    image.onerror = () => { console.warn('imagem não carregou:', url); resolve() }
    image.src = url
  }))
}
// espera as <img> de um trecho da página (telas de seleção, botões, HUD) terminarem de baixar e decodificar
function waitImages(root) {
  return Promise.all([...root.querySelectorAll('img')].map((img) => img.complete ? decodeImage(img)
    : new Promise((done) => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }) }).then(() => decodeImage(img))))
}
// imagens usadas pelo style.css (botões em arte, fundos): lidas das próprias regras, para nada aparecer pela metade
function cssImageUrls() {
  const urls = new Set()
  const walk = (rules, base) => {
    for (const rule of rules) {
      if (rule.cssRules) walk(rule.cssRules, base)
      for (const m of (rule.cssText || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        if (/\.(png|webp|jpe?g|gif|svg)(\?|$)/i.test(m[1]) && !m[1].startsWith('data:')) urls.add(new URL(m[1], base).href)
      }
    }
  }
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, sheet.href || location.href) } catch {} }
  return [...urls]
}
// troca de tela: se a arte da próxima tela ainda não chegou, mostra o CARREGANDO por cima até ela estar pronta
function ensureScreenReady(root) {
  if (!root || ![...root.querySelectorAll('img')].some((img) => !img.complete)) return
  const html = document.documentElement
  html.classList.add('screen-loading')
  waitImages(root).then(() => html.classList.remove('screen-loading'))
}
function loadImage(key, url) {
  return trackLoad(new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => { sprites[key] = image; decodeImage(image).then(resolve) }
    image.onerror = () => reject(new Error(url))
    image.src = url
  }))
}

function announce(message, duration) {
  notice.textContent = message
  notice.hidden = false
  noticeUntil = elapsed + duration
}

// Volta um jogador à vida: em x (e no chão) ou, se vier um parceiro, ao lado dele
function respawnPlayer(p, x, y = groundY, grounded = true) {
  Object.assign(p, { x, y, vx: 0, vy: 0, face: 1, grounded, coyote: 0.09, buffer: 0, phase: 0, cooldown: 0, crouch: 0, trigger: false, mover: null,
    fall: null, inv: .9, levelY: groundY, jumpPressed: false, shotTick: 0, idleTime: 0, powerVisual: 0 })
}
function reset(all = true) {
  pendingShotAt = -Infinity
  if (all) {
    respawnX = startX
    zoneIndex = 0
    for (const p of players) p.lives = maxLives
    score = 0
    bossHud.hidden = true
    finish = false
    notice.hidden = true
    keys.clear()
    populateEnemies(respawnX)
    resetWaves()
    resetSuspension()
    resetEnding()
    resetConvoy()
    outSeq = null
    hideGameOver()
  }
  enemyShots.length = 0
  players.forEach((p, i) => { if (all || p.lives > 0) respawnPlayer(p, Math.max(14, respawnX - i * 26)) })   // quem já está fora de jogo continua fora
  camera = onTruck ? clamp(focusX() - cameraLeadNow(), 0, cameraMaxNow()) : Math.max(0, focusX() - walkLead() + 9)
  shots.length = 0
  impacts.length = 0
  sparks.length = 0
  powerUpMotes.length = 0
  droneExplosions.length = 0
  gameFx.clear()
}

// Fase 2.1: ondas de inimigos. Cada onda só começa quando a anterior foi derrotada; os inimigos entram um a um pela borda da tela.
const afterimages = []      // imagens que ficam para trás na investida especial do Fofão: { x, y, face, age }
let fofaoSpecialReadyAt = 9 // quando o próximo especial pode começar (fofaoSpecial.firstAt, mais abaixo, no reinício)
const waveState = { index: 0, pending: [], clearedAt: null }
function resetWaves() {
  weather = 0
  rainAmount = 0
  waveState.index = 0
  waveState.pending.length = 0
  waveState.clearedAt = null
  afterimages.length = 0
  storm.timer = 6; storm.strike = null; storm.flash = 0
  fofaoSpecialReadyAt = elapsed + 9   // o 1º especial só depois de 9 s de fase (fofaoSpecial.firstAt)
  if (onTruck) progressText.textContent = 'ONDA 0 / ' + fase21.waves.length
}
// Tempestade (Fase 2.1, enquanto chove: ondas 3 a 5): de vez em quando, sem hora marcada, um raio cai sobre quem está no andar mais alto (o teto
// do trailer). O símbolo no chão carrega por .76 s (dá tempo de sair dele) e então o raio cai; só conta enquanto alguém está lá em cima, e
// quem acabou de subir tem uns 3,5 s de folga. Quem desce de andar fica a salvo.
const storm = { timer: 6, strike: null, flash: 0 }
const stormStrike = { warn: .76, radius: 20 }
const roofLevel = () => fase21.level.roof
const onRoof = (p) => p.grounded && Math.abs(p.y - roofLevel()) < 3
function updateStorm(dt) {
  storm.flash = Math.max(0, storm.flash - dt * 3.2)
  const st = storm.strike
  if (st) {
    st.t += dt
    if (!st.hit && st.t >= stormStrike.warn) {
      st.hit = true
      storm.flash = 1
      sfx.play('thunder')
      const was = player
      for (const p of alivePlayers()) {
        if (Math.abs(p.levelY - roofLevel()) < 3 && p.y <= roofLevel() + 4 && Math.abs(p.x - st.x) < stormStrike.radius) { player = p; hitPlayer() }
      }
      player = was
    }
    if (st.t > 3) storm.strike = null
    return
  }
  if (finish || endSeq || rainAmount < .25 || rainByWave[Math.min(waveState.index, rainByWave.length - 1)] <= 0) return
  const roofers = alivePlayers().filter(onRoof)
  if (!roofers.length) { storm.timer = Math.max(storm.timer, 3.5); return }
  if ((storm.timer -= dt) > 0) return
  const target = roofers[Math.floor(Math.random() * roofers.length)]
  storm.strike = { x: target.x, floor: target.y, t: 0, hit: false }
  gameFx.lightning({ x: target.x, floor: target.y })
  sfx.play('bossShot', { volume: .6 })   // o carregamento do raio
  storm.timer = (8 + Math.random() * 10) * (1.25 - rainAmount * .5)   // esporádico: de 6 a 22 s; mais seguido quanto mais forte a chuva
}
resetWaves()
function spawnWaveEnemy({ type, level, side }) {
  const drone = type === 'drone' || type === 'heavyDrone'
  const maxX = fase21.bounds[1]
  if (drone) {
    const x = side === 'left' ? camera - 45 : camera + width + 45     // pelas bordas da tela, onde quer que a câmera esteja
    const enemy = createEnemy({ x, type, y: level })
    enemy.followOffset = (side === 'left' ? -1 : 1) * (70 + Math.random()*110)   // fica por perto do Edu, deste lado
    enemy.glideTo = clamp(player.x + enemy.followOffset, 10, 660)                 // entra voando até aqui
    enemy.origin = enemy.glideTo
    enemy.face = side === 'left' ? 1 : -1
    enemies.push(enemy)
  } else {
    // entra pela borda esquerda da tela (por trás da carreta, se a câmera estiver na traseira)
    // andar do jogador já com 5 inimigos: o novo entra em outro andar e fica patrulhando lá (ver maxPerLevel)
    let spawnLevel = level
    if (Math.abs(fase21.level[level] - player.levelY) < 30 && crowdAtPlayerLevel(null) >= maxPerLevel) {
      const others = ['low', 'upper', 'roof'].filter((l) => Math.abs(fase21.level[l] - player.levelY) >= 30)
      spawnLevel = others[Math.floor(Math.random() * others.length)]
    }
    const enemy = createEnemy({ x: Math.max(camera - 45, -45), type, min: -45, max: maxX - 6, y: fase21.level[spawnLevel] })
    enemy.face = 1
    enemy.route = 1
    enemy.delay = 1.3 + Math.random()*.8
    enemies.push(enemy)
  }
}
function updateWaves(dt) {
  const w = waveState
  for (let i = afterimages.length - 1; i >= 0; i--) { afterimages[i].age += dt; if (afterimages[i].age > .3) afterimages.splice(i, 1) }
  // os inimigos acompanham o Edu pela carreta: soldados patrulham em volta dele e os drones voam por perto
  const [minX, maxX] = fase21.bounds
  for (const e of enemies) {
    if (e.hp <= 0) continue
    if (e.kind === 'melee') {   // o Fofão corre pela carreta toda atrás do Edu
      e.min = -45
      e.max = maxX - 6
    } else if (e.kind === 'patrol') {
      // faixa larga em volta do Edu (mais larga que a tela, para quem entra pela borda não ser empurrado para dentro dela)
      e.min = clamp(player.x - 300, -45, maxX - 60)
      e.max = clamp(player.x + 300, 64, maxX - 6)
    } else if (e.followOffset !== undefined) {
      const target = clamp(player.x + e.followOffset, 10, 660)
      if (e.glideTo !== undefined) e.glideTo = target
      else {
        e.origin += (target - e.origin) * Math.min(1, dt * 1.5)
        e.x += (e.origin - e.x) * Math.min(1, dt * 2)
      }
    }
  }
  while (w.pending.length && w.pending[0].at <= elapsed) spawnWaveEnemy(w.pending.shift().spec)
  if (finish || w.pending.length || enemies.some(e => e.hp > 0)) { w.clearedAt = null; return }
  if (w.clearedAt === null) w.clearedAt = elapsed - (w.index === 0 ? 1 : 0)   // a 1ª onda vem mais rápido
  if (elapsed - w.clearedAt < 2.4) return
  const waves = fase21.waves
  if (w.index >= waves.length) {
    finish = true
    startEnding()
    return
  }
  const wave = waves[w.index++]
  progressText.textContent = 'ONDA ' + w.index + ' / ' + waves.length
  announce(wave.name, 1.6)
  w.clearedAt = null
  const specs = [...wave.spawns]
  // com 2 jogadores cada onda traz mais inimigos: metade a mais (arredondando para cima), repetindo os tipos e andares da própria onda, um pouco depois
  if (players.length > 1) {
    const copies = Math.ceil(wave.spawns.length / 2)
    for (let i = 0; i < copies; i++) {
      const base = wave.spawns[(i * 2 + 1) % wave.spawns.length]
      specs.push({ ...base, t: base.t + .9 + Math.random() * .8 })
    }
  }
  for (const spec of specs.sort((a, b) => a.t - b.t)) w.pending.push({ at: elapsed + 1.6 + spec.t, spec })
}

// Fase 2.1: final. A carreta freia (a rua desacelera) até parar com a porta do Vikings Pub; o Edu corre para a frente da carreta e
// espera, depois desce pela frente, anda para fora da tela, aparece "ESTÁGIO CONCLUÍDO" e a tela fecha em cacos de vidro (shatter-wipe)
// de volta para a tela inicial. Durante isso o Edu anda sozinho (endSeq.dir) e o resto da fase fica parado (finish).
const ending = {
  brake: 5.6,         // s para a carreta parar (a velocidade cai com (1 - t/brake)^2: percorre v0*brake/3)
  stopX: 575,         // onde o Edu espera, na carreta (a câmera chega ao fim: 250)
  settle: .9,         // s parado depois da freada, antes de descer
  sidewalkY: 226,     // chão da calçada do pub, para onde ele desce
  doorX: 563,         // centro da porta principal no desenho do pub (unidades desde a esquerda dele; tools/montar_pub.py)
  pubBase: 201,       // y onde a base do pub (e a calçada dele) encosta: onde começa a calçada da rua padrão
  doorOnScreen: 440,  // onde a porta fica na tela de 480 de largura quando a carreta para (logo à frente do nariz da cabine, com a câmera no fim); doorScreenX() ajusta para a largura atual
  bannerAt: 2.7,      // s de faixa até a tela começar a fechar
  wipeEnd: 2.75       // s de transição até voltar à tela inicial
}
// Fim das fases 1 e 2: depois de uma pausa, "ESTÁGIO CONCLUÍDO" e a tela fecha em cacos de vidro; então abre a fase seguinte
// (1 -> 2 -> 2.1), que começa na tela inicial. A recarga da página mantém o resto da URL (?debug etc.).
let outSeq = null
const nextStage = { '1': '2', '2': '2.1' }
const stageOut = { pause: 1.4, bannerAt: 2.7, wipeEnd: 2.75 }
function updateStageOut(dt) {
  const s = outSeq
  s.t += dt
  gameFx.update(dt)   // a fase já parou (finish): o update normal não chega até o fim, então os efeitos andam aqui
  if (!s.banner && s.t >= (s.pause ?? stageOut.pause)) { s.banner = true; s.t = 0; gameFx.banner(); sfx.play('victory') }
  else if (s.banner && !s.wiped && s.t >= stageOut.bannerAt) { s.wiped = true; gameFx.startWipe() }
  else if (s.wiped && gameFx.wipeTime >= stageOut.wipeEnd) {
    outSeq = null
    goToStage(nextStage[onTruck ? '2.1' : String(stage)])   // sem recarregar: a tela cheia continua
  }
}
// Fim da Fase 2: o Edu chega e o controle trava. Três caminhonetes fecham a rua em três faixas do asfalto (de trás para a frente),
// a Carreta Furação entra pela esquerda, atropela as caminhonetes (elas voam para longe) e para ao lado dele. Ele salta no andar
// de baixo, a carreta volta a andar com ele, a câmera acompanha um pouco e ela sai de cena: ESTÁGIO CONCLUÍDO e vai para a Fase 2.1.
const convoyCfg = {
  lanes: [227, 238, 249],        // base (pés/rodas) de cada caminhonete: faixa de trás, do meio e da frente
  offsets: [60, 95, 130],        // x da ponta de cada uma, à frente do Edu
  sheets: ['car09', 'car08', 'car11'],   // as três picapes da folha de carros
  // rodas de cada picape na imagem original [x, y, raio] (px da imagem): são recortadas da própria arte e giram enquanto a picape chega e freia
  wheels: { car09: [[92.5, 104.5, 28], [342.5, 104.5, 28]], car08: [[104, 103, 28], [355, 103, 28]], car11: [[99, 106, 29], [365, 106, 29]] },
  lock: 1.5,                     // s parado, com a câmera abrindo a cena, antes da carreta entrar
  speed: 380,                    // velocidade da carreta ao bater
  settle: .7,                    // s parada antes do Edu subir
  deckX: 15, deckY: 188, deckW: 530,   // andar de baixo da carreta (mesmas medidas do fase2.js)
  rideWait: .6, accel: 300, maxSpeed: 440, followFor: 2.2
}
let convoy = null
const pickupWheelCache = {}
function pickupWheels(sheet) {
  if (!pickupWheelCache[sheet]) {
    const img = sprites[sheet]
    pickupWheelCache[sheet] = convoyCfg.wheels[sheet].map(([cx, cy, r]) => {
      const c = document.createElement('canvas')
      c.width = c.height = Math.ceil(r * 2)
      const g = c.getContext('2d')
      g.beginPath()
      g.arc(r, r, r, 0, Math.PI * 2)
      g.clip()
      g.drawImage(img, r - cx, r - cy)
      return { canvas: c, cx, cy, r }
    })
  }
  return pickupWheelCache[sheet]
}
function convoyTruckWidth() { return sprites.truck.width / pixelScale }
function startConvoy() {
  const c = convoyCfg, px = player.x
  for (const p of players) p.trigger = false
  // quem está na tela e à frente some: a rua fica livre para as caminhonetes e a carreta (o som da colisão continua)
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].x >= camera - 20) enemies.splice(i, 1)
  enemyShots.length = 0
  convoy = {
    phase: 'lock', t: 0, px, v: c.speed, truckX: px - 830, stopX: px - 110, wheel: 0, hits: 0, jump: false, deck: null, decel: null,
    pickups: c.sheets.map((sheet, i) => ({ sheet, x: px + c.offsets[i], y: c.lanes[i], enterAt: .05 + i * .22, hit: false, vx: 0, vy: 0, dy: 0, rot: 0, tilt: 0, age: 0 }))
  }
}
// Teste de boss (só na versão local): o Edu vai para a arena do chefe e a vida dele fica quase no fim
function startBossTest() {
  const x = bossArena + 20
  respawnX = x
  reset(false)
  respawnX = Math.max(...[70, ...checkpoints].filter(c => c <= x))
  boss.hp = Math.min(boss.hp, 3)
  bossMeter.value = boss.hp
}
function resetConvoy() {
  if (convoy?.deck) { const i = movers.indexOf(convoy.deck); if (i >= 0) movers.splice(i, 1) }
  convoy = null
}
function hitPickup(c, p, front) {
  p.hit = true
  c.hits++
  p.vx = c.v * 1.25 + 60 + Math.random() * 90
  p.vy = -(150 + Math.random() * 60)
  p.tilt = .55 + Math.random() * .2   // a ponta de frente empina até uns 30-40 graus e fica assim: nada de girar
  p.age = 0
  c.v *= .94
  gameFx.blast({ x: front, floor: p.y - 4, height: 16 })
  sfx.play(c.hits === convoyCfg.sheets.length ? 'bossDown' : 'heavyBlast')
}
function updateConvoy(dt) {
  const c = convoy, cfg = convoyCfg
  if (c.phase === 'done') return
  c.t += dt
  for (const p of c.pickups) {
    if (!p.hit) continue
    p.x += p.vx * dt
    p.dy += p.vy * dt
    p.vy += 620 * dt
    p.age += dt
    p.rot = p.tilt * (1 - Math.exp(-9 * p.age))
  }
  const move = () => {
    c.truckX += c.v * dt
    c.wheel += c.v / fase21.speed * fase21.wheelSpin * dt
    if (c.deck) { c.deck.dx = c.truckX + cfg.deckX - c.deck.cx; c.deck.cx += c.deck.dx }
  }
  if (c.phase === 'lock') {
    if (c.t >= cfg.lock) { c.phase = 'ram'; c.t = 0 }
  } else if (c.phase === 'ram') {
    move()
    const front = c.truckX + convoyTruckWidth()
    for (const p of c.pickups) if (!p.hit && front >= p.x + 8) hitPickup(c, p, p.x + 8)
    if (c.hits === c.pickups.length) {   // depois da última batida freia até parar ao lado do Edu
      if (c.decel === null) c.decel = c.v * c.v / (2 * Math.max(40, c.stopX - c.truckX))
      c.v = Math.max(0, c.v - c.decel * dt)
      if (c.v === 0 || c.truckX >= c.stopX) { c.v = 0; c.phase = 'settle'; c.t = 0 }
    }
  } else if (c.phase === 'settle') {
    if (c.t >= cfg.settle) {
      c.phase = 'board'; c.t = 0
      c.deck = { cx: c.truckX + cfg.deckX, cy: cfg.deckY, w: cfg.deckW, dx: 0, manual: true }   // o andar de baixo: o Edu salta nele
      movers.push(c.deck)
      c.jump = true
    }
  } else if (c.phase === 'board') {
    if (player.grounded && player.mover === c.deck) { c.phase = 'ride'; c.t = 0 }
    else if (c.t > 3) { c.jump = true; c.t = 1 }   // não pousou: salta de novo
  } else if (c.phase === 'ride' || c.phase === 'exit') {
    if (c.t >= cfg.rideWait) { c.v = Math.min(cfg.maxSpeed, c.v + cfg.accel * dt); move() }
    if (c.phase === 'ride' && c.t >= cfg.followFor) c.phase = 'exit'   // a câmera para de seguir: ela sai de cena
    if (c.phase === 'exit' && c.truckX > camera + width + 40) {
      c.phase = 'done'
      finish = true
      outSeq = { t: 0, banner: false, wiped: false, pause: .3 }
    }
  }
}
function drawConvoy() {
  const c = convoy
  const drawPickup = (p) => {
    const img = sprites[p.sheet], w = img.width / pixelScale, h = img.height / pixelScale
    // durante o 'lock' as caminhonetes chegam dirigindo pela direita e freiam nos lugares (freada suave: ease-out)
    const k = c.phase === 'lock' ? Math.min(1, Math.max(0, (c.t - p.enterAt) / .85)) : 1
    const slide = Math.pow(1 - k, 2) * (width + 240)   // freada: quadrática (a roda não passa de ~115° por quadro, senão parece girar ao contrário)
    const left = Math.round(p.x - camera + slide)
    if (left > width + 260 || left + w < -260) return
    ctx.save()
    ctx.translate(left + w / 2, p.y + p.dy - h / 2)
    ctx.rotate(p.rot)
    ctx.scale(-1, 1)   // viradas para o Edu
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    // rodas girando: o giro acompanha o quanto a picape já andou na entrada, então é rápido no começo e vai diminuindo até parar na freada
    for (const wheel of pickupWheels(p.sheet)) {
      const rA = wheel.r / pixelScale
      ctx.save()
      ctx.translate(-w / 2 + wheel.cx / pixelScale, -h / 2 + wheel.cy / pixelScale)
      ctx.rotate(((width + 240) - slide) / rA)
      ctx.drawImage(wheel.canvas, -rA, -rA, rA * 2, rA * 2)
      ctx.restore()
    }
    ctx.restore()
  }
  for (const p of c.pickups) if (!p.hit) drawPickup(p)
  const img = sprites.truck, h = img.height / pixelScale, left = Math.round(c.truckX - camera), top = groundY + 4 - h
  if (left < width && left + convoyTruckWidth() > 0) {
    ctx.drawImage(img, left, top, convoyTruckWidth(), h)
    drawWheelsAt(left, top, c.wheel)
  }
  for (const p of c.pickups) if (p.hit) drawPickup(p)
}
// Medidas da 2.1 pensadas para a tela larga (480), ajustadas à largura atual: a câmera acaba mostrando o mesmo trecho depois da cabine
const cameraMaxNow = () => fase21.cameraMax + wideWidth - width
const cameraLeadNow = () => Math.round(fase21.cameraLead * width / wideWidth)
const doorScreenX = () => ending.doorOnScreen - (wideWidth - width)
function startEnding() {
  const v0 = roadSpeed
  endSeq = { phase: 'brake', t: 0, v0, dir: 0, free: false, roadEnd: roadPos + v0 * ending.brake / 3, wiped: false }
  for (const p of players) p.trigger = false
}
function resetEnding() {
  roadPos = 0
  roadSpeed = onTruck ? fase21.speed : 0
  wheelAngle = 0
  endSeq = null
  if (endGround) { platforms.splice(platforms.indexOf(endGround), 1); endGround = null }
}
function updateEnding(dt) {
  const s = endSeq
  s.t += dt
  if (s.phase === 'brake') {
    const k = Math.min(1, s.t / ending.brake)
    roadSpeed = s.v0 * (1 - k) * (1 - k)
    s.dir = player.x < ending.stopX - 4 ? 1 : 0   // corre até a frente e fica parado
    if (k >= 1) { roadSpeed = 0; s.phase = 'settle'; s.t = 0; suspension.v += 60 }   // um tranco ao parar
  } else if (s.phase === 'settle') {
    s.dir = player.x < ending.stopX - 4 ? 1 : 0
    if (s.t >= ending.settle && s.dir === 0) {
      s.phase = 'exit'; s.t = 0; s.free = true
      endGround = [-600, ending.sidewalkY, 3000, true]   // a calçada, invisível: ele desce da carreta para ela
      platforms.push(endGround)
    }
  } else if (s.phase === 'exit') {
    s.dir = 1
    if (player.x - camera > width + 30) { s.phase = 'banner'; s.t = 0; s.dir = 0; gameFx.banner(); sfx.play('victory') }
  } else if (s.phase === 'banner') {
    if (!s.wiped && s.t >= ending.bannerAt) { s.wiped = true; gameFx.startWipe() }
    if (s.wiped && gameFx.wipeTime >= ending.wipeEnd) {
      reset(true)       // volta tudo ao começo da fase e mostra a tela inicial
      setMode('title')
    }
  }
}
// O pub entra pela direita junto com a rua e, quando a carreta para, a porta fica na frente da cabine.
// Posição da câmera em que a borda direita do pub encosta na borda direita da tela
function pubCameraEnd() {
  return doorScreenX() - ending.doorX + sprites.pub.width / pixelScale + cameraMaxNow() - width
}
function drawPub() {
  const img = sprites.pub, w = img.width / pixelScale, h = img.height / pixelScale
  const doorFinal = doorScreenX() - ending.doorX                     // x do pub com a carreta parada e a câmera no fim
  const x = Math.round(doorFinal + (endSeq.roadEnd + cameraMaxNow()) - (roadPos + camera))
  if (x < width && x + w > 0) ctx.drawImage(img, x, ending.pubBase - h, w, h)
}
// Fase 2.1: amortecimento da carreta. Uma mola amortecida segura o corpo da carreta; de tempos em tempos um solavanco
// (buraco na pista) dá um empurrão e ele balança até parar. Só o desenho se mexe (carreta, Edu, inimigos, tiros);
// a lógica do jogo e o cenário ao fundo ficam parados.
const suspension = { y: 0, v: 0, next: 2.2, offset: 0 }
function updateSuspension(dt) {
  const s = fase21.suspension
  suspension.next -= dt * Math.min(1, roadSpeed / fase21.speed)   // parada, a carreta não pega mais buracos
  if (suspension.next <= 0) {
    const [minGap, maxGap] = s.bumpEvery, [minKick, maxKick] = s.kick
    suspension.v += (minKick + Math.random() * (maxKick - minKick)) * (Math.random() < .7 ? 1 : -.6)   // mais afundando que subindo
    suspension.next = minGap + Math.random() * (maxGap - minGap)
  }
  for (let i = 0; i < 3; i++) {   // 3 passos por quadro mantêm a mola estável
    const step = dt / 3
    suspension.v += (-s.stiffness * suspension.y - s.damping * suspension.v) * step
    suspension.y += suspension.v * step
  }
  suspension.offset = Math.round(suspension.y)
}
function resetSuspension() { suspension.y = suspension.v = suspension.offset = 0; suspension.next = 2.2 }

function setKey(key, active) {
  if (active && !keys.has(key)) for (const p of players) if (controlSets[p.idx].jump.includes(key)) p.jumpPressed = true
  if (active) keys.add(key)
  else keys.delete(key)
}

// Telas: 'title' (logo + INICIAR JOGO), 'play' (jogando) e 'menu' (pausa com as informações, no ESC)
const titleScreen = select('#title-screen')
const selectScreen = select('#select-screen')
const playersScreen = select('#players-screen')
const menuScreen = select('#menu')
const fullscreenToggle = select('#fullscreen-toggle')
let mode = 'title'
let wantFullscreen = !!document.fullscreenElement   // numa troca de fase a tela cheia continua
let fullscreenExitAt = -Infinity
let fullscreenRequestAt = -Infinity

function setMode(next) {
  mode = next
  document.body.dataset.mode = next
  titleScreen.hidden = next !== 'title'
  selectScreen.hidden = next !== 'select'
  playersScreen.hidden = next !== 'players'
  menuScreen.hidden = next !== 'menu'
  ensureScreenReady({ title: titleScreen, select: selectScreen, players: playersScreen, menu: menuScreen }[next])
  if (next === 'title') hideGameOver()
  keys.clear()
  for (const p of players) p.jumpPressed = false
}
function enterFullscreen() {
  const root = document.documentElement
  if (document.fullscreenElement || !root.requestFullscreen) return
  fullscreenRequestAt = performance.now()
  root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
}
// A seleção de personagem vem depois do INICIAR JOGO (só na versão de teste). Fica de fora nas trocas de fase, nos atalhos de teste
// (?fase, ?boss, ?fim) e quando a página foi recarregada pelos seletores do modo de teste.
let selectDone = false
let playersDone = false   // 1 ou 2 jogadores (vem antes da escolha de personagem)
let selectReturn = 'play'
function startGame() {
  if (mode !== 'title') return
  if (!playersDone) { openPlayers(); return }
  if (!selectDone) { selectReturn = 'play'; openSelect(); return }
  beginPlay()
}
function beginPlay() {
  wantFullscreen = true
  enterFullscreen()
  setMode('play')
  startMusic()
  game.focus()
}
function openMenu() {
  if (mode !== 'play') return
  setMode('menu')
  select('#resume').focus()
}
function resumeGame() {
  if (mode !== 'menu') return
  if (wantFullscreen) enterFullscreen()
  setMode('play')
  game.focus()
}
function showFullscreenState() {
  fullscreenToggle.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'
}

select('#start').onclick = startGame
// SAIR (menu de pausa): volta para a tela de abertura, na Fase 1, sem sair da tela cheia
select('#exit-menu').onclick = () => goToStage(null, { autostart: false })
// Botão de teste do menu: abre a Fase 2 direto na cena final (caminhonetes, carreta, ESTÁGIO CONCLUÍDO) e segue para a 2.1, sem sair da tela cheia
// Botão de teste do menu: dispara o final da fase em que o Edu está (1 → 2, 2 → 2.1 ou o final da 2.1), no ponto onde ele está
if (select('#test-end')) {
  const testEnd = select('#test-end')
  testEnd.textContent = onTruck ? 'Teste: final da Fase 2.1' : stage === 2 ? 'Teste: final da Fase 2 → 2.1' : 'Teste: final da Fase 1 → 2'
  testEnd.onclick = () => {
    if (finish || convoy || endSeq || outSeq || players.every((p) => p.lives === 0)) return
    resumeGame()
    finish = true
    if (onTruck) startEnding()
    else if (stage === 2) startConvoy()
    else outSeq = { t: 0, banner: false, wiped: false, pause: .3 }
  }
}
// iPhone/iPod: o Safari não tem API de tela cheia; só abrindo pelo ícone da Tela de Início (modo app) o jogo ocupa a tela toda
{
  const iphone = /iPhone|iPod/.test(navigator.userAgent)
  const standalone = navigator.standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
  if (!document.documentElement.requestFullscreen) fullscreenToggle.hidden = true
  if (iphone && !standalone) select('#ios-hint').hidden = false
}
select('#resume').onclick = resumeGame
select('#touch-menu').onclick = openMenu
fullscreenToggle.onclick = () => {
  if (document.fullscreenElement) {
    wantFullscreen = false
    document.exitFullscreen().catch(() => {})
  } else {
    wantFullscreen = true
    enterFullscreen()
  }
}
document.addEventListener('fullscreenchange', () => {
  showFullscreenState()
  if (document.fullscreenElement) return
  // O navegador usa o ESC para sair da tela cheia; nesse caso abrimos o menu
  fullscreenExitAt = performance.now()
  openMenu()
})
// Pausa ao trocar de aba; alguns navegadores ocultam a página por um instante ao entrar em tela cheia
document.addEventListener('visibilitychange', () => {
  if (document.hidden && performance.now() - fullscreenRequestAt > 1500) openMenu()
})

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    event.preventDefault()
    if (performance.now() - fullscreenExitAt < 400) return
    if (mode === 'play') openMenu()
    else if (mode === 'menu') resumeGame()
    return
  }
  if (mode === 'title' && (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') && !event.target.closest?.('button, a')) {
    event.preventDefault()
    startGame()
  }
}, true)

window.addEventListener('keydown', (event) => {
  if (mode !== 'play') return
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('button,select,a')) return
  if (keyboard.has(event.code)) {
    event.preventDefault()
    setKey(event.code,true)
  }
  if (event.code === 'KeyR') reset()
})
window.addEventListener('keyup', (event) => setKey(event.code,false))
window.addEventListener('blur', () => { keys.clear(); for (const p of players) p.jumpPressed = false })
game.addEventListener('pointerdown', () => game.focus())
for (const button of document.querySelectorAll('[data-key]')) {
  const key = button.dataset.key
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    button.setPointerCapture(event.pointerId)
    setKey(key,true)
  })
  for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, () => setKey(key,false))
}
select('#reset').onclick = () => { reset(); resumeGame() }

// Controle de celular em pé (imagem embaixo da tela): o direcional lê a posição do dedo (esquerda/direita/baixo/cima = saltar,
// com diagonais e deslizando sem levantar), A salta, B atira (botões com data-key, tratados acima), START abre/fecha o menu
// e SELECT liga a tela cheia. Cada botão acende ao ser tocado.
{
  const dpad = select('#pad-dpad')
  const glows = Object.fromEntries([...document.querySelectorAll('.pad-glow')].map(g => [g.dataset.dir, g]))
  const dirKeys = { left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', up: 'ArrowUp' }
  let held = new Set(), pointer = null
  function dpadSet(next) {
    for (const d of Object.keys(dirKeys)) {
      const on = next.has(d)
      if (on !== held.has(d)) { setKey(dirKeys[d], on); glows[d].classList.toggle('on', on) }
    }
    held = next
  }
  function dpadRead(event) {
    const r = dpad.getBoundingClientRect()
    const dx = (event.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (event.clientY - (r.top + r.height / 2)) / (r.height / 2)
    const next = new Set()
    if (dx < -.3) next.add('left'); else if (dx > .3) next.add('right')
    if (dy > .35) next.add('down'); else if (dy < -.35) next.add('up')
    dpadSet(next)
  }
  dpad.addEventListener('pointerdown', (event) => { event.preventDefault(); pointer = event.pointerId; dpad.setPointerCapture(pointer); dpadRead(event) })
  dpad.addEventListener('pointermove', (event) => { if (event.pointerId === pointer) dpadRead(event) })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) dpad.addEventListener(type, (event) => { if (event.pointerId === pointer) { pointer = null; dpadSet(new Set()) } })
  for (const button of document.querySelectorAll('.pad [data-key], #pad-start, #pad-select')) {
    button.addEventListener('pointerdown', () => button.classList.add('on'))
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => button.classList.remove('on'))
  }
  select('#pad-start').onclick = () => { if (mode === 'title') startGame(); else if (mode === 'play') openMenu(); else resumeGame() }
  select('#pad-select').onclick = () => fullscreenToggle.click()
  select('#pad').addEventListener('contextmenu', (event) => event.preventDefault())
}

function setPlaying(value) {
  previewPlaying = value
  play.textContent = value ? 'Pausar' : 'Reproduzir'
  play.setAttribute('aria-pressed', String(value))
}
play.onclick = () => setPlaying(!previewPlaying)
select('#speed').onchange = (event) => {
  fps = Number(event.target.value)
  select('#rate').textContent = fps + ' QPS'
}
select('.timeline').replaceChildren()
const frameButtons = Array.from({length:8}, (_, i) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = String(i + 1)
  button.setAttribute('aria-label', 'Ver quadro ' + (i + 1))
  button.onclick = () => { setPlaying(false); previewFrame = i; previewTime = i }
  select('.timeline').append(button)
  return button
})
select('#sequence').onchange = (event) => {
  const wasBreathing = previewSequence === 'idle'
  previewSequence = event.target.value
  previewFrame = previewTime = 0
  readFrame = -1
  if (wasBreathing || previewSequence === 'idle') {
    fps = previewSequence === 'idle' ? breathingFps : 12
    select('#speed').value = String(fps)
    select('#rate').textContent = fps + ' QPS'
  }
  const { file, count } = sequences[previewSequence]
  frameButtons.forEach((button, i) => { button.hidden = i >= count })
  select('.timeline').hidden = count === 1
  select('.playback').hidden = count === 1
  select('#rate').hidden = count === 1
  select('.download').href = 'assets/' + file
  select('#frame-info').textContent = count === 1
    ? '1 quadro · 96 × 96 px · PNG'
    : count + ' quadros · células de 96 × 96 px · PNG'
}

function active(...codes) { return codes.some((code) => keys.has(code)) }
function clamp(value,min,max) { return Math.max(min,Math.min(max,value)) }

function setPadStatus(state, message) {
  if (padStatus.dataset.state === state) return
  padStatus.dataset.state = state
  padStatus.textContent = message
}

function savedProfile(id) {
  try {
    const profile = JSON.parse(localStorage.getItem('cascata:controle:' + id))
    return Array.isArray(profile) && profile.length === padSteps.length ? profile : null
  } catch { return null }
}

function stopCalibration() {
  calibration = null
  padSetup.textContent = 'Configurar controle'
  padPrompt.hidden = true
}

padSetup.onclick = () => {
  if (calibration) { stopCalibration(); return }
  calibration = { bindings: [], baseline: null, held: null }
  padSetup.textContent = 'Cancelar'
  padPrompt.hidden = false
  padPrompt.textContent = 'Solte todos os botões e deixe o analógico no centro.'
}

function bindingAmount(pad, binding, deadzone = stickDeadzone) {
  if (binding.type === 'button') return Number(Boolean(pad.buttons[binding.index]?.pressed))
  const value = pad.axes[binding.index]
  if (!Number.isFinite(value)) return 0
  const distance = (value - binding.rest) * binding.sign
  const range = Math.max(0.8, Math.abs(binding.peak - binding.rest))
  return clamp((distance - deadzone) / (range - deadzone), 0, 1)
}

function calibrate(pad, dt) {
  const setup = calibration
  setup.warmup = (setup.warmup ?? 0) + dt
  if (setup.warmup < .65) return
  if (!setup.baseline) {
    setup.baseline = [...pad.axes]
    padPrompt.textContent = padSteps[0]
    return
  }
  if (setup.held) {
    if (bindingAmount(pad, setup.held, .26) > 0) return
    const binding = setup.held
    setup.held = null
    const used = setup.bindings.some((item) => item.type === binding.type && item.index === binding.index && item.sign === binding.sign)
    if (used) {
      padPrompt.textContent = 'Comando já usado. ' + padSteps[setup.bindings.length]
      return
    }
    setup.bindings.push(binding)
    if (setup.bindings.length === padSteps.length) {
      padProfile = setup.bindings
      try { localStorage.setItem('cascata:controle:' + pad.id, JSON.stringify(padProfile)) } catch {}
      stopCalibration()
      game.focus()
      return
    }
    padPrompt.textContent = padSteps[setup.bindings.length]
    return
  }
  const button = pad.buttons.findIndex((item) => item.pressed)
  if (button >= 0) setup.held = { type: 'button', index: button }
  else if (setup.bindings.length < 2) {
    const index = pad.axes.findIndex((value, i) => Math.abs(value - setup.baseline[i]) > .55)
    if (index >= 0) setup.held = { type: 'axis', index, rest: setup.baseline[index], peak: pad.axes[index], sign: Math.sign(pad.axes[index] - setup.baseline[index]) }
  }
  if (setup.held) padPrompt.textContent = 'Solte o comando para continuar.'
}

function readPad(dt) {
  let devices = []
  if (canReadPads) {
    try {
      devices = Array.from(navigator.getGamepads())
    } catch (error) {
      if (error.name !== 'SecurityError') throw error
      canReadPads = false
    }
  }
  const pads = devices.filter((pad) => pad?.connected)
  const pad = pads.find((device) => device.index === padIndex) ?? pads[0]
  padSetup.hidden = !pad
  if (!pad) {
    padIndex = null
    padId = null
    padJumpHeld = padStartHeld = false
    if (calibration) stopCalibration()
    if (!canReadPads) setPadStatus('unavailable', 'Controle indisponível nesta página. Abra o jogo em uma aba do navegador.')
    else setPadStatus('waiting', 'Nenhum controle detectado. Conecte-o e pressione um botão.')
    return neutralPad
  }

  if (pad.index !== padIndex || pad.id !== padId) {
    padIndex = pad.index
    padId = pad.id
    padProfile = savedProfile(padId)
    padJumpHeld = padStartHeld = false
    if (calibration) stopCalibration()
  }
  if (padProfile) setPadStatus('configured', 'Controle conectado · configuração personalizada')
  else if (pad.mapping === 'standard') setPadStatus('connected', 'Controle conectado · mapeamento padrão')
  else setPadStatus('generic', 'Controle genérico detectado · configure se os comandos estiverem trocados')

  if (calibration) { calibrate(pad, dt); return neutralPad }
  if (document.hidden) return neutralPad
  const pressed = (button) => Boolean(pad.buttons[button]?.pressed)
  const jumpHeld = padProfile ? bindingAmount(pad, padProfile[2]) > 0 : pressed(padButtons.south)
  const fireHeld = padProfile ? bindingAmount(pad, padProfile[3]) > 0 : pressed(pad.buttons.length > 2 ? padButtons.west : 1)
  const startUsed = padProfile?.some((binding) => binding.type === 'button' && binding.index === padButtons.start)
  const startHeld = !startUsed && pressed(padButtons.start)
  const left = pressed(padButtons.left)
  const right = pressed(padButtons.right)
  const raw = pad.axes[0] ?? 0
  const stick = Math.abs(raw) <= 1 ? raw : 0
  const analog = Math.sign(stick) * Math.max(0, (Math.abs(stick) - stickDeadzone) / (1 - stickDeadzone))
  const direction = padProfile
    ? bindingAmount(pad, padProfile[1]) - bindingAmount(pad, padProfile[0])
    : left || right ? Number(right) - Number(left) : analog
  const input = {
    direction,
    jump: jumpHeld && !padJumpHeld,
    fire: fireHeld,
    crouch: pressed(padButtons.down) || (pad.axes[1] > .64 && pad.axes[1] <= 1 && Math.abs(stick) < .5),
    restart: startHeld && !padStartHeld
  }
  padJumpHeld = jumpHeld
  padStartHeld = startHeld
  return input
}

// ---- Selecionar personagem (só na versão de teste, antes da tela do INICIAR JOGO)
// Dois personagens: o Edu e o Operativo. O P1 escolhe e, com 2 jogadores, o P2 fica com o outro. Por enquanto os dois usam o sprite do Edu
// em jogo (o P2 em azul); a escolha troca o retrato do HUD e fica guardada na sessão para as próximas fases.
const characters = ['edu', 'operativo']
const portraitSources = { neutral: 'p2-neutro', shout: 'p2-grito', pain: 'p2-dor', blink: 'p2-piscada', left: 'p2-neutro', right: 'p2-neutro', up: 'p2-neutro' }
function setHudCharacter(slot, character) {
  for (const img of slot.root.querySelectorAll('.hud-portrait img')) {
    img.dataset.orig ??= img.getAttribute('src')
    const key = [...img.classList].find((n) => n.startsWith('portrait-'))?.slice(9)
    img.src = character === 'operativo' ? 'assets/selecionar/' + (portraitSources[key] ?? 'p2-neutro') + '.png?v=2' : img.dataset.orig
  }
}
let chosenP1 = 0
try {
  const saved = JSON.parse(sessionStorage.getItem('bulletz.chars') ?? 'null')
  if (Array.isArray(saved) && characters.includes(saved[0])) chosenP1 = characters.indexOf(saved[0])
} catch {}
function applyCharacters() {
  players.forEach((p, i) => {
    p.character = characters[i === 0 ? chosenP1 : 1 - chosenP1]
    setHudCharacter(hudSlots[i], p.character)
  })
  try { sessionStorage.setItem('bulletz.chars', JSON.stringify(players.map((p) => p.character))) } catch {}
}
const selectCards = [...selectScreen.querySelectorAll('.select-card')]
// Tela "Escolher jogadores" (depois do INICIAR JOGO): 1 ou 2. Mudar o número recarrega a página com ?jogadores=2 (ou sem) e segue para a escolha de personagem.
const playersCards = [...playersScreen.querySelectorAll('.players-card')]
let playersSel = twoPlayers ? 1 : 0
let playersOpenedAt = 0
function renderPlayers() {
  playersCards.forEach((card, i) => { card.classList.toggle('sel', i === playersSel); card.setAttribute('aria-checked', String(i === playersSel)) })
}
function openPlayers() {
  playersOpenedAt = performance.now()
  playersSel = twoPlayers ? 1 : 0
  renderPlayers()
  setMode('players')
}
function movePlayers(step) {
  playersSel = (playersSel + step + 2) % 2
  renderPlayers()
  sfx.play('checkpoint', { volume: .25 })
}
function confirmPlayers() {
  if (performance.now() - playersOpenedAt < 350) return
  if ((playersSel === 1) === twoPlayers) { playersDone = true; selectReturn = 'play'; openSelect(); return }
  const u = new URL(location.href)
  if (playersSel === 1) u.searchParams.set('jogadores', '2'); else u.searchParams.delete('jogadores')
  try { sessionStorage.setItem('bulletz.afterPlayers', '1') } catch {}
  document.documentElement.classList.add('screen-loading')   // CARREGANDO enquanto a página recarrega com o novo número de jogadores
  location.href = u.href
}
playersScreen.querySelector('.select-go').addEventListener('click', () => { if (mode === 'players') confirmPlayers() })
playersCards.forEach((card, i) => {
  card.addEventListener('mouseover', () => { if (mode === 'players' && playersSel !== i) { playersSel = i; renderPlayers() } })
  card.addEventListener('click', () => { if (mode !== 'players') return; playersSel = i; confirmPlayers() })
})
window.addEventListener('keydown', (event) => {
  if (mode !== 'players' || event.altKey || event.ctrlKey || event.metaKey) return
  if (event.code === 'Escape') setMode('title')
  else if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(event.code)) movePlayers(-1)
  else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(event.code)) movePlayers(1)
  else if (['Enter', 'NumpadEnter', 'Space', 'KeyG', 'KeyL'].includes(event.code)) confirmPlayers()
  else return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

// Com 2 jogadores a escolha tem 2 etapas: o P1 escolhe e o P2 fica só com o que sobrou (não pode repetir). Com 1 jogador, só o P1 escolhe.
let selPhase = 0
const freeIndex = () => characters.findIndex((_, i) => i !== chosenP1)
function renderSelect() {
  const two = players.length > 1
  selectCards.forEach((card, i) => {
    const taken = two && selPhase === 1 && i === chosenP1
    const onP2 = two && (selPhase === 1 ? i === freeIndex() : i !== chosenP1)
    card.classList.toggle('sel', two && selPhase === 0 ? true : selPhase === 0 ? i === chosenP1 : i === freeIndex())   // com 2 jogadores as duas fotos ficam acesas; a seta só troca P1 e P2
    card.classList.toggle('taken', taken)
    card.setAttribute('aria-checked', String(selPhase === 0 ? i === chosenP1 : i === freeIndex()))
    card.toggleAttribute('data-p1', two ? i === chosenP1 : false)
    card.toggleAttribute('data-p2', onP2)
  })
}
let selectOpenedAt = 0
function openSelect() {
  selectOpenedAt = performance.now()
  selPhase = 0
  renderSelect()
  setMode('select')
}
function moveSelect(step) {
  if (selPhase === 1) return   // o P2 só tem o personagem que sobrou
  chosenP1 = (chosenP1 + step + characters.length) % characters.length
  renderSelect()
  sfx.play('checkpoint', { volume: .25 })
}
function confirmSelect() {
  if (performance.now() - selectOpenedAt < 350) return   // o mesmo toque que abriu a tela não confirma
  if (players.length > 1 && selPhase === 0 && characters.length > 2) { selPhase = 1; renderSelect(); sfx.play('checkpoint', { volume: .25 }); return }
  applyCharacters()
  selPhase = 0
  if (selectReturn === 'play') { selectDone = true; setMode('title'); beginPlay() }
  else setMode('title')
}
selectScreen.querySelector('.select-go').addEventListener('click', () => { if (mode === 'select') confirmSelect() })
selectCards.forEach((card, i) => {
  card.addEventListener('mouseover', () => { if (mode === 'select' && selPhase === 0 && chosenP1 !== i) { chosenP1 = i; renderSelect() } })
  card.addEventListener('click', () => {
    if (mode !== 'select') return
    if (selPhase === 1) { if (i === freeIndex()) confirmSelect(); return }
    chosenP1 = i; confirmSelect()
  })
})
window.addEventListener('keydown', (event) => {
  if (mode !== 'select' || event.altKey || event.ctrlKey || event.metaKey) return
  if (event.code === 'Escape') { if (selPhase === 1) { selPhase = 0; renderSelect() } else { if (selectReturn === 'play') playersDone = false; setMode('title') } }   // ESC na escolha de personagem volta ao título (e à escolha de jogadores)
  else if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(event.code)) moveSelect(-1)
  else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(event.code)) moveSelect(1)
  else if (['Enter', 'NumpadEnter', 'Space', 'KeyG', 'KeyL'].includes(event.code)) confirmSelect()
  else return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)
let selectPadDir = 0
function selectPadInput(pad) {
  const dir = Math.abs(pad.direction) > .5 ? Math.sign(pad.direction) : 0
  const players = mode === 'players'
  if (dir && dir !== selectPadDir) { if (players) movePlayers(dir); else moveSelect(dir) }
  selectPadDir = dir
  if (pad.jump || pad.restart) { if (players) confirmPlayers(); else confirmSelect() }
}
applyCharacters()
renderSelect()

// Menu de pausa: com 2 jogadores, lembra quem usa o quê
if (twoPlayers) {
  const keysBox = document.querySelector('#menu .keys')
  const note = document.createElement('p')
  note.className = 'two-players-note'
  note.innerHTML = '<b>2 JOGADORES</b> · P1 (laranja): <kbd>A</kbd> <kbd>D</kbd> mover, <kbd>W</kbd>/<kbd>Espaço</kbd> pular, <kbd>S</kbd> agachar, <kbd>G</kbd> atirar · P2 (azul): <kbd>←</kbd> <kbd>→</kbd> mover, <kbd>↑</kbd>/<kbd>Num 0</kbd> pular, <kbd>↓</kbd> agachar, <kbd>L</kbd>/<kbd>Num 1</kbd>/<kbd>Num 4</kbd> atirar · o 1º controle é do P1 e o 2º do P2'
  keysBox?.after(note)
}
// Segundo controle (jogador 2): o primeiro controle é do P1 (readPad); o próximo conectado é do P2, no mapeamento padrão
let pad2JumpHeld = false
let pad2StartHeld = false
function readPad2() {
  let devices = []
  if (canReadPads) { try { devices = Array.from(navigator.getGamepads()) } catch { canReadPads = false } }
  const pad = devices.filter((d) => d?.connected && d.index !== padIndex)[0]
  if (!pad || document.hidden) { pad2JumpHeld = pad2StartHeld = false; return neutralPad }
  const pressed = (button) => Boolean(pad.buttons[button]?.pressed)
  const jumpHeld = pressed(padButtons.south)
  const fireHeld = pressed(pad.buttons.length > 2 ? padButtons.west : 1)
  const startHeld = pressed(padButtons.start)
  const left = pressed(padButtons.left), right = pressed(padButtons.right)
  const raw = pad.axes[0] ?? 0
  const stick = Math.abs(raw) <= 1 ? raw : 0
  const analog = Math.sign(stick) * Math.max(0, (Math.abs(stick) - stickDeadzone) / (1 - stickDeadzone))
  const input = {
    direction: left || right ? Number(right) - Number(left) : analog,
    jump: jumpHeld && !pad2JumpHeld,
    fire: fireHeld,
    crouch: pressed(padButtons.down) || (pad.axes[1] > .64 && pad.axes[1] <= 1 && Math.abs(stick) < .5),
    restart: startHeld && !pad2StartHeld
  }
  pad2JumpHeld = jumpHeld
  pad2StartHeld = startHeld
  return input
}

function updateMovers() {
  for (const m of movers) {
    if (m.manual) continue   // controlado por script (andar da carreta no fim da Fase 2)
    const t = .5 - .5*Math.cos(elapsed*Math.PI*2/m.period + m.phase)
    const nx = m.x + m.ax*t
    const ny = m.y + m.ay*t
    m.dx = m.cx === undefined ? 0 : nx - m.cx
    m.cx = nx
    m.cy = ny
  }
}

// Fora do jogo (título ou menu): só a prévia de animação e o controle continuam respondendo
function updatePaused(dt) {
  if (previewPlaying) {
    previewTime = (previewTime + dt * fps) % sequences[previewSequence].count
    previewFrame = Math.floor(previewTime)
  }
  const pad = readPad(dt)
  if (mode === 'select' || mode === 'players') { selectPadInput(pad); return }
  if (mode === 'menu') { if (menuPadInput(pad)) return }   // no menu de pausa o controle anda pelos botões
  else if (pad.jump && mode === 'title') { startGame(); return }
  if (!pad.restart) return
  if (mode === 'title') startGame()
  else resumeGame()
}

// Teste do final da 2.1: index.html?fase=2.1&fim pula as ondas e começa direto na freada até o Vikings Pub
const testEnding = onTruck && new URLSearchParams(location.search).has('fim')
// Teste do final da Fase 2: index.html?fase=2&fim começa direto na cena das caminhonetes e da carreta
const testConvoy = stage === 2 && !onTruck && new URLSearchParams(location.search).has('fim')
function update(dt) {
  elapsed += dt
  if (testEnding && !finish && !endSeq) { finish = true; startEnding() }
  updateMovers()
  if (testConvoy && !finish && !convoy) { finish = true; startConvoy() }
  if (convoy) updateConvoy(dt)
  if (farHeli) {
    if ((farHeli.delay -= dt) <= 0) farHeli.sx += 330 * dt   // rápido, da esquerda para a direita
    if (farHeli.sx > width + 190) farHeli = null
  }
  if (outSeq) updateStageOut(dt)
  if (onTruck) {
    if (endSeq) updateEnding(dt)
    const wi = Math.min(waveState.index, weatherByWave.length - 1)
    weather += (weatherByWave[wi] - weather) * Math.min(1, dt * .35)   // muda devagar, em uns 6-8 s depois de cada onda
    const rainTarget = rainByWave[wi]
    rainAmount += (rainTarget - rainAmount) * Math.min(1, dt * (rainTarget > rainAmount ? .4 : .22))   // sobe em uns 5-8 s e some mais devagar ainda
    gameFx.updateRain(dt)
    if (!endSeq) updateStorm(dt)
    roadPos += roadSpeed * dt
    wheelAngle += roadSpeed / fase21.speed * fase21.wheelSpin * dt
    updateSuspension(dt)
  }
  if (elapsed > noticeUntil) notice.hidden = true
  if (previewPlaying) {
    previewTime = (previewTime + dt * fps) % sequences[previewSequence].count
    previewFrame = Math.floor(previewTime)
  }
  const pad = readPad(dt)
  const pad2 = players.length > 1 ? readPad2() : null
  if (!gameOverScreen.hidden) { menuPadInput(pad); return }
  if (pad.restart || pad2?.restart) {
    openMenu()
    return
  }
  const pads = [pad, pad2]
  const convoyActive = !!convoy && convoy.phase !== 'done'
  const scripted = !!endSeq || convoyActive   // nos finais da 2 e da 2.1 o Edu anda sozinho
  const exiting = finish && !endSeq && !convoyActive
  // Cada jogador: quem está caindo (morrendo) anima a queda; quem está fora de jogo ou na saída da fase não age; nas cenas finais o
  // segundo jogador acompanha o primeiro. Se ninguém puder agir, o mundo pára (como acontecia com um jogador só).
  let anyActive = false
  for (const p of [...players]) {   // cópia: takeLead() muda a ordem da lista no meio do laço
    p.inv -= dt
    player = p
    if (p.fall) {
      if (p.fall.age < fallDuration) updatePlayerFall(dt)
      continue
    }
    if (p.lives === 0 || exiting) continue
    if (scripted && p !== players[0]) { followLead(p, players[0]); anyActive = true; continue }
    stepPlayer(dt, pads[p.idx] ?? neutralPad, scripted, convoyActive)
    if (!p.fall) anyActive = true
  }
  player = players[0]
  if (!anyActive) return
  // o resto do mundo (inimigos, chefes, ondas) enxerga o jogador mais à frente; cada inimigo escolhe o mais próximo
  const alive = alivePlayers()
  const front = alive.reduce((a, b) => (b.x > a.x ? b : a), alive[0] ?? players[0])
  player = front
  if (!finish) updateCombat(dt)
  if (!finish) updateRearGuard(dt, front)
  if (onTruck) updateWaves(dt)
  for (const p of players) {
    player = p
    const firing = p.trigger && p.lives > 0 && !finish && !p.fall ? playerPose().muzzle : null
    // o Edu é desenhado heroVisualScale vezes maior que as coordenadas do cano: o clarão acompanha a ponta que se vê
    gameFx.muzzle(firing ? { x: p.x + p.face*firing[0]*heroVisualScale, floor: p.y, height: -firing[1]*heroVisualScale, flip: p.face < 0, scale: charScale, casingFloor: groundBelow(p.x, p.y) - p.y - .5 } : null, p.idx)
  }
  player = players[0]
  gameFx.update(dt)
  for (let i=droneExplosions.length-1; i>=0; i--) {
    const explosion = droneExplosions[i]
    explosion.fx.update(dt)
    if (explosion.fx.done()) droneExplosions.splice(i,1)
  }
  for (const p of players) {
    if (p.powerVisual <= 0) continue
    const age = powerUpDuration-p.powerVisual
    p.powerVisual = Math.max(0,p.powerVisual-dt)
    const intensity = Math.min(1,age/.16) * Math.min(1,p.powerVisual/.58)
    if (age > .24 && Math.random() < dt*(20+18*intensity)) {
      const side = Math.random() < .5 ? -1 : 1
      powerUpMotes.push({
        x: p.x + side*(8+Math.random()*12),
        y: p.y-4-Math.random()*48,
        vx: -p.vx*.12 + (Math.random()-.5)*12,
        vy: -55-Math.random()*75,
        age: 0,
        life: .34+Math.random()*.34,
        inward: false
      })
    }
  }
  for (let i=powerUpMotes.length-1; i>=0; i--) {
    const mote = powerUpMotes[i]
    mote.age += dt
    if (mote.age >= mote.life) { powerUpMotes.splice(i,1); continue }
    mote.x += mote.vx*dt
    mote.y += mote.vy*dt
    if (!mote.inward) mote.vy -= 12*dt
  }
  for (const spark of sparks) { spark.y -= dt * 18; spark.t -= dt }
  while (sparks.length && sparks[0].t <= 0) sparks.shift()
  // a câmera segue o Edu pela carreta (com dois jogadores, o ponto médio entre os dois); no final, depois que ele desce, segue até o fim do desenho do pub
  const focus = focusX()
  if (onTruck) camera += (clamp(cameraTarget(cameraLeadNow()),0,endSeq && endSeq.free ? pubCameraEnd() : cameraMaxNow()) - camera) * Math.min(1,dt * 6)
  else if (convoy) {   // a câmera abre a cena à frente do Edu, acompanha a carreta saindo e depois fica parada
    if (convoy.phase !== 'exit' && convoy.phase !== 'done') {
      const lead = width < wideWidth ? 50 : 110   // na tela estreita o Edu fica mais perto da borda para sobrar rua à frente
      const target = convoy.phase === 'ride' ? players[0].x - lead : convoy.px - lead
      camera += (Math.max(0,target) - camera) * Math.min(1,dt * 3)
    }
  }
  else camera += (clamp(cameraTarget(walkLead()),0,convoyWalk ? Infinity : end+50-width) - camera) * Math.min(1,dt * 6)
  const nextProgress = finish ? 100 : Math.floor(clamp((front.x-70)/(goal-70),0,.99)*100)
  if (!onTruck && nextProgress !== progress) {
    progress = nextProgress
    progressText.textContent = progress + '% DA FASE'
  }
}

// Modo de 2 jogadores mais difícil: depois de 30% da fase, reforços também chegam pelas costas (pela borda esquerda da tela).
let rearTimer = 9
function updateRearGuard(dt, front) {
  if (!twoPlayers || onTruck || convoy || finish) return
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].rear && enemies[i].x < camera - 320) enemies.splice(i, 1)   // ficou muito para trás
  if (progress < 30 || (front.x > bossArena && boss.hp > 0)) return
  if ((rearTimer -= dt) > 0) return
  const rearDrones = enemies.filter((e) => e.rear && e.hp > 0 && e.kind === 'drone').length, rearSoldiers = enemies.filter((e) => e.rear && e.hp > 0 && e.kind !== 'drone').length
  if (rearDrones + rearSoldiers >= 3) { rearTimer = 3; return }
  const late = clamp((progress - 30) / 70, 0, 1)             // quanto mais perto do fim, mais seguido
  rearTimer = 12 - late * 5 + Math.random() * 3
  const x = camera - 45
  if (rearDrones < 1 && (Math.random() < .3 || rearSoldiers >= 2)) {   // drone entra voando pela esquerda
    const enemy = createEnemy({ x, type: late > .6 && Math.random() < .5 ? 'heavyDrone' : 'drone', y: 150 })
    enemy.glideTo = camera + 50 + Math.random() * 60
    enemy.origin = enemy.glideTo
    enemy.face = 1
    enemy.rear = true
    enemies.push(enemy)
    return
  }
  if (rearSoldiers >= 2) { rearTimer = 3; return }
  // chão na borda esquerda; se for buraco, entra pelo fim do trecho de chão mais próximo à esquerda
  let sx = x
  if (!platforms.some(([px, py, w]) => py === groundY && x >= px && x < px + w)) {
    const near = platforms.filter(([px, py, w]) => py === groundY && px + w <= x && x - (px + w) < 170).sort((a, b) => (b[0] + b[2]) - (a[0] + a[2]))[0]
    if (!near) { rearTimer = 1.5; return }
    sx = near[0] + near[2] - 14
  }
  const enemy = createEnemy({ x: sx, type: late > .5 && Math.random() < .4 ? 'elite' : 'patrol', min: Math.min(camera - 70, sx - 10), max: camera + width + 40, y: groundY })
  enemy.face = 1
  enemy.route = 1
  enemy.delay = .9
  enemy.rear = true
  enemies.push(enemy)
}

// Um passo de um jogador (o "player" da vez): pulo, corrida, queda no buraco, checkpoints, itens, final da fase e tiro.
function stepPlayer(dt, pad, scripted, convoyActive) {
  const cs = controlSets[player.idx]
  const right = !scripted && active(...cs.right)
  const left = !scripted && active(...cs.left)
  const direction = scripted ? (endSeq ? endSeq.dir : 0) : right || left ? Number(right) - Number(left) : pad.direction
  const wantsCrouch = !scripted && (active(...cs.down) || pad.crouch)
  if (!scripted && (player.jumpPressed || pad.jump)) player.buffer = 0.13
  if (convoyActive && convoy.jump && player === players[0]) { player.buffer = 0.13; convoy.jump = false }
  player.jumpPressed = false
  player.buffer -= dt
  player.coyote = player.grounded ? 0.09 : player.coyote - dt
  // Fase 2.1: agachado + pulo = desce para o andar de baixo (atravessa o piso)
  if (onTruck && !scripted && player.grounded && !player.mover && wantsCrouch && player.buffer > 0 && hasFloorBelow(player)) {
    dropDown(player, 40)
    sfx.play('checkpoint', { volume: .12 })
  }
  if (player.buffer > 0 && player.coyote > 0) {
    player.vy = -jumpSpeed
    player.grounded = false
    player.coyote = 0
    player.buffer = 0
  }
  const crouching = player.grounded && wantsCrouch
  player.vx = crouching ? 0 : player.vx + (direction * 145 - player.vx) * Math.min(1,dt * (direction ? 22 : 32))
  if (Math.abs(player.vx) < 1) player.vx = 0
  if (direction) player.face = Math.sign(direction)
  if (player.grounded && player.mover) {
    player.x += player.mover.dx
    player.y = player.mover.cy
  }
  const oldY = player.y
  player.x = onTruck ? clamp(player.x + player.vx * dt,fase21.bounds[0],endSeq && endSeq.free ? Infinity : fase21.bounds[1]) : clamp(player.x + player.vx * dt,14,convoyActive ? Infinity : walkEnd)
  if (players.length > 1 && !scripted) player.x = clamp(player.x, camera + 10, camera + width - 10)   // com dois jogadores ninguém sai da tela
  player.vy += 790 * dt
  player.y += player.vy * dt
  player.grounded = false
  landOnPlatform(player, oldY, 7, true)
  if (player.grounded) player.levelY = player.y
  if (player.y > 295) {
    loseLife()
    return
  }
  player.crouch = player.grounded ? clamp(player.crouch + dt * (wantsCrouch ? 10 : -12),0,1) : 0
  for (const checkpoint of checkpoints) {
    if (player.x >= checkpoint && respawnX < checkpoint && player.grounded && !player.mover) {
      respawnX = checkpoint
      gameFx.checkpoint()
      sfx.play('checkpoint')
      if (heliBoss && checkpoint === checkpoints[0]) farHeli = { delay: 1.6, sx: -190, y: 74 }   // o helicóptero do Oficial cruza o fundo
    }
  }
  if (zoneIndex < zones.length && player.x >= zones[zoneIndex][0]) {
    zoneIndex++   // os nomes dos setores não aparecem mais: só o CHECK POINT
  }
  for (const pickup of pickups) {
    if (pickup.taken || Math.abs(player.x-pickup.x) > 14 || pickup.y < player.y-62 || pickup.y > player.y+4) continue
    pickup.taken = true
    gameFx.collect({ x: pickup.x, y: pickup.y - 10 })
    if (player.lives < maxLives) {
      player.lives++
      announce('VIDA EXTRA',1.4)
      sfx.play('extraLife')
    } else {
      score += 500
      announce('MEDALHA +500',1.4)
      sfx.play('medal')
    }
  }
  for (const powerUp of powerUps) {
    if (powerUp.taken || Math.abs(player.x-powerUp.x) > 16 || powerUp.y < player.y-64 || powerUp.y > player.y+5) continue
    powerUp.taken = true
    player.powerVisual = powerUpDuration
    for (let i=0; i<30; i++) {
      const angle = i/30*Math.PI*2 + (i%3)*.12
      const radius = 30 + (i%7)*4
      powerUpMotes.push({
        x: player.x + Math.cos(angle)*radius,
        y: player.y-34 + Math.sin(angle)*radius*.72,
        vx: -Math.cos(angle)*(58+(i%5)*8),
        vy: -Math.sin(angle)*(46+(i%4)*7),
        age: 0,
        life: .26 + (i%4)*.025,
        inward: true
      })
    }
    announce('POWER UP!',1.4)
    sfx.play('powerUp')
  }
  if (player.x >= finishX && boss.hp === 0 && (!heliBoss || boss.heli.gone) && !finish && player.grounded) {
    finish = true
    takeLead(player)   // quem chega primeiro conduz as cenas finais; o outro jogador acompanha
    if (stage === 2 && !onTruck) startConvoy()   // Fase 2: três caminhonetes fecham a rua e a Carreta Furação abre caminho
    else outSeq = { t: 0, banner: false, wiped: false }
  }
  if (player.grounded && Math.abs(player.vx) > 8) {
    player.phase = (player.phase + Math.abs(player.vx) * dt / 12) % 8
    if (Math.random() < dt * 15) sparks.push({x:player.x-player.face*7,y:player.y-2,t:.19})
  } else if (player.grounded) player.phase = 0
  player.cooldown -= dt
  player.trigger = !scripted && (active(...cs.fire) || pad.fire)
  if (!player.trigger) player.shotTick = 0
  if (player.trigger && player.cooldown <= 0) {
    player.cooldown = fireInterval
    if (player.shotTick++ % bulletEvery === 0) {
      const [muzzleX,muzzleY] = playerPose().muzzle
      // a bala nasce na ponta que se vê da arma (o Edu é desenhado heroVisualScale vezes maior que as coordenadas do cano)
      shots.push({x:player.x + player.face * muzzleX * heroVisualScale,y:player.y + muzzleY * heroVisualScale + (Math.random()*2-1)*fireSpread,dx:player.face,t:shotLife()})
    }
    playShotSound()
  }
  const idle = player.grounded && player.vx === 0 && direction === 0 &&
    player.crouch === 0 && !player.trigger && player.cooldown <= 0
  player.idleTime = idle ? player.idleTime + dt : 0
}
// o jogador que chegou ao fim da fase passa a ser o primeiro da lista (o líder das cenas finais)
function takeLead(p) {
  players.splice(players.indexOf(p), 1)
  players.unshift(p)
}
// nas cenas finais (carreta, caminhonetes) o segundo jogador acompanha o líder, um pouco atrás
function followLead(p, lead) {
  Object.assign(p, { x: lead.x - 26, y: lead.y, vx: lead.vx, vy: lead.vy, face: lead.face, grounded: lead.grounded, mover: lead.mover, phase: lead.phase, crouch: 0, trigger: false, coyote: lead.coyote })
}

// Grunhido para perda de vida; grito mais intenso para game over.
const deathSoundVolume = .65
function playDeathSound(gameOver = false) {
  if (!soundContext || soundContext.state !== 'running') return
  const buffer = gameOver ? deathScreamSound : deathGruntSound
  if (!buffer) return
  const source = soundContext.createBufferSource()
  const gain = soundContext.createGain()
  source.buffer = buffer
  gain.gain.value = deathSoundVolume * sfx.level
  source.connect(gain).connect(soundContext.destination)
  source.start()
}

// Soldado derrotado: o mesmo grunhido do Edu, só que mais agudo (e com um tom levemente diferente a cada vez).
// Mais baixo quanto mais longe do Edu e mudo a partir de ~320 unidades.
const soldierDeathPitch = 1.2
function playSoldierDeathSound(dx = 0) {
  if (!soundContext || soundContext.state !== 'running' || !deathGruntSound) return
  const near = Math.max(0, 1 - Math.abs(dx) / 320)
  if (!near) return
  const source = soundContext.createBufferSource()
  const gain = soundContext.createGain()
  source.buffer = deathGruntSound
  source.playbackRate.value = soldierDeathPitch * (.97 + Math.random() * .06)
  gain.gain.value = deathSoundVolume * sfx.level * .8 * near
  source.connect(gain).connect(soundContext.destination)
  source.start()
}

// Superfície mais próxima abaixo de (x, y): plataformas e plataformas móveis. Sem nada embaixo (buraco), devolve y + 400.
// Os cartuchos do cano caem até ela em vez de quicar no ar.
function groundBelow(x, y) {
  let best = y + 400
  for (const [px,py,pw] of platforms) if (x >= px && x <= px+pw && py >= y-1 && py < best) best = py
  for (const m of movers) if (x >= m.cx && x <= m.cx+m.w && m.cy >= y-1 && m.cy < best) best = m.cy
  return best
}

function hitPlayer() {
  if (player.inv > 0) return false
  loseLife()
  return true
}

// Fim de jogo: escurece a cena e mostra o título animado. São 3 continues por partida (guardados entre as fases): CONTINUAR volta
// ao INÍCIO da fase atual (não ao checkpoint) com as vidas cheias; REINICIAR JOGO começa tudo de novo na Fase 1. Sem continues,
// só resta voltar ao início do jogo (tela inicial).
const maxContinues = 3
const gameOverScreen = select('#gameover')
gameOverScreen.hidden = true
const continueButton = select('#gameover-continue')
const restartButton = select('#gameover-restart')
function continuesLeft() {
  try { const v = sessionStorage.getItem('bulletz.continues'); return v === null ? maxContinues : Math.max(0, Number(v) || 0) } catch { return maxContinues }
}
function saveContinues(n) { try { sessionStorage.setItem('bulletz.continues', String(n)) } catch {} }
function showGameOver() {
  const left = continuesLeft()
  continueButton.hidden = left === 0
  continueButton.textContent = 'CONTINUAR · ' + left
  continueButton.dataset.count = '×' + left
  restartButton.textContent = left === 0 ? 'VOLTAR AO INÍCIO' : 'REINICIAR JOGO'
  gameOverScreen.classList.remove('ready')
  gameOverScreen.hidden = false
  const title = gameOverScreen.querySelector('.gameover-title')
  title.style.animation = 'none'; void title.offsetWidth; title.style.animation = ''   // recomeça a animação
  setTimeout(() => {
    gameOverScreen.classList.add('ready')
    if (!gameOverScreen.hidden) (left > 0 ? continueButton : restartButton).focus()
  }, 1500)
}
function hideGameOver() { gameOverScreen.hidden = true; gameOverScreen.classList.remove('ready') }

// Cursor nas telas de botões (fim de jogo e menu de pausa) para jogar sem mouse: setas/A-D/S-W movem, Enter/Espaço confirmam; no controle,
// direcional ou analógico movem e o botão de pulo (ou START) confirma. O botão selecionado ganha um contorno que pisca, no formato do sprite (e o brilho do botão).
const menuCursor = document.createElement('div')
menuCursor.id = 'menu-cursor'
menuCursor.hidden = true
document.querySelector('.screen').appendChild(menuCursor)
let menuSel = 0, menuKey = null, menuPadDir = 0
function menuItems() {
  if (!gameOverScreen.hidden) return [...gameOverScreen.querySelectorAll('button')].filter((b) => !b.hidden)
  if (mode === 'menu') return [...document.querySelectorAll('#menu .menu-actions button')].filter((b) => !b.hidden && b.offsetParent !== null)
  return []
}
function moveMenu(step) {
  const items = menuItems()
  if (!items.length) return
  menuSel = (menuSel + step + items.length) % items.length
  items[menuSel].focus({ preventScroll: true })
  sfx.play('checkpoint', { volume: .25 })
}
function confirmMenu() {
  const items = menuItems()
  if (items[menuSel]) items[menuSel].click()
}
function updateMenuCursor() {
  const items = menuItems()
  const key = items.length ? (gameOverScreen.hidden ? 'menu' : 'gameover') : null
  if (key !== menuKey) { menuKey = key; menuSel = 0; if (items[0]) items[0].focus({ preventScroll: true }) }   // abre sempre no primeiro botão
  menuCursor.hidden = !key || (key === 'gameover' && !gameOverScreen.classList.contains('ready'))   // no fim de jogo só depois que os botões surgem
  if (!items.length) return
  menuSel = Math.min(menuSel, items.length - 1)
  items.forEach((b, i) => b.classList.toggle('sel', i === menuSel))
  const r = items[menuSel].getBoundingClientRect(), s = document.querySelector('.screen').getBoundingClientRect()
  // no fim de jogo o contorno fica ATRÁS dos botões (dentro da tela de fim de jogo), para não cobrir o selo ×3; no menu de pausa fica por cima
  const host = key === 'gameover' ? gameOverScreen : document.querySelector('.screen')
  if (menuCursor.parentElement !== host) host.insertBefore(menuCursor, host.firstChild)
  const pauseArt = document.querySelector('#menu').classList.contains('player-mode') && { resume: 'botao-continuar', 'exit-menu': 'botao-sair' }[items[menuSel].id]   // MODO JOGADOR: CONTINUAR e SAIR em arte (520×140)
  const art = pauseArt || ['iniciar', 'continuar', 'reiniciar'].find((n) => items[menuSel].classList.contains('art-' + n))
  menuCursor.classList.toggle('shape', !!art)
  if (art) {
    // botões com arte: o contorno acompanha o formato do sprite (assets/botoes/*-contorno.png: a silhueta do botão dilatada, 16 px de folga em volta)
    const [aw, ah] = pauseArt ? [520, 140] : [410, 174]
    const kx = r.width / aw, ky = r.height / ah
    menuCursor.style.backgroundImage = `url(assets/botoes/${art}-contorno.png?v=3)`
    menuCursor.style.left = Math.round(r.left - s.left - 16 * kx) + 'px'
    menuCursor.style.top = Math.round(r.top - s.top - 16 * ky) + 'px'
    menuCursor.style.width = Math.round((aw + 32) * kx) + 'px'
    menuCursor.style.height = Math.round((ah + 32) * ky) + 'px'
  } else {   // botões comuns do menu: moldura retangular
    const pad = 2
    menuCursor.style.backgroundImage = ''
    menuCursor.style.left = Math.round(r.left - s.left - pad) + 'px'
    menuCursor.style.top = Math.round(r.top - s.top - pad) + 'px'
    menuCursor.style.width = Math.round(r.width + pad * 2) + 'px'
    menuCursor.style.height = Math.round(r.height + pad * 2) + 'px'
  }
}
// o mouse também move a seleção
for (const overlay of [gameOverScreen, document.querySelector('#menu')]) {
  overlay.addEventListener('mouseover', (event) => {
    const i = menuItems().indexOf(event.target.closest('button'))
    if (i >= 0) menuSel = i
  })
}
window.addEventListener('keydown', (event) => {
  if (!menuItems().length || event.altKey || event.ctrlKey || event.metaKey) return
  if (event.target.closest?.('select, input, textarea')) return   // não atrapalha os controles do menu (volume, música, seletor de fase)
  const prev = ['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'], next = ['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS']
  if (prev.includes(event.code)) moveMenu(-1)
  else if (next.includes(event.code)) moveMenu(1)
  else if (['Enter', 'NumpadEnter', 'Space'].includes(event.code)) confirmMenu()
  else return
  event.preventDefault()
  event.stopPropagation()
}, true)
// controle: chamada a cada quadro enquanto há uma tela de botões
function menuPadInput(pad) {
  const dir = Math.abs(pad.direction) > .5 ? Math.sign(pad.direction) : pad.crouch ? 1 : 0
  if (dir && dir !== menuPadDir) moveMenu(dir)
  menuPadDir = dir
  if (pad.jump || pad.restart) { confirmMenu(); return true }
  return false
}
continueButton.onclick = () => {
  saveContinues(continuesLeft() - 1)
  reset(true)
  game.focus()
}
restartButton.onclick = () => {
  const noContinues = continuesLeft() === 0
  try { sessionStorage.removeItem('bulletz.continues') } catch {}
  goToStage(null, { autostart: !noContinues })   // reiniciar: já começa jogando na Fase 1; sem continues: tela inicial
}
function loseLife() {
  player.lives--
  shots.length = 0
  enemyShots.length = 0
  pendingShotAt = -Infinity
  player.jumpPressed = false
  const belowMap = player.y > 295
  player.fall = { age: 0, belowMap }
  playDeathSound(players.every((p) => p.lives === 0))
  if (belowMap) completePlayerFall()
}

function updatePlayerFall(dt) {
  player.fall.age += dt
  if (!player.grounded) {
    const previousY = player.y
    player.vy += 790 * dt
    player.y += player.vy * dt
    landOnPlatform(player, previousY, 7, true)
  }
  if (player.fall.age >= fallDuration) completePlayerFall()
}

function completePlayerFall() {
  const p = player
  if (p.lives === 0) {
    p.fall.age = fallDuration
    if (players.every((q) => q.lives === 0)) showGameOver()   // só há fim de jogo quando todos ficaram sem vidas
    return
  }
  // o parceiro ainda joga: volta ao lado dele, sem reiniciar o trecho; se não, todos que restam voltam ao checkpoint
  const mate = players.find((q) => q !== p && !q.fall && q.lives > 0)
  if (mate) { respawnPlayer(p, mate.x, Math.min(mate.y, groundY) - 30, false); player = p }
  else { reset(false); bossHud.hidden = true }
}

// Descer de andar (só na Fase 2.1): quem "salta para baixo" atravessa o piso em que está (actor.dropY) e cai até o andar de baixo.
// Os pisos do andar de onde saiu (dropY ou mais altos) deixam de valer até ele passar 12 de altura por baixo deles.
const hasFloorBelow = (actor) => platforms.some(([x, y, w]) => y > actor.y + 6 && actor.x + 4 > x && actor.x - 4 < x + w)
function dropDown(actor, hop = 0) {
  actor.dropY = actor.y
  actor.grounded = false
  actor.vy = -hop
  if ('coyote' in actor) { actor.coyote = 0; actor.buffer = 0 }
}
function landOnPlatform(actor, previousY, radius, withMovers = false) {
  if (withMovers) actor.mover = null
  if (actor.dropY != null && actor.y > actor.dropY + 12) actor.dropY = null
  if (actor.vy < 0) return
  for (const [x,y,w] of platforms) {
    if (actor.dropY != null && y <= actor.dropY + 1) continue
    if (actor.x + radius <= x || actor.x - radius >= x+w || previousY > y || actor.y < y) continue
    actor.y = y
    actor.vy = 0
    actor.grounded = true
    return
  }
  if (!withMovers) return
  for (const m of movers) {
    if (actor.x + radius <= m.cx || actor.x - radius >= m.cx+m.w || previousY > m.cy || actor.y < m.cy) continue
    actor.y = m.cy
    actor.vy = 0
    actor.grounded = true
    actor.mover = m
    return
  }
}

function updatePatrol(enemy, distance, config, dt) {
  const inRange = Math.abs(distance) < config.reach && Math.abs(player.y-enemy.y) < 36
  if (inRange && enemy.grounded) enemy.delay -= dt
  const braking = inRange && enemy.grounded && enemy.delay <= .32
  const aiming = braking && Math.abs(enemy.vx) < 8
  if (enemy.x <= enemy.min) enemy.route = 1
  if (enemy.x >= enemy.max) enemy.route = -1
  if (enemy.grounded) {
    if (!braking) {
      const ahead = enemy.x + enemy.route*9
      const gapAhead = !platforms.some(([x,y,w]) => y === groundY && ahead >= x && ahead < x+w)
      const ledgeAhead = platforms.some(([x,y,w]) => {
        if (y >= enemy.y || enemy.y-y > 54) return false
        const edge = enemy.route > 0 ? x : x+w
        const approach = (edge-enemy.x)*enemy.route
        return approach >= 12 && approach <= 20
      })
      if (enemy.vx*enemy.route > 65 && ((enemy.y === groundY && gapAhead) || ledgeAhead)) {
        enemy.vy = -292
      }
    }
  }
  const oldX = enemy.x
  if (enemy.grounded && enemy.vy >= 0) {
    const remaining = enemy.route > 0 ? enemy.max-enemy.x : enemy.x-enemy.min
    const target = braking ? 0 : enemy.route*Math.min(config.speed, 22 + remaining*4)
    enemy.vx += clamp(target-enemy.vx,-620*dt,620*dt)
  }
  if (aiming) enemy.face = Math.sign(distance) || enemy.face
  else if (Math.abs(enemy.vx) > 4) enemy.face = Math.sign(enemy.vx)

  if (aiming && enemy.delay <= 0) {
    const [x,y] = enemyMuzzles.patrol.map(v => v*charScale)
    enemyShots.push({x:enemy.x+enemy.face*x,y:enemy.y+y,vx:enemy.face*config.shotSpeed})
    sfx.play('patrolShot', { dx: enemy.x - player.x })
    enemy.delay = config.interval
  }
  const oldY = enemy.y
  const wasGrounded = enemy.grounded
  enemy.aiming = aiming
  enemy.landing = Math.max(0, enemy.landing-dt)
  enemy.x = clamp(enemy.x + enemy.vx*dt, enemy.min, enemy.max)
  enemy.vy += 790*dt
  enemy.y += enemy.vy*dt
  enemy.grounded = false
  landOnPlatform(enemy,oldY,4)
  if (enemy.grounded) enemy.stride = (enemy.stride + Math.abs(enemy.x-oldX)) % 48
  if (!wasGrounded && enemy.grounded) enemy.landing = .105
  enemy.airTime = enemy.grounded ? 0 : enemy.airTime+dt
  if (enemy.y > height+45) {
    enemy.x = enemy.origin
    enemy.y = enemy.spawnY
    enemy.vx = 0
    enemy.vy = 0
    enemy.grounded = true
  }
}

// Ataque especial do Fofão (investida): agacha avisando, dispara pelo chão deixando imagens atrás, corta e acerta em cheio.
// É raro de propósito: só depois de um tempo vivo, no máximo 2 vezes por Fofão e com um intervalo grande entre
// os especiais de todos eles. Efeitos de corte e de golpe crítico do pixelfx (dash-strike).
const fofaoSpecial = {
  minAlive: 6,        // s vivo antes do primeiro especial
  maxUses: 2,         // por Fofão
  gap: 16,            // s mínimos entre dois especiais de quaisquer Fofões
  firstAt: 9,         // s de partida antes de o primeiro especial de todos
  chance: .35,        // por segundo, quando as condições estão certas
  minDist: 80, maxDist: 240,
  crouch: .6,         // aviso (pisca branco)
  dashSpeed: 560, dashMax: .4,
  recover: .75
}
// Na ONDA FINAL da Fase 2.1 os inimigos usam o especial bem mais: logo depois de entrar, mais vezes cada um, com intervalo curto entre eles e mais chance por segundo.
const finalWave = () => onTruck && waveState.index >= fase21.waves.length
const specialRules = () => finalWave() ? { maxUses: 4, minAlive: 1.5, gap: 4.5, chance: 3 } : { maxUses: fofaoSpecial.maxUses, minAlive: fofaoSpecial.minAlive, gap: fofaoSpecial.gap, chance: 1 }
function tryFofaoSpecial(enemy, distance, sameLevel, dt) {
  const sp = fofaoSpecial, rules = specialRules()
  const far = Math.abs(distance)
  if (enemy.type !== 'fofao' || enemy.specialUses >= rules.maxUses || enemy.aliveTime < rules.minAlive || elapsed < fofaoSpecialReadyAt) return false
  if (!sameLevel || far < sp.minDist || far > sp.maxDist || Math.random() > sp.chance * rules.chance * dt) return false
  enemy.special = 'crouch'
  enemy.specialAge = 0
  enemy.specialUses++
  enemy.face = Math.sign(distance) || enemy.face
  fofaoSpecialReadyAt = elapsed + rules.gap
  sfx.play('bossShot', { dx: enemy.x - player.x })
  return true
}
// Devolve true no quadro em que a investida acerta o Edu.
function stepFofaoSpecial(enemy, distance, sameLevel, dt) {
  const sp = fofaoSpecial
  let struck = false
  enemy.specialAge += dt
  if (enemy.special === 'crouch') {
    enemy.vx = 0
    enemy.face = Math.sign(distance) || enemy.face
    if (enemy.specialAge >= sp.crouch) { enemy.special = 'dash'; enemy.specialAge = 0; enemy.ghostTimer = 0 }
  } else if (enemy.special === 'dash') {
    enemy.vx = enemy.face * sp.dashSpeed
    enemy.ghostTimer -= dt
    if (enemy.ghostTimer <= 0) {
      afterimages.push({ x: enemy.x, y: enemy.y, face: enemy.face, age: 0 })
      enemy.ghostTimer = .03
    }
    const passed = Math.sign(player.x - enemy.x) !== enemy.face
    if (sameLevel && Math.abs(distance) < 26 * charScale + 8) {
      struck = true
      gameFx.slash({ x: enemy.x + enemy.face * 6, floor: enemy.y, flip: enemy.face < 0 })
      gameFx.crit({ x: player.x, floor: player.y, flip: enemy.face < 0, height: 28 * charScale })
      sfx.play('heavyBlast', { dx: enemy.x - player.x })
    }
    if (struck || passed || enemy.specialAge >= sp.dashMax) { enemy.special = 'recover'; enemy.specialAge = 0; enemy.vx = 0 }
  } else {
    enemy.vx = -enemy.face * 25   // recuperando: ainda se mexe, recuando devagar
    if (enemy.specialAge >= sp.recover) { enemy.special = null; enemy.cooldown = 1 }
  }
  return struck
}
function drawAfterimages(scroll) {
  for (const g of afterimages) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, 1 - g.age / .3) * .55
    enemyFrame('fofaoRun', 0, g.x - scroll, g.y, g.face, false, 'rgba(120, 205, 255, .8)')
    ctx.restore()
  }
}

// Ataque especial aéreo do Chapolim (ground-pound): agacha, salta para fora da tela, some um instante (marca o chão onde o
// Edu está) e despenca ali com a marreta. Ele troca de plataforma e golpeia a do Edu: o impacto solta o ground-slam do
// pixelfx e as duas ondas que correm pelo chão são o dano (mesma curva do efeito: 7 -> reach em .6 s, outCubic).
// Raro como o especial do Fofão: depois de um tempo vivo, no máximo 2 vezes por Chapolim e com intervalo entre todos.
const chapolimLeap = { minAlive: 6, maxUses: 2, chance: .3, coil: .35, rise: .5, hang: .75, fall: .28, land: 1.0,
  height: 330, reach: 90, jumpClear: 20 }
const slamFront = (age) => 7 + (chapolimLeap.reach - 7) * (1 - Math.pow(1 - Math.min(1, Math.max(0, age - .015) / .6), 3))
function tryChapolimLeap(enemy, dt) {
  const L = chapolimLeap, rules = specialRules()
  if (enemy.type !== 'chapolim' || !enemy.grounded || enemy.specialUses >= rules.maxUses || enemy.aliveTime < rules.minAlive ||
      elapsed < fofaoSpecialReadyAt || Math.random() > L.chance * rules.chance * dt) return false
  enemy.special = 'coil'
  enemy.specialAge = 0
  enemy.specialUses++
  enemy.vx = 0
  enemy.face = Math.sign(player.x - enemy.x) || enemy.face
  fofaoSpecialReadyAt = elapsed + rules.gap
  sfx.play('bossShot', { dx: enemy.x - player.x })
  return true
}
// Devolve true no quadro em que a onda alcança o Edu.
function stepChapolimLeap(enemy, dt) {
  const L = chapolimLeap
  let struck = false
  enemy.specialAge += dt
  const age = enemy.specialAge
  enemy.vx = 0
  if (enemy.special === 'coil') {
    enemy.face = Math.sign(player.x - enemy.x) || enemy.face
    if (age >= L.coil) { enemy.special = 'rise'; enemy.specialAge = 0; enemy.baseY = enemy.y; enemy.vy = 0 }
  } else if (enemy.special === 'rise') {
    const k = Math.min(1, age / L.rise)
    enemy.y = enemy.baseY - L.height * k * k   // sobe acelerando, até sair da tela por cima
    if (age >= L.rise) {
      // fixa o alvo: o ponto da plataforma do Edu onde ele está agora (a marca no chão avisa)
      enemy.special = 'hang'; enemy.specialAge = 0
      enemy.landX = clamp(player.x, enemy.min, enemy.max)
      enemy.landY = player.levelY
    }
  } else if (enemy.special === 'hang') {
    enemy.x = enemy.landX
    enemy.y = enemy.landY - L.height
    if (age >= L.hang) { enemy.special = 'fall'; enemy.specialAge = 0 }
  } else if (enemy.special === 'fall') {
    const k = Math.min(1, age / L.fall)
    enemy.x = enemy.landX
    enemy.y = enemy.landY - L.height * (1 - k * k)
    if (age >= L.fall) {
      enemy.special = 'land'; enemy.specialAge = 0
      enemy.x = enemy.landX; enemy.y = enemy.landY; enemy.vy = 0; enemy.grounded = true; enemy.struck = false
      gameFx.slam({ x: enemy.x, floor: enemy.y, reach: L.reach })
      sfx.play('heavyBlast', { dx: enemy.x - player.x })
    }
  } else {
    // pousado: as ondas correm pelo chão; quem está alto o bastante passa por cima
    if (!enemy.struck && age < .8 && Math.abs(player.y - enemy.y) < 40 && player.y > enemy.y - L.jumpClear &&
        Math.abs(player.x - enemy.x) < slamFront(age)) { enemy.struck = true; struck = true }
    if (age >= L.land) { enemy.special = null; enemy.cooldown = 1 }
  }
  return struck
}
// Onda do abalo sísmico do Chapolim (mesma conta do anel do heavy-cleave: 6 + 46*outCubic(t/.45), em unidades do mundo)
const quakeRing = { time: .45, jumpClear: 16, radius: (age) => 6 + 46 * (1 - Math.pow(1 - Math.min(1, age/.45), 3)) }
// Rota do Fofão até o andar do Edu: devolve { x, jump } (x = para onde andar, jump = pular agora) ou null se já
// estão no mesmo andar. Edu mais alto: vai até a plataforma que o aproxima mais do andar dele e pula nela.
// Edu mais baixo: anda até a ponta da plataforma em que está e cai.
// Fase 2.1: no máximo 5 inimigos por vez no andar em que o jogador está. Quem vê o andar cheio não vai para lá (nem sobe, nem desce):
// fica patrulhando de um lado para o outro o andar em que está, até abrir vaga.
const maxPerLevel = 5
const crowdAtPlayerLevel = (enemy) => enemies.filter((e) => e !== enemy && e.hp > 0 && e.kind === 'melee' && Math.abs(e.y - player.levelY) < 30).length
function meleeNav(enemy) {
  const diff = player.levelY - enemy.y
  if (Math.abs(diff) < 30) return null
  if (onTruck && crowdAtPlayerLevel(enemy) >= maxPerLevel) return { hold: true }
  if (diff < 0) {
    let best = null
    for (const [x, y, w] of platforms) {
      if (y >= enemy.y - 8 || enemy.y - y > 52) continue
      if (!best || Math.abs(y - player.levelY) < Math.abs(best.y - player.levelY)) best = { x, y, w }
    }
    if (!best) return null
    const inside = enemy.x > best.x + 6 && enemy.x < best.x + best.w - 6
    return { x: clamp(enemy.x, best.x + 10, best.x + best.w - 10), jump: inside }
  }
  const here = platforms.find(([x, y, w]) => Math.abs(y - enemy.y) < 2 && enemy.x >= x - 6 && enemy.x <= x + w + 6)   // folga: na ponta ele ainda se apoia pelo raio do corpo
  if (!here) return null
  if (onTruck && hasFloorBelow(enemy)) return { x: enemy.x, jump: false, drop: true }   // na carreta ele desce pulando, sem ir até a ponta do andar
  const edges = [here[0], here[0] + here[2]].filter(e => e > 0 && e < 700)
  if (!edges.length) return null
  const edge = edges.reduce((a, b) => Math.abs(b - enemy.x) < Math.abs(a - enemy.x) ? b : a)
  return { x: edge + (Math.sign(edge - enemy.x) || 1) * 14, jump: false }
}

// Inimigo corpo a corpo (Fofão). Devolve true no quadro em que a faca acerta o Edu.
function updateMelee(enemy, distance, config, dt) {
  const dir = Math.sign(distance) || enemy.face
  const sameLevel = Math.abs(player.y - enemy.y) < 40
  const reach = (config.strike + 8) * charScale
  enemy.cooldown = Math.max(0, enemy.cooldown - dt)
  enemy.jumpWait = Math.max(0, enemy.jumpWait - dt)
  let struck = false
  enemy.aliveTime += dt
  if (enemy.special) {
    struck = enemy.type === 'chapolim' ? stepChapolimLeap(enemy, dt) : stepFofaoSpecial(enemy, distance, sameLevel, dt)
  } else if (enemy.attackAge >= 0) {
    // golpe: prepara (a faca volta), estoca, recupera; parado enquanto ataca
    const before = enemy.attackAge
    enemy.attackAge += dt
    // vulto da faca no instante da estocada (o efeito dura uns .3 s, então acompanha o quadro de estocada)
    if (enemy.type === 'fofao' && before < config.windup && enemy.attackAge >= config.windup)
    {
      gameFx.stab({ x: enemy.x, floor: enemy.y, flip: enemy.face < 0, reach: 16 * charScale, lift: 17 * charScale })
      // final do 3º golpe do sword-combo, pequeno, na ponta da faca quando a estocada chega
      gameFx.tip({ x: enemy.x + enemy.face * (9 + 16 * charScale), y: enemy.y - 17 * charScale - 20, flip: enemy.face < 0, delay: .07 })
    }
    // nunca fica parado: avança devagar no preparo, dá um bote na estocada e recua um pouco depois
    const creep = enemy.attackAge < config.windup ? enemy.face*30 : enemy.attackAge < config.windup + config.slash ? enemy.face*110 : -enemy.face*35
    enemy.vx += clamp(creep - enemy.vx, -1400*dt, 1400*dt)
    const slashFrom = config.hitAt ?? config.windup, slashTo = config.windup + config.slash
    if (config.impactX) {
      // marreta do Chapolim: no impacto sai o abalo sísmico e a onda corre pelo chão; só escapa quem está pulando alto
      const since = enemy.attackAge - slashFrom
      const hitX = enemy.x + enemy.face * config.impactX * charScale
      if (since >= 0 && !enemy.quaked) {
        enemy.quaked = true
        gameFx.quake({ x: hitX, floor: enemy.y, flip: enemy.face < 0 })
        sfx.play('heavyBlast', { dx: enemy.x - player.x })
      }
      if (enemy.quaked && !enemy.struck && since < quakeRing.time &&
          sameLevel && player.y > enemy.y - quakeRing.jumpClear && Math.abs(player.x - hitX) < quakeRing.radius(since)) {
        enemy.struck = true
        struck = true
      }
    } else if (!enemy.struck && enemy.attackAge >= slashFrom && enemy.attackAge < slashTo &&
        sameLevel && Math.abs(distance) < reach && Math.sign(distance) === enemy.face) {
      enemy.struck = true
      struck = true
    }
    if (enemy.attackAge >= slashTo + config.recover) { enemy.attackAge = -1; enemy.cooldown = config.cooldown }
  } else if (enemy.grounded) {
    enemy.face = dir
    // sempre em movimento: avança até o Edu; perto dele não para, anda de um lado para o outro (e recua se colar demais)
    const far = Math.abs(distance)
    enemy.paceTimer -= dt
    if (enemy.paceTimer <= 0) { enemy.paceDir = Math.random() < .5 ? 1 : -1; enemy.paceTimer = .6 + Math.random()*.6 }
    let target = dir*config.speed
    if (far < reach*enemy.standOff) target = (far < reach*.3 ? -dir : far > reach*.8 ? dir : enemy.paceDir) * config.speed * .55
    // em outro andar não fica rondando embaixo/em cima do Edu: segue a rota até o andar dele
    const nav = meleeNav(enemy)
    if (nav?.hold) {
      // andar do jogador cheio: vai e volta pelo próprio andar, virando antes da ponta
      enemy.holdDir ??= Math.random() < .5 ? 1 : -1
      const here = platforms.find(([x, y, w]) => Math.abs(y - enemy.y) < 2 && enemy.x >= x - 6 && enemy.x <= x + w + 6)
      if (here) {
        const lo = Math.max(here[0] + 16, enemy.min + 10), hi = Math.min(here[0] + here[2] - 16, enemy.max - 10)
        if (enemy.x <= lo) enemy.holdDir = 1
        else if (enemy.x >= hi) enemy.holdDir = -1
      }
      target = enemy.holdDir * config.speed * .6
      enemy.face = enemy.holdDir
    } else if (nav) {
      const toNav = nav.x - enemy.x
      target = Math.abs(toNav) > 4 ? Math.sign(toNav) * config.speed : dir * 30
      if (nav.jump && enemy.jumpWait <= 0) { enemy.vy = -292; enemy.jumpWait = .8 }
      else if (nav.drop && enemy.jumpWait <= 0 && Math.random() < dt * 4) { dropDown(enemy, 130); enemy.jumpWait = .8 }   // salta para baixo, atravessando o piso
    }
    // sem empilhar: cada Fofão se afasta de quem está colado nele (podem se cruzar, mas não ficam no mesmo ponto)
    let crowd = 0
    for (const o of enemies) {
      if (o === enemy || o.hp <= 0 || o.kind !== 'melee' || Math.abs(o.y - enemy.y) > 24) continue
      const d = enemy.x - o.x
      if (Math.abs(d) < 36) crowd += (Math.sign(d) || Math.sign(enemy.slot) || 1) * (36 - Math.abs(d)) / 36
    }
    target += crowd * (nav ? 20 : 130)   // na rota quase não se empurram: senão travam na ponta da plataforma, empurrando um ao outro
    if (Math.abs(target) < 35) target = 35 * (Math.sign(target) || enemy.paceDir)   // nunca fica parado
    enemy.vx += clamp(target - enemy.vx, -1100*dt, 1100*dt)
    if (tryFofaoSpecial(enemy, distance, sameLevel, dt) || tryChapolimLeap(enemy, dt)) {
      // investida especial (rara): ver stepFofaoSpecial
    } else if (sameLevel && Math.abs(distance) < reach*.8 && enemy.cooldown <= 0) {
      enemy.attackAge = 0
      enemy.struck = false; enemy.quaked = false
      enemy.attackKind = Math.random() < .5 ? 0 : 1   // dois golpes: estocada reta ou facada levantada
    }
  }
  if (enemy.special === 'rise' || enemy.special === 'hang' || enemy.special === 'fall') return struck   // no ar, controlado pelo especial
  const oldX = enemy.x
  const oldY = enemy.y
  const wasGrounded = enemy.grounded
  enemy.landing = Math.max(0, enemy.landing - dt)
  enemy.x = clamp(enemy.x + enemy.vx*dt, enemy.min, enemy.max)
  enemy.vy += 790*dt
  enemy.y += enemy.vy*dt
  enemy.grounded = false
  landOnPlatform(enemy, oldY, 4)
  if (enemy.grounded) enemy.stride = (enemy.stride + Math.abs(enemy.x - oldX)) % 64
  if (!wasGrounded && enemy.grounded) enemy.landing = .1
  enemy.airTime = enemy.grounded ? 0 : enemy.airTime + dt
  if (enemy.y > height + 45) {
    enemy.x = enemy.origin
    enemy.y = enemy.spawnY
    enemy.vx = 0
    enemy.vy = 0
    enemy.grounded = true
  }
  return struck
}

function updatePatrolFall(enemy, dt) {
  enemy.fallAge += dt
  if (enemy.grounded) return
  const oldY = enemy.y
  enemy.vy += 790*dt
  enemy.y += enemy.vy*dt
  landOnPlatform(enemy, oldY, 4)
}

function updateDroneFall(enemy, dt) {
  enemy.deathAge += dt
  if (enemy.grounded || enemy.y > height+70) return
  const oldY = enemy.y
  enemy.vy += 520*dt
  enemy.y += enemy.vy*dt
  landOnPlatform(enemy,oldY,9)
  if (enemy.grounded) {
    enemy.crashAt = elapsed
    if (!enemy.crashExplosion) {
      enemy.crashExplosion = true
      sfx.play(enemy.type === 'heavyDrone' ? 'heavyBlast' : 'droneBlast', { dx: enemy.x - player.x })
      const size = enemy.type === 'heavyDrone' ? 1.08 : .92
      droneExplosions.push({
        fx: createSpriteFusionExplosion({
          x: enemy.x*2,
          y: (enemy.y-3)*2,
          ground: enemy.y*2,
          size,
          seed: Math.max(1,Math.round(enemy.origin*137))
        })
      })
    }
  }
}

// ---- Oficial de Justiça no helicóptero (chefe da Fase 1)
// Voa por cima da arena e comanda ondas de soldados e elites pela esquerda e pela direita. Enquanto houver soldados ele fica lá em cima, fora
// do alcance dos tiros; quando a onda acaba ele desce com a porta aberta (exposto) por alguns segundos, depois sobe e chama a próxima.
// poses do Oficial (folha corpo.png): 0 parado, 1 mão aberta, 2 aponta p/ esquerda, 3 aponta p/ direita, 4 e 8 apontam p/ baixo e à esquerda,
// 5 e 9 apontam p/ baixo e à direita, 6 chama/grita, 7 reação ao tiro
function spawnHeliEnemy(type, side) {
  const x = side === 'left' ? camera - 45 : camera + width + 45
  const enemy = createEnemy({ x, type, min: player.x - 300, max: player.x + 300, y: groundY })
  enemy.face = side === 'left' ? 1 : -1
  enemy.route = enemy.face
  enemy.delay = 1.2 + Math.random() * .7
  enemy.heli = true
  enemies.push(enemy)
}
function startHeliOrder() {
  const h = boss.heli
  const wave = heliWaves[Math.min(h.wave, heliWaves.length - 1)]
  h.wave++
  h.phase = 'order'
  h.t = 0
  // com 2 jogadores cada lado manda mais um soldado (um elite nas últimas ondas)
  const extra = players.length > 1 ? [h.wave >= 3 ? 'elite' : 'patrol'] : []
  h.pending = [
    ...[...wave.left, ...extra].map((type, i) => ({ at: .6 + i * .9, side: 'left', type })),
    ...[...wave.right, ...extra].map((type, i) => ({ at: 2.1 + i * .9, side: 'right', type }))
  ].sort((a, b) => a.at - b.at)
  sfx.play('bossShot', { dx: 0 })
}
function startHeliDeath() {
  const h = boss.heli
  bombs.length = 0
  h.cols = []
  h.face = 1
  h.phase = 'dying'
  h.dyingT = 0
  h.nextBlast = 0
  score += 1500
  enemyShots.length = 0
  for (const e of enemies) {   // todos os inimigos por perto fogem para fora da tela
    if (e.hp <= 0 || e.x < camera - 700 || e.x > camera + width + 700) continue
    e.fleeing = true
    e.fleeDir = e.x < camera + width / 2 ? -1 : 1
    e.attackAge = -1
    e.special = null
  }
  sfx.play('bossDown')
}
const heliHalfWidth = () => heliMeta.frame[0] / pixelScale / 2 * heliScale() + 20
// Bombas do bombardeio: caem da barriga, explodem no chão (ou no Edu) com a explosão do pixelfx; quem está no chão por perto perde uma vida
function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i]
    b.vy += 520 * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.rot = Math.sin(elapsed * 6 + b.x) * .08   // cai reta, balançando só um pouco
    const victims = alivePlayers()
    const direct = victims.find((p) => Math.abs(b.x - p.x) < 11 && b.y >= p.y - 58 * charScale && b.y <= p.y)
    if (b.y < groundY - 2 && !direct) continue
    bombs.splice(i, 1)
    if (b.col) b.col.done = true
    const floor = Math.min(b.y, groundY)
    gameFx.bomb({ x: b.x, floor, size: .6 })
    sfx.play('heavyBlast', { dx: b.x - player.x })
    if (!finish) {
      const lead = player
      for (const p of victims) if (p === direct || (Math.abs(p.x - b.x) < 30 && p.y > groundY - 22)) { player = p; hitPlayer() }
      player = lead
    }
  }
}
function drawBombs(scroll) {
  // marcas vermelhas piscando no chão, onde as bombas vão cair
  const h = boss.heli
  if (h.cols.length) for (const c of h.cols) {
    if (c.done) continue
    ctx.save()
    ctx.globalAlpha = Math.floor(elapsed * 8) % 2 ? .75 : .3
    ctx.fillStyle = '#ff3b2e'
    ctx.beginPath(); ctx.ellipse(Math.round(c.sx), groundY + 2, 24, 3.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.stroke()
    ctx.restore()
  }
  for (const b of bombs) {
    const x = Math.round(b.x - scroll)
    if (x < -20 || x > width + 20) continue
    ctx.save()
    ctx.translate(x, Math.round(b.y))
    ctx.rotate(b.rot)
    ctx.fillStyle = '#15121c'      // casco escuro com um brilho e as aletas
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 7.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#4b4560'
    ctx.beginPath(); ctx.ellipse(-1.6, -1.8, 1.8, 3.2, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#2b2736'
    ctx.fillRect(-6, -10, 3, 5); ctx.fillRect(3, -10, 3, 5); ctx.fillRect(-3, -11, 6, 3)
    ctx.fillStyle = Math.floor(elapsed * 14) % 2 ? '#ff4a3a' : '#ffd24a'   // luz piscando
    ctx.fillRect(-1, -13, 2, 2)
    ctx.restore()
  }
}
function updateFlee(e, dt) {
  e.face = e.fleeDir
  if (e.kind === 'drone') {   // os drones vão embora voando, subindo
    e.x += e.fleeDir * 200 * dt
    e.y -= 34 * dt
    e.vx = e.fleeDir * 200
  } else {
    e.vx = e.fleeDir * 175
    e.x += e.vx * dt
    e.stride += Math.abs(e.vx) * dt
    e.grounded = true
    e.moving = true
  }
  if (e.x < camera - 90 || e.x > camera + width + 90) e.gone = true
}
function spawnHeliSmoke(x, y, { vx = 8, vy = -34, r0 = 5, r1 = 22, life = 1.6, wild = 0 } = {}) {
  if (heliSmoke.length > 190) heliSmoke.shift()
  // cada baforada é uma mancha deformada: vários lóbulos sobrepostos de tamanhos diferentes, esticada de lado e balançando
  const n = 3 + Math.floor(Math.random() * (3 + wild * 3))
  const lobes = Array.from({ length: n }, () => ({ dx: (Math.random() - .5) * 1.5, dy: (Math.random() - .5) * 1.1, k: .38 + Math.random() * .75, grow: .7 + Math.random() * .9 }))
  heliSmoke.push({
    x, y, vx: vx + (Math.random() - .5) * (12 + wild * 26), vy: vy * (.6 + Math.random() * .9),
    r0, r1: r1 * (.75 + Math.random() * (.5 + wild * .35)), age: 0, life: life * (.65 + Math.random() * .8),
    lobes, stretch: .85 + Math.random() * (.7 + wild), rot: (Math.random() - .5) * .8, spin: (Math.random() - .5) * .9,
    ph: Math.random() * 6.3, sway: 5 + Math.random() * (10 + wild * 16), dark: Math.random() < .3 ? 14 : 0
  })
}
function updateHeliSmoke(dt) {
  for (let i = heliSmoke.length - 1; i >= 0; i--) {
    const p = heliSmoke[i]
    p.age += dt
    if (p.age >= p.life) { heliSmoke.splice(i, 1); continue }
    p.x += (p.vx + 6 * p.age + Math.sin(p.age * 3.1 + p.ph) * p.sway) * dt   // o vento empurra e a coluna ondula
    p.y += p.vy * dt
    p.vy *= Math.max(0, 1 - dt * .5)
    p.rot += p.spin * dt
  }
}
function drawHeliSmoke(scroll) {
  ctx.save()
  for (const p of heliSmoke) {
    const k = p.age / p.life, r = p.r0 + (p.r1 - p.r0) * Math.min(1, k * 1.3)
    const shade = Math.round(34 + 70 * k + p.dark)
    ctx.globalAlpha = Math.min(.8, (1 - k) * 1.05) * .5   // várias manchas se somam: cada lóbulo é mais leve
    ctx.fillStyle = `rgb(${shade},${shade - 4},${shade + 10})`
    ctx.save()
    ctx.translate(Math.round(p.x - scroll), Math.round(p.y))
    ctx.rotate(p.rot)
    ctx.scale(p.stretch, 1)
    for (const l of p.lobes) {
      ctx.beginPath()
      ctx.arc(Math.round(l.dx * r), Math.round(l.dy * r), Math.max(1, Math.round(r * l.k * (.6 + l.grow * k * .8))), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}
function heliBlast(x, y, size) {
  droneExplosions.push({ fx: createSpriteFusionExplosion({ x: x*2, y: y*2, ground: y*2, size, seed: Math.round(Math.random()*9000) + 1 }) })
}
function updateHeli(dt, bossActive) {
  const h = boss.heli
  updateHeliSmoke(dt)
  if (!h.cameoDone && h.phase === 'idle' && !bossActive && player.x >= heliCameoX && player.x < heliCameoX + 150) {
    h.cameoDone = true; h.cameo = true; h.cols = []   // sobrevoo a 60% da fase: avisa, volta pela esquerda e atravessa soltando bombas
    h.phase = 'warn'; h.t = 0
    announce('BOMBARDEIO!', 1.2)
    sfx.play('bossShot', { dx: 0 })
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].gone) enemies.splice(i, 1)   // quem fugiu da tela some
  if (h.phase === 'gone') {   // o destroço solta uma coluna de fumaça pelas chamas
    h.smokeT -= dt
    if (h.smokeT <= 0 && h.fireSpots) {
      h.smokeT = .05 + Math.random() * .12   // intervalo irregular: a fumaça sai em baforadas, não em fio
      h.fireSpots.forEach((f, i) => {
        if (Math.random() < .25) return
        spawnHeliSmoke(f.x + (Math.random() - .5) * 18, f.y - 14, i === 0
          ? { vy: -30, r0: 6, r1: 31, life: 3.2, wild: .8, vx: 4 }   // a da frente (nariz): maior, mais torta e mais solta
          : { vy: -32, r0: 6, r1: 30, life: 3.4, wild: .3 })
      })
    }
    return
  }
  if (h.phase === 'idle') {
    if (!bossActive) return
    h.phase = 'enter'; h.t = 0
    boss.x = camera + width + 140
    boss.y = -40
    announce('OFICIAL DE JUSTIÇA', 2)
    sfx.play('bossShot', { dx: 0 })
  }
  h.t += dt
  h.sway += dt
  const dying = h.phase === 'dying'
  const flyby = h.phase === 'leave' || h.phase === 'warn' || h.phase === 'strafe'
  if (!dying) {
    if (!h.cameo) for (const p of players) p.x = clamp(p.x, bossArena - 20, bossArena + 430)   // a arena: ele não deixa o Edu passar nem voltar
    for (const e of enemies) if (e.heli && e.hp > 0) { e.min = player.x - 300; e.max = player.x + 300 }   // os chamados correm até o Edu
    if (flyby) { /* o voo lateral controla a posição abaixo */ } else {
    const exposed = h.phase === 'dive' || h.phase === 'exposed'
    const oldX = boss.x
    const tx = camera + width * .5 + 30 + Math.sin(h.sway * .9) * (exposed ? 16 : 42)
    const ty = exposed ? heliLow : heliHigh
    boss.x += (tx - boss.x) * Math.min(1, dt * (h.phase === 'enter' ? 1.4 : 2.2))
    boss.y += (ty - boss.y) * Math.min(1, dt * (h.phase === 'enter' ? 1.6 : exposed || h.phase === 'rise' ? 4 : 2.4))   // desce e sobe rápido
    h.vx = (boss.x - oldX) / Math.max(dt, 1e-3)
    h.tilt += (Math.max(-1, Math.min(1, h.vx / 120)) * .08 - h.tilt) * Math.min(1, dt * 6)
    }
  }
  if (h.phase === 'enter') {
    h.pose = 0
    if (h.t > 2.2) startHeliOrder()
  } else if (h.phase === 'order') {
    h.pose = h.t < 1.6 ? 2 : 3   // aponta para a esquerda e depois para a direita, de onde vêm os soldados
    while (h.pending.length && h.pending[0].at <= h.t) { const s = h.pending.shift(); spawnHeliEnemy(s.type, s.side) }
    if (!h.pending.length && h.t > 3.6) { h.phase = 'wave'; h.t = 0; h.calm = 0 }
  } else if (h.phase === 'wave') {
    h.pose = Math.floor(h.t / .9) % 3 === 1 ? 6 : 0   // fica sobrevoando, chamando
    if (enemies.some(e => e.heli && e.hp > 0)) h.calm = 0
    else if ((h.calm += dt) > 1.1) { h.phase = 'leave'; h.t = 0; h.sx = boss.x - camera }   // onda eliminada: ele sai da tela e vem bombardear
  } else if (h.phase === 'leave') {
    // sai da tela voando para a direita, subindo
    h.pose = 6
    h.sx += 520 * dt
    boss.x = camera + h.sx
    boss.y += (heliHigh - 25 - boss.y) * Math.min(1, dt * 2)
    h.vx = 520
    h.tilt += (.08 - h.tilt) * Math.min(1, dt * 6)
    if (h.sx > width + heliHalfWidth() + 60) { h.phase = 'warn'; h.t = 0; announce('BOMBARDEIO!', 1.2); sfx.play('bossShot', { dx: 0 }); h.cols = [] }
  } else if (h.phase === 'warn') {
    boss.x = camera + width + 800   // fora da tela, só o aviso: as marcas vermelhas no chão mostram onde as bombas vão cair
    if (!h.cols.length) {
      const step = width < 480 ? 78 : 92, off = h.runs % 2 ? step / 2 : 0   // sempre as mesmas colunas (deslocadas pela metade a cada passada)
      for (let x = 42 + off; x < width - 18; x += step) h.cols.push({ sx: x, done: false, dropped: false })
    }
    if (h.t > 1.0) {   // volta pela esquerda e atravessa a tela
      h.dir = 1; h.runs++
      h.face = 1
      h.sx = -heliHalfWidth() - 60
      h.phase = 'strafe'; h.t = 0
    }
  } else if (h.phase === 'strafe') {
    // atravessa a tela toda soltando uma bomba em cada coluna marcada; as bombas caem retas e explodem no chão, sem mirar no Edu
    h.pose = h.cameo ? heliMeta.poses - 1 : 5   // no sobrevoo a 60% a porta fica fechada
    const speed = 330
    h.sx += speed * dt
    boss.x = camera + h.sx
    boss.y += (heliHigh - 10 - boss.y) * Math.min(1, dt * 3)
    h.vx = speed
    h.tilt += (.08 - h.tilt) * Math.min(1, dt * 6)
    for (const c of h.cols) {
      if (c.dropped || h.sx < c.sx - 8) continue
      c.dropped = true
      bombs.push({ x: camera + c.sx, y: boss.y - 24, vx: 0, vy: 20, rot: 0, col: c })
      sfx.play('patrolShot', { dx: boss.x - player.x })
    }
    if (h.sx > width + heliHalfWidth() + 80) {
      if (h.cameo) {   // o sobrevoo acabou: o helicóptero vai embora e só volta no chefe
        h.cameo = false; h.phase = 'idle'; h.t = 0; boss.x = 6680; boss.y = heliHigh
      } else {
        h.phase = 'return'; h.t = 0; h.face = 1; h.sx = width + heliHalfWidth() + 60
        boss.x = camera + h.sx
      }
    }
  } else if (h.phase === 'return') {
    h.pose = 0
    if (h.t > 1.6) { h.phase = 'dive'; h.t = 0; h.cols = [] }
  } else if (h.phase === 'dive') {
    h.pose = player.x < boss.x ? 4 : 5   // aponta para baixo, para o lado do Edu
    if (boss.y > heliLow - 3) { h.phase = 'exposed'; h.t = 0; h.exposedT = 2.8 }   // pouco tempo na linha de tiro
  } else if (h.phase === 'exposed') {
    const alt = Math.floor(h.t / .45) % 2   // alterna as duas variações do gesto, sempre apontando para o lado do Edu
    h.pose = elapsed < h.hitUntil ? 7 : player.x < boss.x ? (alt ? 8 : 4) : (alt ? 9 : 5)
    if (h.t > h.exposedT) {
      if (h.wave >= heliWaves.length) { boss.hp = 0; startHeliDeath() }   // fim da 3ª onda: o helicóptero não aguenta mais e cai
      else { h.phase = 'rise'; h.t = 0 }
    }
  } else if (h.phase === 'rise') {
    h.pose = 1
    if (boss.y < heliHigh + 4) startHeliOrder()
  } else if (dying) {
    h.dyingT += dt
    h.pose = 6
    const RISE = .85   // primeiro o helicóptero sobe, engasgando, com faíscas e fumaça; depois despenca
    if (h.dyingT < RISE) {
      boss.y -= 85 * (1 - h.dyingT / RISE) * dt
      h.tilt = Math.sin(h.dyingT * 34) * .045
      if ((h.nextBlast -= dt) <= 0) {
        h.nextBlast = .16
        heliBlast(boss.x + (Math.random() - .5) * 120, boss.y - 20 - Math.random() * 50, .45)
        sfx.play('droneBlast', { dx: boss.x - player.x })
      }
    } else {
      const fall = h.dyingT - RISE
      boss.y += (50 + fall * 190) * dt
      boss.x += 24 * dt
      h.tilt += (.5 - h.tilt) * Math.min(1, dt * 2)
      if ((h.nextBlast -= dt) <= 0 && boss.y < groundY - 8) {
        h.nextBlast = .22
        heliBlast(boss.x + (Math.random() - .5) * 90, boss.y - 10 - Math.random() * 40, .8 + Math.random() * .4)
        sfx.play('droneBlast', { dx: boss.x - player.x })
      }
    }
    // rastro de fumaça escura por todo o tombo
    for (let n = 0; n < 2; n++) spawnHeliSmoke(boss.x + (Math.random() - .5) * 150, boss.y - 25 - Math.random() * 40, { vy: -22, r0: 7, r1: 26, life: 1.7 })
    if (boss.y >= groundY && h.dyingT > RISE) {   // bateu no chão: explosão grande e fica o destroço
      boss.y = groundY
      h.phase = 'gone'
      h.gone = true
      h.wreckX = boss.x
      // o destruído fica no chão; fogo animado (campfire do pixelfx) em cima das chamas pintadas na arte, mais a fumaça
      const wm = heliMeta.wreck, hs = heliScale() * heliWreckScale
      const wl = boss.x - wm.size[0] / pixelScale * hs / 2, wt = groundY + 3 - wm.size[1] / pixelScale * hs
      h.fireSpots = wm.fires.map(([fx, fy, flame]) => ({ x: wl + fx / pixelScale * hs, y: wt + fy / pixelScale * hs }))
      for (const [i, [fx, fy, flame]] of wm.fires.entries()) gameFx.fire({ x: h.fireSpots[i].x, y: h.fireSpots[i].y, height: flame * hs * 1.15 })
      heliBlast(boss.x, groundY - 6, 2)
      heliBlast(boss.x - 40, groundY - 4, 1.3)
      heliBlast(boss.x + 40, groundY - 4, 1.3)
      sfx.play('bossDown')
      announce('O OFICIAL CAIU · AVANCE', 2.5)
    }
  }
}

function firstShotHit(shot, travel, bossActive) {
  let hit
  let nearest = travel
  function check(target, halfWidth, top, bottom, cx = target.x) {
    if (target.hp <= 0 || shot.y < top || shot.y > bottom) return
    const ahead = (cx-shot.x)*shot.dx
    if (ahead + halfWidth < 0) return
    const distance = Math.max(0,ahead-halfWidth)
    if (distance > nearest || (hit && distance === nearest)) return
    nearest = distance
    hit = { target, x: shot.x + distance*shot.dx }
  }
  for (const enemy of enemies) {
    if (enemy.kind === 'drone') check(enemy,18*charScale,enemy.y-14*charScale,enemy.y+14*charScale)
    else check(enemy,12*charScale,enemy.y-66*charScale,enemy.y)
  }
  if (bossActive) {
    if (heliBoss) {   // o casco do helicóptero (sem o rotor e a cauda), na escala e no sentido em que está desenhado
      const s = heliScale(), h = boss.heli
      check(boss, 118*s, boss.y-100*s, boss.y-12*s, boss.x + (heliMeta.frame[0]/2 - heliMeta.anchor[0]) / pixelScale * s)
    }
    else check(boss,36,boss.y-58,boss.y)
  }
  return hit
}

function updateCombat(dt) {
  const targets = alivePlayers()
  const front = player   // o líder (já escolhido por quem chamou)
  while (impacts.length && elapsed-impacts[0].at >= impactDuration) impacts.shift()
  const bossActive = player.x > bossArena && boss.hp > 0 && !finish
  if (heliBoss) { updateHeli(dt, bossActive); updateBombs(dt) }
  else if (bossActive && (boss.delay -= dt) <= 0) {
    const low = boss.volley++ % 2 === 1
    boss.delay = boss.hp <= bossHp/2 ? .82 : 1.25
    const [x,y] = bossMuzzles[low ? 2 : 1]
    enemyShots.push({x:boss.x+x,y:boss.y+y,vx:-145})
    sfx.play('bossShot', { dx: boss.x - player.x })
    if (boss.hp <= bossHp/2 && boss.volley % 3 === 0) {
      const [ox,oy] = bossMuzzles[low ? 1 : 2]
      enemyShots.push({x:boss.x+ox,y:boss.y+oy,vx:-118})
    }
  }
  if (!heliBoss && boss.hp > 0) for (const p of targets) if (p.x > boss.x-40) p.x = boss.x-40
  const topOf = (p) => p.y - (p.crouch > .6 ? 40 : 58) * charScale
  const nearest = (x) => targets.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a), targets[0] ?? front)
  for (const enemy of enemies) {
    enemy.hitKick = (enemy.hitKick || 0) * Math.max(0,1-dt*15)
    enemy.hitKickY = (enemy.hitKickY || 0) * Math.max(0,1-dt*18)
    if (enemy.hp <= 0) {
      if ((enemy.kind === 'patrol' || enemy.kind === 'melee') && enemy.fallAge < 1.2) updatePatrolFall(enemy, dt)
      else if (enemy.kind === 'drone') updateDroneFall(enemy,dt)
      continue
    }
    if (enemy.fleeing) { updateFlee(enemy, dt); continue }
    if (enemy.rear && enemy.kind === 'patrol') { enemy.min = Math.min(camera - 70, enemy.x); enemy.max = camera + width + 40 }   // reforço das costas: acompanha a câmera
    player = nearest(enemy.x)   // cada inimigo mira o jogador mais próximo
    const playerTop = topOf(player)
    const distance = player.x - enemy.x
    const config = enemyTypes[enemy.type]
    if (enemy.kind === 'patrol' || enemy.kind === 'melee') {
      const struck = enemy.kind === 'melee' ? updateMelee(enemy,distance,config,dt) : (updatePatrol(enemy,distance,config,dt), false)
      if (struck && hitPlayer()) continue
      // encostar mata nos soldados; o Fofão só machuca com a faca (golpes e investida): sem dano de contato
      if (enemy.kind === 'patrol' && Math.abs(player.x-enemy.x) < 15*charScale && player.y > enemy.y-56*charScale && playerTop < enemy.y && hitPlayer()) continue
      continue
    }
    const eliteDrone = enemy.type === 'heavyDrone'
    // O drone comum mantém o voo original. O Elite patrulha uma faixa vertical ampla;
    // a segunda onda quebra a repetição mecânica sem criar trancos ou mudanças bruscas.
    const hoverPhase = enemy.origin*.015
    enemy.y = enemy.spawnY + (eliteDrone
      ? Math.sin(elapsed*1.12 + hoverPhase)*22 + Math.sin(elapsed*.47 + hoverPhase*.7)*5
      : Math.round(Math.sin(elapsed*3 + enemy.origin)*4))
    enemy.moving = false
    if (enemy.glideTo !== undefined) {   // fase 2.1: o drone entra voando pela lateral antes de atacar
      const step = Math.sign(enemy.glideTo - enemy.x) * 150 * dt
      enemy.moving = true
      enemy.face = Math.sign(step) || enemy.face
      if (Math.abs(enemy.glideTo - enemy.x) <= Math.abs(step)) { enemy.x = enemy.glideTo; enemy.glideTo = undefined }
      else enemy.x += step
      continue
    }
    if (Math.abs(distance) > config.reach) {
      if (eliteDrone) enemy.burst = 0
      continue
    }
    enemy.face = Math.sign(distance) || enemy.face
    if (eliteDrone && enemy.burst > 0) {
      enemy.burstDelay -= dt
      while (enemy.burst > 0 && enemy.burstDelay <= 0) {
        const [x,y] = (enemyMuzzles[enemy.type] || enemyMuzzles.drone).map(v => v*charScale)
        enemyShots.push({x:enemy.x + enemy.face*x,y:enemy.y+y,vx:enemy.face*config.shotSpeed,vy:0})
        sfx.play('droneShot', { dx: enemy.x - player.x })
        enemy.burst--
        enemy.burstDelay += config.burstRate
      }
      if (enemy.burst === 0) enemy.delay = config.interval
      continue
    }
    enemy.delay -= dt
    const warningTime = eliteDrone ? .28 : .34
    if (Math.abs(distance) > 88 && enemy.delay > warningTime) {
      const next = clamp(enemy.x + enemy.face*config.speed*dt, enemy.origin-48, enemy.origin+48)
      enemy.moving = next !== enemy.x
      enemy.x = next
    }
    if (enemy.delay <= 0) {
      if (eliteDrone) {
        enemy.burst = config.burstShots
        enemy.burstDelay = 0
      } else {
        enemy.delay = config.interval
        const [x,y] = enemyMuzzles.drone.map(v => v*charScale)
        enemyShots.push({x:enemy.x + enemy.face*x,y:enemy.y+y,vx:enemy.face*155,vy:36})
      }
    }
  }

  player = front
  for (let i = shots.length-1; i >= 0; i--) {
    const shot = shots[i]
    const travel = Math.min(dt,shot.t)*430
    const hit = firstShotHit(shot,travel,bossActive)
    if (hit) {
      const { target, x } = hit
      impacts.push({x,y:shot.y,dx:shot.dx,at:elapsed})
      sfx.play('hitEnemy', { dx: x - player.x })
      gameFx.hit({ x, y: shot.y, floor: target.y, dx: shot.dx })
      target.flashUntil = elapsed + (target.kind === 'drone' ? .12 : flashDuration)
      if (target === boss && heliBoss) boss.heli.hitUntil = elapsed + .3
      if (target !== boss) {
        target.hitKick = shot.dx*6
        target.hitKickY = -2.5
      }
      if (--target.hp === 0) {
        if (target === boss && heliBoss) startHeliDeath()
        else if (target === boss) {
          score += 1500
          enemyShots.length = 0
          announce('O COBRADOR CAIU · AVANCE',2.5)
          sfx.play('bossDown')
          gameFx.huge({ x: boss.x, floor: groundY })   // o chefe some numa explosão enorme
        } else {
          score += enemyTypes[target.type].points
          if (target.kind === 'patrol' || target.kind === 'melee') {
            target.fallAge = 0
            target.attackAge = -1
            playSoldierDeathSound(target.x - player.x)
          }
          else {
            target.deathAge = 0
            target.crashAt = null
            target.crashExplosion = false
            target.grounded = false
            target.vy = 18
            target.y += 17
          }
        }
      }
      shots.splice(i,1)
      continue
    }
    shot.x += shot.dx*travel
    shot.t -= dt
    if (shot.t <= 0) shots.splice(i,1)
  }

  for (let i = enemyShots.length-1; i >= 0; i--) {
    const shot = enemyShots[i]
    shot.x += shot.vx * dt
    shot.y += (shot.vy ?? 0) * dt
    const victim = targets.find((p) => Math.abs(shot.x-p.x) < 9*charScale && shot.y >= topOf(p) && shot.y <= p.y)
    if (victim || shot.y > height || shot.x < front.x-520 || shot.x > front.x+520) enemyShots.splice(i,1)
    if (victim) {
      player = victim
      const hurt = hitPlayer()
      player = front
      if (hurt) break   // quem perde a vida limpa a lista de tiros inimigos: o laço termina aqui
    }
  }
  bossMeter.value = boss.hp
  bossHud.hidden = !bossActive || boss.hp === 0
}

function playerPose() {
  // o conjunto do personagem (o do Operador só vale se as folhas dele foram carregadas)
  const set = player.character === 'operativo' && heroSets.operativo && sprites.op_run ? heroSets.operativo : heroSets.edu
  const s = set.prefix
  if (player.fall) {
    const frame = Math.min(sequences.playerFall.count - 1, Math.floor(player.fall.age / fallFrameDuration))
    return { sheet: s + 'playerFall', frame }
  }
  const holdingAim = player.trigger || player.cooldown > 0
  if (player.crouch > 0) {
    if (holdingAim) return { sheet: s + 'crouch', frame: 2, muzzle: set.crouch }
    return { sheet: s + 'crouch', frame: player.crouch < .6 ? 0 : 1 }
  }
  if (!player.grounded) {
    // pulo: 0 subindo, 1 caindo, 2 e 3 os mesmos mirando; subindo, as pernas encolhem e o corpo sobe
    const rising = player.vy < 0
    const lift = rising ? set.tuckLift : 0
    if (player.trigger || player.cooldown > .04) return { sheet: s + 'jump', frame: rising ? 2 : 3, lift, muzzle: set.jump[rising ? 0 : 1] }
    return { sheet: s + 'jump', frame: rising ? 0 : 1, lift }
  }
  if (Math.abs(player.vx) > 8) {
    const frame = Math.floor(player.phase)
    if (player.trigger || player.cooldown > .04) return { sheet: s + 'runFire', frame, muzzle: set.runFire[frame] }
    return { sheet: s + 'run', frame }
  }
  if (holdingAim) return { sheet: s + 'idleFire', frame: 0, muzzle: set.idleFire }
  return { sheet: s + 'idle', frame: Math.floor(player.idleTime * breathingFps) % sequences.idle.count }
}

function fill(context,color,x,y,w,h) {
  context.fillStyle = color
  context.fillRect(Math.round(x),Math.round(y),w,h)
}
function noise(x,y) {
  return ((Math.imul(x + 137,1664525) ^ Math.imul(y + 971,1013904223)) >>> 8) % 997 / 997
}
function terrain(x,y,w,scroll) {
  const left = x - scroll
  if (left + w < 0 || left > width) return
  const depth = y > groundY - 36 ? height - y + 4 : 16   // perto do chão vira bloco até o fim da tela
  fill(ctx,'#292039',left,y,w,depth)
  fill(ctx,'#e4afb2',left,y,w,3)
  fill(ctx,'#8f707c',left,y+3,w,4)
  for (let col=0; col<w; col+=12) {
    const px = left + col
    if (px < -12 || px > width) continue
    const segment = Math.min(w-col,12)
    const detail = noise(x+col,y)
    fill(ctx,'#403449',px,y+8,segment-1,5)
    if (detail > .45) fill(ctx,'#684856',px+2,y+13,2,Math.min(depth-13,12))
    if (depth > 20 && detail > .58) fill(ctx,'#171123',px,y+26,segment-2,14)
    if (depth > 20 && col%48===0) fill(ctx,'#a98263',px,y+2,Math.min(segment,8),2)
  }
}
function enemyFrame(sheet, frame, x, y, face, hitFlash = false, tint = null) {
  const [w,h,anchorX,anchorY] = enemyFrames[sheet]
  ctx.save()
  ctx.translate(Math.round(x),Math.round(y))
  const widthScale = sheet === 'elite' || sheet === 'eliteFall' ? eliteWidthScale : 1
  const spriteScale = sheet === 'drone' ? standardDroneScale : 1
  const droneFacing = sheet === 'heavyDrone' || sheet === 'eliteDroneDeath'
  const sheetScale = sheet.startsWith('fofao') || sheet.startsWith('chapolim') ? .5 : 1   // as folhas do Fofão estão em 2x
  ctx.scale((droneFacing ? face : -face) * widthScale * spriteScale * charScale * sheetScale,spriteScale * charScale * sheetScale)
  const columns = sheet === 'fofaoFall' || sheet === 'chapolimFall' || sheet === 'chapolimJump' ? 5 : sheet.startsWith('fofao') || sheet.startsWith('chapolim') ? 4 : sheet === 'droneDeath' || sheet === 'eliteDroneDeath' ? 6 : sheet === 'patrol' || sheet === 'patrolFall' || sheet === 'elite' || sheet === 'eliteFall' ? 4 : 3
  const sx = (frame%columns)*w
  const sy = Math.floor(frame/columns)*h
  // O último quadro dos drones tinha fumaça estática no topo; recorta só a sucata.
  const cropTop = (sheet === 'droneDeath' || sheet === 'eliteDroneDeath') && frame === 5 ? 40 : 0
  const sourceHeight = h-cropTop
  if (hitFlash || tint) {
    flashCtx.clearRect(0,0,w,h)
    flashCtx.drawImage(sprites[sheet],sx,sy+cropTop,w,sourceHeight,0,cropTop,w,sourceHeight)
    flashCtx.globalCompositeOperation = 'source-atop'
    flashCtx.fillStyle = hitFlash ? 'rgba(255, 34, 46, .76)' : tint
    flashCtx.fillRect(0,0,w,h)
    flashCtx.globalCompositeOperation = 'source-over'
    ctx.drawImage(flashSprite,0,cropTop,w,sourceHeight,-anchorX,-anchorY+cropTop,w,sourceHeight)
  } else ctx.drawImage(sprites[sheet],sx,sy+cropTop,w,sourceHeight,-anchorX,-anchorY+cropTop,w,sourceHeight)
  ctx.restore()
}

function drawDroneDeathFlash(x,y,age) {
  if (age < 0 || age >= .16) return
  const t = age/.16
  const reach = Math.round(7 + t*19)
  ctx.save()
  ctx.globalAlpha = 1-t
  fill(ctx,'#fff7cf',x-reach,y-2,reach*2,4)
  fill(ctx,'#fff7cf',x-2,y-reach,4,reach*2)
  fill(ctx,'#ffb338',x-7-t*5,y-7-t*5,14+t*10,14+t*10)
  fill(ctx,'#fffbe8',x-4,y-4,8,8)
  ctx.restore()
}

// Renderiza diretamente o Explosion VFX oficial do Sprite Fusion (MIT).
function drawDroneCrashExplosions(layer,scroll) {
  if (!droneExplosions.length) return
  explosionFrame.ox = scroll
  explosionFrame.color.fill(0)
  explosionFrame.light.fill(0)
  for (const explosion of droneExplosions) explosion.fx.draw(explosionFrame,layer)
  explosionColorCtx.putImageData(explosionColorImage,0,0)
  explosionLightCtx.putImageData(explosionLightImage,0,0)
  ctx.drawImage(explosionColorCanvas,0,0)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(explosionLightCanvas,0,0)
  ctx.restore()
}

function drawDroneWreckSmoke(enemy,x,y) {
  if (!Number.isFinite(enemy.crashAt)) return
  const seed = enemy.origin*.013
  ctx.save()
  for (let i = 0; i < 5; i++) {
    const age = (elapsed-enemy.crashAt+i*.29)%1.45
    const t = age/1.45
    const alpha = Math.sin(Math.PI*t)*.58
    const px = x + Math.sin(seed+i*2.2+t*4)*3 + t*4
    const py = y-17-t*17-i%2
    const size = 2+Math.round(t*4)
    ctx.globalAlpha = alpha
    fill(ctx,i%2 ? '#5b5261' : '#393742',px-size/2,py-size/2,size,size)
    if (size >= 4) fill(ctx,'#77707a',px-size/2+1,py-size/2+1,Math.max(1,size-3),Math.max(1,size-3))
  }
  ctx.restore()
}

function drawEnemies(scroll) {
  drawAfterimages(scroll)
  // marca do pouso do Chapolim: elipse que pisca no chão do Edu enquanto ele está lá em cima
  for (const e of enemies) {
    if (e.hp <= 0 || (e.special !== 'hang' && e.special !== 'fall')) continue
    const k = e.special === 'fall' ? 1 : e.specialAge / chapolimLeap.hang
    const pulse = Math.floor(elapsed * (8 + 14 * k)) % 2 ? 1 : .55
    ctx.save()
    ctx.globalAlpha = (.25 + .35 * k) * pulse
    ctx.fillStyle = '#ff3b2e'
    ctx.beginPath()
    ctx.ellipse(Math.round(e.landX - scroll), Math.round(e.landY) + 1, 30, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = Math.min(1, .5 + .5 * k) * pulse
    ctx.strokeStyle = '#ffd24a'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
  for (const enemy of enemies) {
    const x = enemy.x-scroll+(enemy.hitKick || 0)
    const y = enemy.y+(enemy.hitKickY || 0)
    if (x < -90 || x > width+90) continue
    if (enemy.hp <= 0) {
      if (enemy.kind === 'melee' && enemy.fallAge < 1.2) {   // some junto com o tempo de queda, como o corpo dos soldados
        // queda do Fofão: derruba para trás (5 quadros); fica um instante no chão
        enemyFrame(enemy.type === 'chapolim' ? 'chapolimFall' : 'fofaoFall', Math.min(enemy.grounded ? 4 : 2, Math.floor(enemy.fallAge/.11)), x, enemy.y, enemy.face, elapsed < enemy.flashUntil)
      } else if (enemy.kind === 'patrol' && enemy.fallAge < 1.2) {
        const frame = Math.min(enemy.grounded ? 3 : 2, Math.floor(enemy.fallAge/.095))
        enemyFrame(enemy.type === 'elite' ? 'eliteFall' : 'patrolFall', frame, x, enemy.y, enemy.face, elapsed < enemy.flashUntil)
      } else if (enemy.kind === 'drone' && enemy.y < height+70) {
        const frame = enemy.grounded
          ? elapsed-enemy.crashAt < .14 ? 4 : 5
          : Math.min(3,Math.floor(enemy.deathAge/.14))
        drawDroneDeathFlash(x,y,enemy.deathAge)
        if (frame === 5) drawDroneWreckSmoke(enemy,x,y)
        enemyFrame(enemy.type === 'heavyDrone' ? 'eliteDroneDeath' : 'droneDeath',frame,x,y,enemy.face)
      }
      continue
    }
    if (enemy.kind === 'melee') {
      const config = enemyTypes[enemy.type]
      if (enemy.type === 'chapolim') {
        const flash = elapsed < enemy.flashUntil
        if (enemy.special) {   // 0 agacha; 1-4 sobe; (fora da tela); 5-8 despenca; 9 impacto
          const k = enemy.special === 'rise' ? Math.min(.99, enemy.specialAge / chapolimLeap.rise) : enemy.special === 'fall' ? Math.min(.99, enemy.specialAge / chapolimLeap.fall) : 0
          if (enemy.special === 'coil') enemyFrame('chapolimJump', 0, x, y, enemy.face, flash)
          else if (enemy.special === 'rise') enemyFrame('chapolimJump', 1 + Math.floor(k * 4), x, y, enemy.face, flash)
          else if (enemy.special === 'fall') enemyFrame('chapolimJump', 5 + Math.floor(k * 4), x, y, enemy.face, flash)
          else if (enemy.special === 'land') enemyFrame('chapolimJump', 9, x, y, enemy.face, flash)
          continue
        }
        if (enemy.attackAge >= 0) {   // 0-3: marreta sobe; 4-5: desce; 6: impacto; 7: volta
          const age = enemy.attackAge, slashEnd = config.windup + config.slash
          const frame = age < config.windup ? Math.floor(age/config.windup*4)
            : age < config.windup + config.slash*.35 ? 4 : age < config.windup + config.slash*.7 ? 5
            : age < slashEnd + config.recover*.4 ? 6 : 7
          enemyFrame('chapolimAttack', Math.min(7, frame), x, y, enemy.face, flash)
        } else if (enemy.grounded && Math.abs(enemy.vx) < 3) {
          enemyFrame('chapolimAttack', Math.floor(elapsed*2.5 + enemy.origin) & 1, x, y, enemy.face, flash)
        } else {
          const frame = !enemy.grounded ? (enemy.vy < 0 ? 2 : 0) : Math.floor(enemy.stride/8) % 8
          enemyFrame('chapolimRun', frame, x, y, enemy.face, flash)
        }
        continue
      }
      if (enemy.special) {   // investida: agachado piscando (aviso), corrida esticada, recuperação em guarda
        if (enemy.special === 'crouch') enemyFrame('fofaoRun', 7, x, y, enemy.face, false, Math.floor(elapsed*14) % 2 ? 'rgba(255, 255, 255, .6)' : null)
        else if (enemy.special === 'dash') enemyFrame('fofaoRun', 0, x, y, enemy.face)
        else enemyFrame('fofaoAttack', 3, x, y, enemy.face, elapsed < enemy.flashUntil)
        continue
      }
      if (enemy.attackAge >= 0) {
        const age = enemy.attackAge
        const slashEnd = config.windup + config.slash
        let sheet, frame
        if (enemy.attackKind === 1) {   // golpe 2: guarda (0-1), faca levantada (2-3), estocada (4-5), volta (6-7)
          sheet = 'fofaoAttack2'
          frame = age < config.windup ? Math.floor(age/config.windup*4)
            : age < slashEnd ? (age < config.windup + config.slash*.5 ? 4 : 5)
            : age < slashEnd + config.recover*.5 ? 6 : 7
        } else {                        // golpe 1: faca atravessada (2-5), estocada (6), faca esticada (7)
          sheet = 'fofaoAttack'
          frame = age < config.windup ? 2 + Math.floor(age/config.windup*4)
            : age < config.windup + config.slash*.5 ? 6 : 7
        }
        enemyFrame(sheet, Math.min(7, frame), x, y, enemy.face, elapsed < enemy.flashUntil)
      } else {
        if (enemy.grounded && Math.abs(enemy.vx) < 3) {
          // parado: guarda de luta com a faca à frente (quadros 3 e 4 do golpe 1, que se alternam devagar como um respirar)
          enemyFrame('fofaoAttack', 3 + (Math.floor(elapsed*2.5 + enemy.origin) & 1), x, y, enemy.face, elapsed < enemy.flashUntil)
        } else {
          const frame = !enemy.grounded ? (enemy.vy < 0 ? 2 : 0) : Math.floor(enemy.stride/8) % 8
          enemyFrame('fofaoRun', frame, x, y, enemy.face, elapsed < enemy.flashUntil)
        }
      }
      continue
    }
    let frame
    if (enemy.kind === 'patrol') {
      if (!enemy.grounded) frame = enemy.airTime < .08 ? 4 : enemy.vy < 0 ? 5 : 6
      else if (enemy.aiming) frame = 8
      else if (enemy.landing > 0) frame = 7
      else frame = Math.abs(enemy.vx) < 5 ? 8 : Math.floor(enemy.stride/12)
    } else if (enemy.type === 'heavyDrone') frame = enemy.burst > 0 || enemy.delay <= .28 ? 2 : Math.floor(elapsed*6)%2
    else frame = enemy.delay <= .34 ? 2 : Math.floor(elapsed*9)%2
    const sheet = enemy.type === 'elite' ? 'elite' : enemy.type === 'heavyDrone' ? 'heavyDrone' : enemy.kind
    enemyFrame(sheet, frame, x, y, enemy.face, elapsed < enemy.flashUntil)
  }
  if (heliBoss) { drawBombs(scroll); drawHeli(scroll); return }
  const x = boss.x-scroll
  if (boss.hp <= 0 || x < -90 || x > width+90) return
  const warning = players.some((p) => p.x > bossArena) && boss.delay <= .36
  const firing = boss.volley > 0 && boss.delay > (boss.hp <= bossHp/2 ? .68 : 1.11)
  const low = (boss.volley - Number(firing)) % 2 === 1
  const frame = warning || firing ? (low ? 2 : 1) : 0
  enemyFrame('boss',frame,x,boss.y,-1)
  if (warning) {
    const [mx,my] = bossMuzzles[frame]
    fill(ctx,'#ffd882',x+mx,boss.y+my-2,3,4)
  }
}
const heliFlashCanvas = document.createElement('canvas')
// Quadro do giro (0 = pás nítidas ... 4 = disco): o rotor já entra em cena girando, alterna os quadros mais rápidos
// (o disco e uma pá borrada, para cintilar) e, quando ele cai, o giro vai parando
const heliSpinCycle = [4, 4, 3, 4, 4, 2]
function heliSpin(h) {
  if (h.phase === 'dying') return Math.max(0, 4 - Math.floor(h.dyingT * 2.4))
  return heliSpinCycle[Math.floor(elapsed * 20) % heliSpinCycle.length]
}
function drawHeli(scroll) {
  const h = boss.heli
  if (h.phase === 'gone') {
    const wm = heliMeta.wreck, hs = heliScale() * heliWreckScale
    const w = wm.size[0] / pixelScale * hs, hgt = wm.size[1] / pixelScale * hs
    ctx.drawImage(sprites.heliWreck, Math.round(h.wreckX - scroll - w / 2), Math.round(groundY + 3 - hgt), w, hgt)
    drawHeliSmoke(scroll)
    return
  }
  if (h.phase === 'idle') return
  const [fw, fh] = heliMeta.frame
  const hs = heliScale()
  const half = hs / pixelScale   // as folhas estão em 2x
  const x = Math.round(boss.x - scroll)
  if (x < -heliMeta.frame[0] * half || x > width + heliMeta.frame[0] * half) return
  const bob = h.phase === 'dying' ? 0 : Math.sin(elapsed * 5) * 1.6
  const y = Math.round(boss.y + bob)
  const [ax, ay] = heliMeta.anchor
  // sombra no chão: some com a altura
  const altitude = Math.max(0, groundY - boss.y)
  ctx.save()
  ctx.globalAlpha = Math.max(0, .34 - altitude / 420)
  ctx.fillStyle = '#05030a'
  ctx.beginPath()
  ctx.ellipse(x - 8, groundY + 3, (118 - altitude * .2) * hs, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.translate(x, y - 60 * hs)   // inclina um pouco para o lado em que voa, em torno do meio do casco
  ctx.rotate(h.tilt)
  ctx.translate(0, 60 * hs)
  const pose = h.pose
  const sx = (pose % heliMeta.cols) * fw, sy = Math.floor(pose / heliMeta.cols) * fh
  // corpo, cauda e rotor são montados numa imagem só: assim tudo pisca junto quando o helicóptero leva tiro
  const PAD = 24, cw = fw + PAD * 2, chh = fh + PAD * 2
  if (heliFlashCanvas.width !== cw) { heliFlashCanvas.width = cw; heliFlashCanvas.height = chh }
  const cctx = heliFlashCanvas.getContext('2d')
  cctx.clearRect(0, 0, cw, chh)
  const spin = heliSpin(h)
  cctx.drawImage(sprites.heliBody, sx, sy, fw, fh, PAD, PAD, fw, fh)
  const tail = heliMeta.tails[spin], rotor = heliMeta.rotors[spin]
  cctx.drawImage(sprites['heliTail' + (spin + 1)], PAD + tail.x, PAD + tail.y)
  cctx.drawImage(sprites['heliRotor' + (spin + 1)], PAD + rotor.x, PAD + rotor.y)
  if (elapsed < boss.flashUntil) {
    cctx.globalCompositeOperation = 'source-atop'
    cctx.fillStyle = 'rgba(255, 34, 46, .6)'
    cctx.fillRect(0, 0, cw, chh)
    cctx.globalCompositeOperation = 'source-over'
  }
  ctx.drawImage(heliFlashCanvas, 0, 0, cw, chh, (-ax - PAD) * half, (-ay - PAD) * half, cw * half, chh * half)
  ctx.restore()
  drawHeliSmoke(scroll)
}
// Helicóptero ao fundo (depois do 1º checkpoint): pequeno, com a porta fechada, atravessa o cenário atrás dos prédios e some
const heliFarCanvas = document.createElement('canvas')
function drawFarHeli() {
  const f = farHeli
  if (!f || f.delay > 0) return
  const [fw, fh] = heliMeta.frame
  const PAD = 24, cw = fw + PAD * 2, chh = fh + PAD * 2
  if (heliFarCanvas.width !== cw) { heliFarCanvas.width = cw; heliFarCanvas.height = chh }
  const c = heliFarCanvas.getContext('2d')
  c.clearRect(0, 0, cw, chh)
  const pose = heliMeta.poses - 1   // a última pose da folha: porta fechada, sem o Oficial
  c.drawImage(sprites.heliBody, (pose % heliMeta.cols) * fw, Math.floor(pose / heliMeta.cols) * fh, fw, fh, PAD, PAD, fw, fh)
  const spin = heliSpinCycle[Math.floor(elapsed * 20) % heliSpinCycle.length]
  const tail = heliMeta.tails[spin], rotor = heliMeta.rotors[spin]
  c.drawImage(sprites['heliTail' + (spin + 1)], PAD + tail.x, PAD + tail.y)
  c.drawImage(sprites['heliRotor' + (spin + 1)], PAD + rotor.x, PAD + rotor.y)
  c.globalCompositeOperation = 'source-atop'   // véu de distância: roxo, como o ar da cidade
  c.fillStyle = 'rgba(120, 70, 150, .32)'
  c.fillRect(0, 0, cw, chh)
  c.globalCompositeOperation = 'source-over'   // senão, no quadro seguinte nada seria desenhado
  const s = .34 / pixelScale   // bem menor que o helicóptero do chefe: está longe
  const [ax, ay] = heliMeta.anchor
  ctx.save()
  ctx.globalAlpha = .94
  ctx.translate(Math.round(f.sx), Math.round(f.y + Math.sin(elapsed * 6) * 1.2))
  ctx.rotate(.07)   // inclinado para a frente: voa com pressa
  ctx.drawImage(heliFarCanvas, 0, 0, cw, chh, (-ax - PAD) * s, (-ay - PAD) * s, cw * s, chh * s)
  ctx.restore()
}
function drawMover(m,scroll) {
  if (m.manual) return
  const left = Math.round(m.cx-scroll)
  const top = Math.round(m.cy)
  if (left + m.w < 0 || left > width) return
  fill(ctx,'#292039',left,top,m.w,10)
  fill(ctx,'#e4afb2',left,top,m.w,3)
  fill(ctx,'#8f707c',left,top+3,m.w,2)
  for (let i = 0; i < m.w; i += 8) fill(ctx,(i/8)%2 ? '#1b1424' : '#f4bb65',left+i,top+6,Math.min(4,m.w-i),3)
  fill(ctx,'#403449',left+m.w/2-2,top+10,4,4)
}
function marker(x,y,scroll,isGoal,lit) {
  const left = x-scroll
  const color = lit ? '#8cf5ad' : '#f4bb65'
  fill(ctx,'#233337',left-2,y-34,5,34)
  fill(ctx,'#243139',left,y-35,isGoal ? 23 : 15,12)
  fill(ctx,color,left+2,y-33,isGoal ? 19 : 11,2)
  fill(ctx,color,left+2,y-29,isGoal ? 19 : 11,2)
}
function atlas(context,sheet,index,x,y,size) {
  context.drawImage(sprites[sheet],(index%4)*cell,Math.floor(index/4)*cell,cell,cell,x,y,size,size)
}
// Desenha um quadro do Edu com o eixo do corpo em x e os pés em y; scale = unidades por pixel do sprite
function heroAtlas(context,sheet,index,x,y,scale) {
  const { w, h, anchorX, feetY } = heroCell
  context.drawImage(sprites[sheet],(index%4)*w,Math.floor(index/4)*h,w,h,x-anchorX*scale,y-feetY*scale,w*scale,h*scale)
}
// Tempo fechando: tira a cor (saturation com cinza) e escurece com um azul-acinzentado (multiply), tudo proporcional a "weather"
function drawWeatherGrade() {
  ctx.save()
  ctx.globalCompositeOperation = 'saturation'
  ctx.globalAlpha = weather * .5
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = weather * .5
  ctx.fillStyle = '#9aa0b8'
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}
function render() {
  ctx.save()
  ctx.scale(pixelScale,pixelScale)
  renderWorld()
  if (onTruck) {   // o tempo fecha e a chuva cai por cima de tudo
    if (weather > .02) drawWeatherGrade()
    gameFx.drawRain(ctx, rainAmount)
    if (storm.flash > .01) { ctx.save(); ctx.globalAlpha = storm.flash * .45; ctx.fillStyle = '#dfe8ff'; ctx.fillRect(0, 0, width, height); ctx.restore() }   // clarão do raio
  }
  if ((endSeq && endSeq.wiped) || (outSeq && outSeq.wiped)) {   // a tela fecha: vidro por cima; quando ele estoura, por baixo só há escuro
    if (gameFx.wipeTime > 1.5) { ctx.fillStyle = '#050408'; ctx.fillRect(0,0,width,height) }
    gameFx.drawWipe(ctx,width,height)
  }
  ctx.restore()
  sample.clearRect(0,0,preview.width,preview.height)
  if (heroSheets.has(previewSequence)) heroAtlas(sample,previewSequence,previewFrame,46,74,.46)
  else atlas(sample,previewSequence,previewFrame,15,-3,82)
  if (readFrame !== previewFrame) {
    const count = sequences[previewSequence].count
    frameText.textContent = count === 1 ? 'POSE FIXA' : 'QUADRO 0' + (previewFrame+1) + ' / 0' + count
    frameButtons.forEach((button,index) => button.setAttribute('aria-current',String(index===previewFrame)))
    readFrame = previewFrame
  }
}
// Fumaça das chaminés do fundo (coordenadas da imagem assets/cidade.webp, 640x270).
// As baforadas somam densidade num buffer de baixa resolução, que é quantizado em faixas de cor
// com pontilhado (Bayer) nas bordas: vira uma pluma contínua e irregular, em pixel art.
// Sem estado: tudo sai do tempo de jogo, então pausa e reinício funcionam sozinhos.
const chimneys = [
  { x: 212, y: 128, size: .8, life: 6, puffs: 14, seed: 1.3 },
  { x: 224.5, y: 128, size: .8, life: 6.6, puffs: 14, seed: 4.1 },
  { x: 386, y: 83, size: 1.15, life: 7.5, puffs: 18, seed: 2.7 }
]
const smokeWind = 5      // quanto o vento leva a fumaça para a direita ao longo da vida da baforada
const smokeRise = 9      // subida em px por segundo
const smokeCurve = 1.8   // >1: sobe reta perto da chaminé e só depois deita com o vento
const smokeWobble = 7    // balanço lateral das baforadas
const smokeBands = [     // [densidade mínima, cor, opacidade]: da borda para o miolo
  [.3, [78, 62, 112], .5],
  [.72, [134, 112, 162], .6],
  [1.2, [184, 164, 204], .64]
]
const bayer4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5].map(v => (v + .5) / 16)
const smokeCanvas = document.createElement('canvas')
const smokeCtx = smokeCanvas.getContext('2d')
function smokeNoise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}
function smoothNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf)
  const a = smokeNoise(xi,yi), b = smokeNoise(xi+1,yi), c = smokeNoise(xi,yi+1), d = smokeNoise(xi+1,yi+1)
  return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v
}
function drawSmoke(shift) {
  for (const c of chimneys) {
    const reach = c.life * smokeRise * c.size
    const left = Math.floor(c.x - shift - 24*c.size), top = Math.floor(c.y - reach - 22*c.size)
    const w = Math.ceil(c.life * smokeWind * c.size + 50*c.size), h = Math.ceil(reach + 28*c.size)
    if (left > width || left + w < 0) continue
    const density = new Float32Array(w * h)
    for (let k = 0; k < c.puffs; k++) {
      const age = (elapsed + k * c.life / c.puffs + c.seed) % c.life
      const t = age / c.life
      const wobble = Math.sin(age*1.3 + k*2.1 + c.seed) * (1 + t*smokeWobble) + Math.sin(age*.6 + k*3.7) * t*smokeWobble*.6
      const px = c.x - shift + smokeWind*c.life*Math.pow(t, smokeCurve)*c.size + wobble - left
      const py = c.y - 1 - smokeRise*age*c.size - top
      const r = (4 + t*15) * c.size
      const strength = Math.min(1, t/.06) * Math.pow(1-t, .9) * 1.5
      const x0 = Math.max(0, Math.floor(px-r)), x1 = Math.min(w-1, Math.ceil(px+r))
      const y0 = Math.max(0, Math.floor(py-r)), y1 = Math.min(h-1, Math.ceil(py+r))
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d2 = ((x-px)*(x-px) + (y-py)*(y-py)) / (r*r)
        if (d2 < 1) density[y*w+x] += strength * (1-d2) * (1-d2)
      }
    }
    const img = smokeCtx.createImageData(w, h)
    const data = img.data
    const drift = elapsed * smokeRise * c.size * .35
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = density[y*w+x]
      if (v <= .05) continue
      // borda irregular: ruído que sobe junto com a fumaça e rasga mais a pluma quanto mais alto
      const X = x + left + shift, Y = y + top + drift
      const nz = smoothNoise(X/6, Y/6)*.65 + smoothNoise(X/2.7 + 7, Y/2.7)*.35
      const hf = Math.min(1, Math.max(0, (c.y - y - top) / reach))
      v *= (1 - hf*.8 + hf*1.6*nz) * (.55 + .9*nz)
      const dither = bayer4[(y & 3) * 4 + (x & 3)] * .22 - .11
      let band = -1
      for (let i = smokeBands.length - 1; i >= 0; i--) if (v + dither >= smokeBands[i][0]) { band = i; break }
      if (band < 0) continue
      const [, rgb, alpha] = smokeBands[band]
      const o = (y*w+x) * 4
      data[o] = rgb[0]; data[o+1] = rgb[1]; data[o+2] = rgb[2]; data[o+3] = alpha * 255
    }
    if (smokeCanvas.width < w) smokeCanvas.width = w
    if (smokeCanvas.height < h) smokeCanvas.height = h
    smokeCtx.clearRect(0, 0, smokeCanvas.width, smokeCanvas.height)
    smokeCtx.putImageData(img, 0, 0)
    ctx.drawImage(smokeCanvas, 0, 0, w, h, left, top, w, h)
  }
}
function drawPowerUpPickup(powerUp,scroll) {
  const x = Math.round(powerUp.x-scroll)
  if (powerUp.taken || x < -24 || x > width+24) return
  const bob = Math.round(Math.sin(elapsed*4.5 + powerUp.x)*3)
  const y = Math.round(powerUp.y-27+bob)
  const pulse = .55+.45*Math.sin(elapsed*7+powerUp.x)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = .22+.12*pulse
  fill(ctx,'#239eea',x-11,y-11,22,22)
  ctx.restore()
  fill(ctx,'#172a68',x-6,y-8,12,17)
  fill(ctx,'#2290e6',x-5,y-7,10,15)
  fill(ctx,'#3fd0ff',x-3,y-5,6,11)
  fill(ctx,'#e0fcff',x-1,y-3,2,7)
  fill(ctx,'#ffffff',x-4,y,8,2)
  fill(ctx,'#8ff0ff',x-1,y-9,2,2)
  for (let i=0;i<4;i++) {
    const a = elapsed*1.8+i*Math.PI/2
    const sx = x+Math.round(Math.cos(a)*10)
    const sy = y+Math.round(Math.sin(a)*7)
    fill(ctx,i%2 ? '#8ff0ff' : '#ffffff',sx,sy,1+(i%2),1+(i%2))
  }
}
function drawPowerUpEffect(scroll,front=false) {
  ctx.save()
  if (!front) for (const p of players) {
    if (p.powerVisual <= 0) continue
    const age = powerUpDuration-p.powerVisual
    const x = Math.round(p.x-scroll)
    const y = Math.round(p.y)
    const fadeIn = clamp(age/.16,0,1)
    const fadeOut = clamp(p.powerVisual/.58,0,1)
    const aura = fadeIn*fadeOut*(.8+.2*Math.sin(elapsed*13))
    if (aura > .02) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = .12*aura
    fill(ctx,'#2290e6',x-22,y-67,44,65)
    ctx.globalAlpha = .32*aura
    const flare = age < .48 ? 1-age/.48 : 0
    const reach = 13+Math.round(flare*46)
    fill(ctx,'#3fd0ff',x-reach,y-2,reach*2,1)
    fill(ctx,'#8ff0ff',x-Math.round(reach*.72),y-3,Math.round(reach*1.44),1)
    ctx.globalAlpha = .7*aura
    for (let row=0; row<10; row++) {
      const wave = Math.sin(elapsed*18+row*1.7)
      const half = 11+Math.round(wave*2)+(row<4 ? 2 : 0)
      const py = y-6-row*6
      fill(ctx,row%3===0 ? '#8ff0ff' : '#3fd0ff',x-half,py,2,3)
      fill(ctx,row%3===1 ? '#e0fcff' : '#2290e6',x+half-2,py-1,2,4)
    }
    }
  }
  for (let i=0;i<powerUpMotes.length;i++) {
    const mote = powerUpMotes[i]
    if ((i%2===0) !== front) continue
    const k = 1-mote.age/mote.life
    const mx = Math.round(mote.x-scroll), my = Math.round(mote.y)
    ctx.globalAlpha = clamp(k*1.4,0,1)
    const color = i%3===0 ? '#ffffff' : i%3===1 ? '#8ff0ff' : '#3fd0ff'
    if (mote.inward) {
      fill(ctx,color,mx-1,my-1,3,3)
      fill(ctx,'#2290e6',mx-4,my,3,1)
    } else {
      fill(ctx,color,mx,my,2,Math.max(2,Math.round(7*k)))
      if (i%4===0) { fill(ctx,'#e0fcff',mx-2,my+1,6,1); fill(ctx,'#e0fcff',mx,my-1,2,5) }
    }
  }
  ctx.restore()
}
// Cenário da Fase 2 (assets/fase2, em 2x): camadas em parallax que se repetem (com várias folhas, alterna entre elas).
// factor = fração do movimento da câmera; y = deslocamento vertical da camada em unidades do mundo.
const stage2Layers = [
  { sheets: ['sky2'], factor: .12, y: 0 },
  { sheets: ['street2'], factor: 1, y: 0 }   // a rua anda com a pista: o Edu pisa no asfalto dela
]
// Artes na altura da pista (a Carreta Furação), definidas em fase2.js
const stage2Props = stageData.props
function drawStage2Background() {
  for (const { sheets, factor, y } of stage2Layers) {
    const w = sprites[sheets[0]].width/pixelScale, h = sprites[sheets[0]].height/pixelScale
    const offset = Math.round((onTruck ? roadPos + camera : camera)*factor)   // na 2.1 a rua corre sozinha e ainda anda com a câmera
    for (let i = Math.floor(offset/w), x = i*w-offset; x < width; i++, x += w)
      ctx.drawImage(sprites[sheets[i%sheets.length]],x,y,w,h)
  }
  if (onTruck) {   // asfalto alagado durante a chuva (atrás da carreta); sob a carreta a água fica parada
    const truckLeft = Math.round(stage2Props.find(q => q.sheet === 'truck').x - camera)
    gameFx.drawPuddles(ctx, rainAmount, [truckLeft - 10, truckLeft + 672])
  }
  if (onTruck && endSeq) drawPub()
  if (onTruck) {   // daqui em diante tudo balança com a carreta; só o cenário ao fundo fica parado
    ctx.save()
    ctx.translate(0,suspension.offset)
  }
  for (const { sheet, x, y, factor, flip } of stage2Props) {
    const w = sprites[sheet].width/pixelScale, h = sprites[sheet].height/pixelScale
    const left = Math.round(x-camera*factor)
    if (left >= width || left+w <= 0) continue
    if (!flip) ctx.drawImage(sprites[sheet],left,y-h,w,h)
    else {   // carro virado para a esquerda
      ctx.save()
      ctx.translate(left+w,0)
      ctx.scale(-1,1)
      ctx.drawImage(sprites[sheet],0,y-h,w,h)
      ctx.restore()
    }
  }
  if (onTruck) drawTruckWheels()
  if (convoy) drawConvoy()
}
// Fase 2.1: gira o miolo de cada roda sobre a arte da carreta (a arte original fica por baixo, parada)
function drawTruckWheels() {
  const truck = stage2Props.find(p => p.sheet === 'truck')
  const h = sprites.truck.height / pixelScale
  const left = Math.round(truck.x - camera * truck.factor), top = truck.y - h
  drawWheelsAt(left, top, wheelAngle)
  // respingo sobre a água: sai do chão sob o lado de trás de cada roda, mais forte quanto mais chove e mais rápido a carreta anda
  const spots = fase21.wheels.map((wheel) => ({ x: left + (wheel.cx + .5) / pixelScale - 5, y: top + (wheel.cy + .5) / pixelScale + wheel.size / pixelScale / 2 - 1 }))
  gameFx.drawSpray(ctx, rainAmount * Math.min(1, roadSpeed / fase21.speed), spots)
}
function drawWheelsAt(left, top, angle) {
  fase21.wheels.forEach((wheel, i) => {
    const image = sprites['wheel' + (i + 1)]
    const half = wheel.size / pixelScale / 2
    ctx.save()
    ctx.translate(left + (wheel.cx + .5) / pixelScale, top + (wheel.cy + .5) / pixelScale)
    ctx.rotate(angle)
    ctx.drawImage(image, -half, -half, half * 2, half * 2)
    ctx.restore()
  })
}
const playerColors = ['#ffb35a', '#5ac8ff']   // seta sobre a cabeça: laranja = P1, azul = P2
function drawPlayer(p) {
  player = p
  const pose = playerPose()
  const showPlayer = p.fall ? !p.fall.belowMap : p.lives > 0 && (p.inv < .01 || Math.floor(p.inv*14)%2 === 0)
  if (!showPlayer) return
  const px = Math.round(p.x-camera), py = Math.round(p.y)
  ctx.save()
  ctx.translate(px,py)
  ctx.scale(p.face * heroVisualScale,heroVisualScale)
  heroAtlas(ctx,pose.sheet,pose.frame,0,-(pose.lift || 0),1/pixelScale)
  ctx.restore()
  if (players.length > 1 && !p.fall) {   // seta colorida sobre a cabeça: laranja = P1, azul = P2
    const my = py - Math.round((p.crouch > .6 ? 62 : 84) * charScale), color = playerColors[p.idx]
    fill(ctx,'#16091d',px-3,my-1,7,1)
    fill(ctx,color,px-2,my,5,1)
    fill(ctx,color,px-1,my+1,3,1)
    fill(ctx,color,px,my+2,1,1)
  }
}
function renderWorld() {
  const scroll = Math.round(camera)
  if (stage === 2) drawStage2Background()
  else {
    const bgWidth = Math.round(height * sprites.bg.width / sprites.bg.height)
    const scaledWidth = Math.max(640,bgWidth)
    const shift = Math.round(42 + camera/(end+50-width)*(scaledWidth-width-42))
    ctx.drawImage(sprites.bg,-shift,0,scaledWidth,height)
    drawSmoke(shift)
    if (heliBoss) drawFarHeli()
  }
  for (const [x,y,w,invisible] of platforms) if (!invisible) terrain(x,y,w,scroll)
  for (const m of movers) drawMover(m,scroll)
  for (const checkpoint of checkpoints) marker(checkpoint,groundY,scroll,false,respawnX>=checkpoint)
  marker(goal,groundY,scroll,true,finish)
  for (const pickup of pickups) {
    const px = pickup.x-scroll
    if (pickup.taken || px < -20 || px > width+20) continue
    const bob = Math.round(Math.sin(elapsed*4 + pickup.x)*2)
    ctx.drawImage(sprites.medal, Math.round(px-7), pickup.y-19+bob, 13, 19)
  }
  for (const powerUp of powerUps) drawPowerUpPickup(powerUp,scroll)
  drawDroneCrashExplosions('back',scroll)
  drawEnemies(scroll)
  drawDroneCrashExplosions('front',scroll)
  for (const shot of enemyShots) {
    fill(ctx,'#fa5483',shot.x-scroll-4,shot.y-1,9,3)
    fill(ctx,'#ffd5ae',shot.x-scroll-1,shot.y,4,1)
  }
  for (const p of sparks) fill(ctx,'#dcb775',p.x-scroll,p.y,2,2)
  for (const p of shots) {
    fill(ctx,'#f08e3c',p.x-scroll-(p.dx > 0 ? 10 : 0),p.y,11,2)
    fill(ctx,'#ffef9d',p.x-scroll-(p.dx > 0 ? 5 : 0),p.y,6,1)
  }
  for (const impact of impacts) {
    const age = elapsed-impact.at
    if (age >= impactDuration) continue
    const spread = 1 + age*23
    const x = impact.x-scroll
    ctx.save()
    ctx.globalAlpha = 1-age/impactDuration
    fill(ctx,'#fff1ba',x-impact.dx,impact.y,2,2)
    fill(ctx,'#f7a053',x-impact.dx*spread,impact.y-spread,2,1)
    fill(ctx,'#f7a053',x-impact.dx*spread,impact.y+spread,1,1)
    ctx.restore()
  }
  drawPowerUpEffect(scroll,false)
  for (const p of players) drawPlayer(p)
  player = players[0]
  gameFx.draw(ctx,scroll)   // clarão do cano, faíscas e brilho de medalha (pixelfx)
  drawPowerUpEffect(scroll,true)
  if (onTruck) ctx.restore()
}
// Gestos sutis do retrato enquanto o Edu está ileso: [rosto, duração em ms]
const idleGestures = [
  [['blink',110]],
  [['blink',110]],
  [['blink',110]],
  [['blink',100]],
  [['blink',90],['neutral',120],['blink',90]],
  [['blink',90],['neutral',120],['blink',90]],
  [['right',260]],
  [['right',300]]
]
let idleQueue = [['neutral', 1500]]
let idleCurrent = 'neutral'
let idleUntil = 0
function idleFace(now) {
  if (now >= idleUntil) {
    if (!idleQueue.length) {
      const gesture = idleGestures[Math.floor(Math.random()*idleGestures.length)]
      idleQueue = [...gesture, ['neutral', 900 + Math.random()*2200]]
    }
    const [face, duration] = idleQueue.shift()
    idleCurrent = face
    idleUntil = now + duration
  }
  return idleCurrent
}
function renderPlayerHud() {
  players.forEach((p, k) => {
    const slot = hudSlots[k]
    const hurt = p.fall && !p.fall.belowMap
    const face = hurt ? (p.fall.age < .16 ? 'shout' : 'pain') : idleFace(performance.now())
    if (face !== slot.face) {
      slot.root.dataset.face = face
      slot.face = face
    }
    if (p.lives !== slot.lives) {
      slot.livesEl.setAttribute('aria-label', p.lives + (p.lives === 1 ? ' vida' : ' vidas'))
      slot.medals.forEach((medal, n) => medal.toggleAttribute('data-spent', n >= p.lives))
      slot.lives = p.lives
    }
  })
  if (score === hudScore) return
  const digits = String(score).padStart(5,'0')
  scoreDisplay.width = digits.length*6+1
  scoreDisplay.setAttribute('aria-label','Pontuação: ' + digits)
  for (const [i,digit] of [...digits].entries()) {
    scoreDigits[digit].forEach((row,y) => {
      for (let x = 0; x < 5; x++) {
        if (!(row & (16 >> x))) continue
        fill(scoreCtx,scoreColors[y],i*6+x+1,y+1,1,1)
      }
    })
  }
  hudScore = score
}
function tick(now) {
  if (disposed) return
  const dt = last ? Math.min((now-last)/1000,.033) : 0
  last = now
  if (mode === 'play') update(dt)
  else updatePaused(dt)
  render()
  renderPlayerHud()
  updateMenuCursor()
  requestAnimationFrame(tick)
}
Promise.all([
  ...Object.entries(sequences).map(([name, { file }]) => loadImage(name,'assets/' + file)),
  loadImage('crouch','assets/edu-v2/agachamento.png'),
  ...(operadorCfg ? Object.entries(operadorFiles).map(([name, file]) => loadImage('op_' + name, 'assets/operador/' + file + '?v=11')) : []),
  ...(stage === 2 ? [
    // faixas sem emenda montadas por tools/montar_fase2.py
    loadImage('sky2','assets/fase2/ceu-predios-continuo.webp'),
    loadImage('street2','assets/fase2/rua-t9-continua.webp'),
    loadImage('truck','assets/fase2/carreta-furacao.webp'),
    ...fase2.carSheets.map(([sheet, file]) => loadImage(sheet,'assets/fase2/carros/' + file)),
    ...(onTruck ? [loadImage('pub','assets/fase2/vikings-pub.webp')] : []),
    ...(onTruck ? [loadImage('fofaoRun','assets/fofao/corrida.png'), loadImage('fofaoAttack','assets/fofao/ataque.png'), loadImage('fofaoAttack2','assets/fofao/ataque2.png'),
      loadImage('fofaoFall','assets/fofao/queda.png'),
      loadImage('chapolimRun','assets/chapolim/corrida.png'), loadImage('chapolimAttack','assets/chapolim/ataque.png'), loadImage('chapolimFall','assets/chapolim/queda.png'), loadImage('chapolimJump','assets/chapolim/salto.png')] : []),
    ...fase21.wheels.map((wheel, i) => loadImage('wheel' + (i + 1),'assets/fase2/rodas/' + wheel.file))
  ] : [loadImage('bg','assets/cidade.webp'),
    loadImage('heliBody','assets/boss-heli/corpo.png?v=7'), loadImage('heliWreck','assets/boss-heli/destruido.png?v=2'),
    ...[1,2,3,4,5].flatMap(n => [loadImage('heliRotor' + n,'assets/boss-heli/rotor' + n + '.png?v=3'), loadImage('heliTail' + n,'assets/boss-heli/cauda' + n + '.png?v=4')])]),
  loadImage('patrol','assets/patrulheiro-ex-movimento-v2.png'),
  loadImage('patrolFall','assets/patrulheiro-ex-queda.png'),
  loadImage('elite','assets/soldado-elite-movimento.png'),
  loadImage('eliteFall','assets/soldado-elite-queda.png'),
  loadImage('drone','assets/drone-padrao.png'),
  loadImage('heavyDrone','assets/drone-elite.png'),
  loadImage('droneDeath','assets/drone-padrao-destruicao.png'),
  loadImage('eliteDroneDeath','assets/drone-elite-destruicao.png'),
  loadImage('boss','assets/o-cobrador.png'),
  loadImage('medal','assets/medalha-bulletz.png'),
  // arte das telas e dos botões: <img> do index.html, imagens do style.css, contornos do seletor e retratos do HUD do Operador
  trackLoad(waitImages(document)),
  ...cssImageUrls().map(preloadUrl),
  ...['iniciar', 'continuar', 'reiniciar', 'botao-continuar', 'botao-sair'].map((n) => preloadUrl('assets/botoes/' + n + '-contorno.png?v=3')),
  ...[...new Set(Object.values(portraitSources))].map((n) => preloadUrl('assets/selecionar/' + n + '.png?v=2')),
  trackLoad(document.fonts ? document.fonts.ready : Promise.resolve())
]).then(() => {
  updateMovers()
  let autostart = null
  try { autostart = sessionStorage.getItem('bulletz.autostart'); sessionStorage.removeItem('bulletz.autostart') } catch {}
  let skipSelect = false
  try { skipSelect = sessionStorage.getItem('bulletz.skipSelect') === '1'; sessionStorage.removeItem('bulletz.skipSelect') } catch {}
  const testShortcut = ['fase', 'boss', 'fim'].some((k) => new URLSearchParams(location.search).has(k))
  if (autostart || skipSelect || testShortcut) { selectDone = true; playersDone = true }
  let afterPlayers = false
  try { afterPlayers = sessionStorage.getItem('bulletz.afterPlayers') === '1'; sessionStorage.removeItem('bulletz.afterPlayers') } catch {}
  setMode('title')
  if (afterPlayers) { playersDone = true; selectReturn = 'play'; openSelect() }
  document.documentElement.classList.remove('booting', 'screen-loading')   // tudo carregado: some o CARREGANDO   // o número de jogadores mudou (recarregou): segue direto para a escolha de personagem   // numa troca de fase o menu da instância anterior pode ter ficado aberto
  if (!autostart && !onTruck && stage === 1) { try { sessionStorage.removeItem('bulletz.continues') } catch {} }   // partida nova: 3 continues
  if (autostart) {
    startGame()
    // a tela preta segura um instante (para as imagens e o primeiro quadro estarem prontos) e então some devagar
    const root = document.documentElement
    const wait = Math.max(0, 600 - (performance.now() - bootAt))
    setTimeout(() => {
      root.classList.replace('stage-loading', 'stage-reveal')
      setTimeout(() => root.classList.remove('stage-reveal'), 900)
    }, wait)
    if (autostart === 'fs') {
      const back = () => { enterFullscreen(); window.removeEventListener('pointerdown', back, true); window.removeEventListener('keydown', back, true) }
      window.addEventListener('pointerdown', back, true)
      window.addEventListener('keydown', back, true)
    }
  }
  // Teste de boss (?boss): o Edu começa na arena do chefe e a vida dele já está no fim
  if (new URLSearchParams(location.search).has('boss') && devTools && !onTruck) startBossTest()
  // Abra com ?debug para testar: bulletz.warp(x) teleporta o Edu, bulletz.god = true ignora dano
  if (new URLSearchParams(location.search).has('debug')) {
    const debugParams = new URLSearchParams(location.search)
    window.bulletz = {
      get player() { return players[0] }, players, enemies, boss, movers, pickups, powerUps, droneExplosions, platforms, waveState, suspension,
      get finish() { return finish },
      get endSeq() { return endSeq },
      get outSeq() { return outSeq },
      get convoy() { return convoy },
      get farHeli() { return farHeli },
      get heliWaveCount() { return heliWaves.length },
      shots,
      endStage() { finish = true; outSeq = { t: 0, banner: false, wiped: false } },
      startEnding() { finish = true; startEnding() },
      get camera() { return camera },
      get lives() { return players[0].lives }, set lives(v) { for (const p of players) p.lives = v },
      get weather() { return weather }, set weather(v) { weather = v },
      get rain() { return rainAmount },
      get fx() { return gameFx }, get roadSpeed() { return roadSpeed }, get camera2() { return camera },
      get storm() { return storm }, get waveIndex() { return waveState.index },
      setWave(i) { waveState.index = i; rainAmount = rainByWave[Math.min(i, rainByWave.length - 1)]; weather = weatherByWave[Math.min(i, weatherByWave.length - 1)] },
      get god() { return players[0].inv > 1e5 }, set god(v) { for (const p of players) p.inv = v ? 1e9 : 0 },
      set rearTimer(v) { rearTimer = v },
      warp(x) { respawnX = x; reset(false); respawnX = Math.max(...[70, ...checkpoints].filter(c => c <= x)) }
    }
    const debugWarp = Number(debugParams.get('warp'))
    if (Number.isFinite(debugWarp) && debugWarp > 0) window.bulletz.warp(debugWarp)
    if (debugParams.has('testCrash')) {
      const testDrone = enemies.find((enemy) => enemy.kind === 'drone')
      if (testDrone) {
        testDrone.x = player.x+55
        testDrone.y = 150
        testDrone.hp = 0
        testDrone.deathAge = 0
        testDrone.crashAt = null
        testDrone.crashExplosion = false
        testDrone.grounded = false
        testDrone.vy = 15
      }
    }
  }
  renderPlayerHud()
  requestAnimationFrame(tick)
}).catch((error) => {
  console.error('Falha ao carregar a arte:', error)
  if (loaderEl) { loaderEl.classList.add('failed'); loaderEl.querySelector('.loader-text').textContent = 'FALHA AO CARREGAR · RECARREGUE A PÁGINA' }
  announce('Falha ao carregar a arte. Recarregue a página.',Infinity)
})
