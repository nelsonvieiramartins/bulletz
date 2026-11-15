import createSpriteFusionExplosion from './effects/spritefusion-explosion.js'
import { sfx } from './sfx.js'
import { createGameFx } from './gamefx.js'
import { applySpriteConfig } from './spriteconfig.js'

const select = (selector) => document.querySelector(selector)
const game = select('#game')
const preview = select('#sprite')
const ctx = game.getContext('2d')
const sample = preview.getContext('2d')
// O mundo continua em 480x270; o canvas tem o dobro de pixels para o Edu (sprites de ~133px)
// aparecer 1:1 em alta definição, enquanto cenário e inimigos são ampliados 2x.
const width = 480
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
let shotTick = 0
// Folhas do Edu (assets/edu-v2): células de 192x160, eixo do corpo em x=80 e pés em y=152,
// desenhadas na metade do tamanho em unidades do mundo (1:1 nos pixels do canvas).
const heroCell = { w: 192, h: 160, anchorX: 80, feetY: 152 }
// Aumenta o Edu em 5 unidades visuais, mantendo os pés presos ao chão e a hitbox original.
const heroVisualScale = (heroCell.h / pixelScale + 5) / (heroCell.h / pixelScale)
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
const fallFrameDuration = .11
const fallDuration = .68
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
  [6080,224,850]
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
const enemyTypes = {
  patrol: { hp: 3, points: 150, interval: 2.25, speed: 86, reach: 225, shotSpeed: 125 },
  elite: { hp: 5, points: 300, interval: 1.45, speed: 102, reach: 250, shotSpeed: 150 },
  drone: { hp: 5, points: 250, interval: 2.1, speed: 32, reach: 280 },
  heavyDrone: { hp: 8, points: 350, interval: 1.35, speed: 48, reach: 330, shotSpeed: 178, burstShots: 8, burstRate: .095 }
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
  boss: [112,64,60,63]
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
let lives = maxLives
let score = 0
let invulnerability = 0
const bossHp = 24
const boss = { x: 6680, y: 224, hp: bossHp, delay: .75, volley: 0 }

function populateEnemies(at) {
  enemies.length = 0
  for (const { x, type, min, max, y } of enemySpawns) {
    if (x <= at) continue
    const drone = type === 'drone' || type === 'heavyDrone'
    enemies.push({ x, origin: x, kind: drone ? 'drone' : 'patrol', type, elite: type === 'elite' || type === 'heavyDrone',
      y, spawnY: y, min, max,
      hp: enemyTypes[type].hp, delay: drone ? 1.25 : 1.1+(x%7)*.14, face: -1, moving: false,
      route: x % 3 === 0 ? 1 : -1, vx: 0, vy: 0, stride: 0, grounded: true, airTime: 0, landing: 0 })
  }
  pickups.length = 0
  for (const [x,y] of pickupSpots) if (x > at) pickups.push({ x, y, taken: false })
  powerUps.length = 0
  for (const [x,y] of powerUpSpots) if (x > at) powerUps.push({ x, y, taken: false })
  boss.hp = bossHp
  boss.delay = .75
  boss.volley = 0
}
populateEnemies(70)
const keys = new Set()
const keyboard = new Set(['ArrowLeft','ArrowRight','ArrowDown','KeyA','KeyD','KeyS','Space','ArrowUp','KeyW','KeyG'])
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
let powerUpVisual = 0
const droneExplosions = []
const gameFx = createGameFx(width, height)   // pixelfx: cano, faísca de acerto, medalha
const explosionColorCanvas = document.createElement('canvas')
const explosionLightCanvas = document.createElement('canvas')
explosionColorCanvas.width = explosionLightCanvas.width = width
explosionColorCanvas.height = explosionLightCanvas.height = height
const explosionColorCtx = explosionColorCanvas.getContext('2d')
const explosionLightCtx = explosionLightCanvas.getContext('2d')
const explosionColorImage = explosionColorCtx.createImageData(width,height)
const explosionLightImage = explosionLightCtx.createImageData(width,height)
const explosionFrame = {
  w: width, h: height, ox: 0, oy: 0,
  color: new Uint32Array(explosionColorImage.data.buffer),
  light: new Uint32Array(explosionLightImage.data.buffer)
}
const impactDuration = .12
const flashDuration = .075
const flashSprite = document.createElement('canvas')
flashSprite.width = 88
flashSprite.height = 72
const flashCtx = flashSprite.getContext('2d')
let camera = 0
let elapsed = 0
let idleTime = 0
let playerFall = null
let last = 0
let jumpPressed = false
let respawnX = 70
let zoneIndex = 0
let finish = false
let previewPlaying = true
let previewSequence = 'run'
let previewFrame = 0
let previewTime = 0
let fps = 12
let readFrame = -1
let progress = -1
let noticeUntil = 0
const player = {x:70,y:224,vx:0,vy:0,face:1,grounded:true,coyote:0.09,buffer:0,phase:0,cooldown:0,crouch:0,trigger:false}
const notice = select('#notice')
const progressText = select('#progress')
const livesText = select('#lives')
const lifeMedals = [...livesText.querySelectorAll('img')]
const playerHud = select('#player-hud')
const bossMeter = select('#boss-health')
const bossHud = select('#boss-hud')
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
let hudLives = -1
let hudFace = ''
const padStatus = select('#pad-status')
const padSetup = select('#pad-setup')
const padPrompt = select('#pad-prompt')
const padSteps = ['Mova o direcional para a esquerda.', 'Mova o direcional para a direita.', 'Pressione o botão de salto.', 'Pressione o botão de disparo.']
const frameText = select('#frame')
const play = select('#play')
const sprites = {}
const music = select('#music')
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

window.addEventListener('keydown', enableSound)
window.addEventListener('pointerdown', enableSound)
window.addEventListener('pointerup', enableSound)

function loadImage(key, url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => { sprites[key] = image; resolve() }
    image.onerror = () => reject(new Error(url))
    image.src = url
  })
}

function announce(message, duration) {
  notice.textContent = message
  notice.hidden = false
  noticeUntil = elapsed + duration
}

function reset(all = true) {
  idleTime = 0
  playerFall = null
  pendingShotAt = -Infinity
  if (all) {
    respawnX = 70
    zoneIndex = 0
    lives = maxLives
    score = 0
    bossHud.hidden = true
    finish = false
    notice.hidden = true
    keys.clear()
    populateEnemies(respawnX)
  }
  invulnerability = .9
  enemyShots.length = 0
  Object.assign(player,{x:respawnX,y:224,vx:0,vy:0,face:1,grounded:true,coyote:0.09,buffer:0,phase:0,cooldown:0,crouch:0,trigger:false,mover:null})
  camera = Math.max(0, player.x - 145)
  shots.length = 0
  impacts.length = 0
  sparks.length = 0
  powerUpMotes.length = 0
  powerUpVisual = 0
  droneExplosions.length = 0
  gameFx.clear()
  jumpPressed = false
}

function setKey(key, active) {
  if (active && !keys.has(key) && ['Space','ArrowUp','KeyW'].includes(key)) jumpPressed = true
  if (active) keys.add(key)
  else keys.delete(key)
}

// Telas: 'title' (logo + INICIAR JOGO), 'play' (jogando) e 'menu' (pausa com as informações, no ESC)
const titleScreen = select('#title-screen')
const menuScreen = select('#menu')
const fullscreenToggle = select('#fullscreen-toggle')
let mode = 'title'
let wantFullscreen = false
let fullscreenExitAt = -Infinity
let fullscreenRequestAt = -Infinity

function setMode(next) {
  mode = next
  document.body.dataset.mode = next
  titleScreen.hidden = next !== 'title'
  menuScreen.hidden = next !== 'menu'
  keys.clear()
  jumpPressed = false
}
function enterFullscreen() {
  const root = document.documentElement
  if (document.fullscreenElement || !root.requestFullscreen) return
  fullscreenRequestAt = performance.now()
  root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
}
function startGame() {
  if (mode !== 'title') return
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
window.addEventListener('blur', () => { keys.clear(); jumpPressed = false })
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

function updateMovers() {
  for (const m of movers) {
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
  if (!pad.restart) return
  if (mode === 'title') startGame()
  else resumeGame()
}

function update(dt) {
  elapsed += dt
  updateMovers()
  if (elapsed > noticeUntil) notice.hidden = true
  if (previewPlaying) {
    previewTime = (previewTime + dt * fps) % sequences[previewSequence].count
    previewFrame = Math.floor(previewTime)
  }
  const pad = readPad(dt)
  if (pad.restart) {
    openMenu()
    return
  }
  if (playerFall) {
    if (playerFall.age < fallDuration) updatePlayerFall(dt)
    return
  }
  if (lives === 0 || finish) return
  const right = active('ArrowRight','KeyD')
  const left = active('ArrowLeft','KeyA')
  const direction = right || left ? Number(right) - Number(left) : pad.direction
  const wantsCrouch = active('ArrowDown','KeyS') || pad.crouch
  if (jumpPressed || pad.jump) player.buffer = 0.13
  jumpPressed = false
  player.buffer -= dt
  player.coyote = player.grounded ? 0.09 : player.coyote - dt
  if (player.buffer > 0 && player.coyote > 0) {
    player.vy = -315
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
  player.x = clamp(player.x + player.vx * dt,14,end)
  player.vy += 790 * dt
  player.y += player.vy * dt
  player.grounded = false
  landOnPlatform(player, oldY, 7, true)
  if (player.y > 295) {
    loseLife()
    return
  }
  player.crouch = player.grounded ? clamp(player.crouch + dt * (wantsCrouch ? 10 : -12),0,1) : 0
  for (const checkpoint of checkpoints) {
    if (player.x >= checkpoint && respawnX < checkpoint && player.grounded && !player.mover) {
      respawnX = checkpoint
      announce('PONTO DE CONTROLE',1.6)
      sfx.play('checkpoint')
    }
  }
  if (zoneIndex < zones.length && player.x >= zones[zoneIndex][0]) {
    announce(zones[zoneIndex][1],2.2)
    sfx.play('zone')
    zoneIndex++
  }
  for (const pickup of pickups) {
    if (pickup.taken || Math.abs(player.x-pickup.x) > 14 || pickup.y < player.y-62 || pickup.y > player.y+4) continue
    pickup.taken = true
    gameFx.collect({ x: pickup.x, y: pickup.y - 10 })
    if (lives < maxLives) {
      lives++
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
    powerUpVisual = powerUpDuration
    powerUpMotes.length = 0
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
  if (player.x >= goal && boss.hp === 0 && !finish && player.grounded) {
    finish = true
    announce('CIDADE LIBERTADA',6)
    sfx.play('victory')
  }
  if (player.grounded && Math.abs(player.vx) > 8) {
    player.phase = (player.phase + Math.abs(player.vx) * dt / 12) % 8
    if (Math.random() < dt * 15) sparks.push({x:player.x-player.face*7,y:player.y-2,t:.19})
  } else if (player.grounded) player.phase = 0
  player.cooldown -= dt
  player.trigger = active('KeyG') || pad.fire
  if (!player.trigger) shotTick = 0
  if (player.trigger && player.cooldown <= 0) {
    player.cooldown = fireInterval
    if (shotTick++ % bulletEvery === 0) {
      const [muzzleX,muzzleY] = playerPose().muzzle
      // a bala nasce na ponta que se vê da arma (o Edu é desenhado heroVisualScale vezes maior que as coordenadas do cano)
      shots.push({x:player.x + player.face * muzzleX * heroVisualScale,y:player.y + muzzleY * heroVisualScale + (Math.random()*2-1)*fireSpread,dx:player.face,t:.75})
    }
    playShotSound()
  }
  const idle = player.grounded && player.vx === 0 && direction === 0 &&
    player.crouch === 0 && !player.trigger && player.cooldown <= 0
  idleTime = idle ? idleTime + dt : 0
  if (!finish) updateCombat(dt)
  const firing = player.trigger && lives > 0 && !finish && !playerFall ? playerPose().muzzle : null
  // o Edu é desenhado heroVisualScale vezes maior que as coordenadas do cano: o clarão acompanha a ponta que se vê
  gameFx.muzzle(firing ? { x: player.x + player.face*firing[0]*heroVisualScale, floor: player.y, height: -firing[1]*heroVisualScale, flip: player.face < 0 } : null)
  gameFx.update(dt)
  for (let i=droneExplosions.length-1; i>=0; i--) {
    const explosion = droneExplosions[i]
    explosion.fx.update(dt)
    if (explosion.fx.done()) droneExplosions.splice(i,1)
  }
  if (powerUpVisual > 0) {
    const age = powerUpDuration-powerUpVisual
    powerUpVisual = Math.max(0,powerUpVisual-dt)
    const intensity = Math.min(1,age/.16) * Math.min(1,powerUpVisual/.58)
    if (age > .24 && Math.random() < dt*(20+18*intensity)) {
      const side = Math.random() < .5 ? -1 : 1
      powerUpMotes.push({
        x: player.x + side*(8+Math.random()*12),
        y: player.y-4-Math.random()*48,
        vx: -player.vx*.12 + (Math.random()-.5)*12,
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
  camera += (clamp(player.x - 154,0,end+50-width) - camera) * Math.min(1,dt * 6)
  const nextProgress = finish ? 100 : Math.floor(clamp((player.x-70)/(goal-70),0,.99)*100)
  if (nextProgress !== progress) {
    progress = nextProgress
    progressText.textContent = progress + '% DA FASE'
  }
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
  gain.gain.value = deathSoundVolume
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
  gain.gain.value = deathSoundVolume * .8 * near
  source.connect(gain).connect(soundContext.destination)
  source.start()
}

function hitPlayer() {
  if (invulnerability > 0) return false
  loseLife()
  return true
}

function loseLife() {
  lives--
  shots.length = 0
  enemyShots.length = 0
  pendingShotAt = -Infinity
  jumpPressed = false
  const belowMap = player.y > 295
  playerFall = { age: 0, belowMap }
  playDeathSound(lives === 0)
  if (belowMap) completePlayerFall()
}

function updatePlayerFall(dt) {
  playerFall.age += dt
  if (!player.grounded) {
    const previousY = player.y
    player.vy += 790 * dt
    player.y += player.vy * dt
    landOnPlatform(player, previousY, 7, true)
  }
  if (playerFall.age >= fallDuration) completePlayerFall()
}

function completePlayerFall() {
  if (lives === 0) {
    playerFall.age = fallDuration
    announce('FIM DE JOGO · REINICIAR PARA TENTAR DE NOVO', Infinity)
    return
  }
  reset(false)
  bossHud.hidden = true
  announce(lives === 1 ? 'ÚLTIMA VIDA' : 'VIDAS RESTANTES ×' + lives, 1.35)
}

function landOnPlatform(actor, previousY, radius, withMovers = false) {
  if (withMovers) actor.mover = null
  if (actor.vy < 0) return
  for (const [x,y,w] of platforms) {
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
      const gapAhead = !platforms.some(([x,y,w]) => y === 224 && ahead >= x && ahead < x+w)
      const ledgeAhead = platforms.some(([x,y,w]) => {
        if (y >= enemy.y || enemy.y-y > 54) return false
        const edge = enemy.route > 0 ? x : x+w
        const approach = (edge-enemy.x)*enemy.route
        return approach >= 12 && approach <= 20
      })
      if (enemy.vx*enemy.route > 65 && ((enemy.y === 224 && gapAhead) || ledgeAhead)) {
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
    const [x,y] = enemyMuzzles.patrol
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

function firstShotHit(shot, travel, bossActive) {
  let hit
  let nearest = travel
  function check(target, halfWidth, top, bottom) {
    if (target.hp <= 0 || shot.y < top || shot.y > bottom) return
    const ahead = (target.x-shot.x)*shot.dx
    if (ahead + halfWidth < 0) return
    const distance = Math.max(0,ahead-halfWidth)
    if (distance > nearest || (hit && distance === nearest)) return
    nearest = distance
    hit = { target, x: shot.x + distance*shot.dx }
  }
  for (const enemy of enemies) {
    if (enemy.kind === 'drone') check(enemy,18,enemy.y-14,enemy.y+14)
    else check(enemy,12,enemy.y-66,enemy.y)
  }
  if (bossActive) check(boss,36,boss.y-58,boss.y)
  return hit
}

function updateCombat(dt) {
  invulnerability -= dt
  while (impacts.length && elapsed-impacts[0].at >= impactDuration) impacts.shift()
  const bossActive = player.x > bossArena && boss.hp > 0 && !finish
  if (bossActive && (boss.delay -= dt) <= 0) {
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
  if (boss.hp > 0 && player.x > boss.x-40) player.x = boss.x-40
  const playerTop = player.y - (player.crouch > .6 ? 40 : 58)
  for (const enemy of enemies) {
    enemy.hitKick = (enemy.hitKick || 0) * Math.max(0,1-dt*15)
    enemy.hitKickY = (enemy.hitKickY || 0) * Math.max(0,1-dt*18)
    if (enemy.hp <= 0) {
      if (enemy.kind === 'patrol' && enemy.fallAge < 1.2) updatePatrolFall(enemy, dt)
      else if (enemy.kind === 'drone') updateDroneFall(enemy,dt)
      continue
    }
    const distance = player.x - enemy.x
    const config = enemyTypes[enemy.type]
    if (enemy.kind === 'patrol') {
      updatePatrol(enemy,distance,config,dt)
      if (Math.abs(player.x-enemy.x) < 15 && player.y > enemy.y-56 && playerTop < enemy.y && hitPlayer()) return
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
    if (Math.abs(distance) > config.reach) {
      if (eliteDrone) enemy.burst = 0
      continue
    }
    enemy.face = Math.sign(distance) || enemy.face
    if (eliteDrone && enemy.burst > 0) {
      enemy.burstDelay -= dt
      while (enemy.burst > 0 && enemy.burstDelay <= 0) {
        const [x,y] = enemyMuzzles[enemy.type] || enemyMuzzles.drone
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
        const [x,y] = enemyMuzzles.drone
        enemyShots.push({x:enemy.x + enemy.face*x,y:enemy.y+y,vx:enemy.face*155,vy:36})
      }
    }
  }

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
      if (target !== boss) {
        target.hitKick = shot.dx*6
        target.hitKickY = -2.5
      }
      if (--target.hp === 0) {
        if (target === boss) {
          score += 1500
          enemyShots.length = 0
          announce('O COBRADOR CAIU · AVANCE',2.5)
          sfx.play('bossDown')
        } else {
          score += enemyTypes[target.type].points
          if (target.kind === 'patrol') {
            target.fallAge = 0
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
    const contact = Math.abs(shot.x-player.x) < 9 && shot.y >= playerTop && shot.y <= player.y
    if (contact || shot.y > height || shot.x < player.x-520 || shot.x > player.x+520) enemyShots.splice(i,1)
    if (contact && hitPlayer()) return
  }
  bossMeter.value = boss.hp
  bossHud.hidden = !bossActive || boss.hp === 0
}

function playerPose() {
  if (playerFall) {
    const frame = Math.min(sequences.playerFall.count - 1, Math.floor(playerFall.age / fallFrameDuration))
    return { sheet: 'playerFall', frame }
  }
  const holdingAim = player.trigger || player.cooldown > 0
  if (player.crouch > 0) {
    if (holdingAim) return { sheet: 'crouch', frame: 2, muzzle: crouchFireMuzzle }
    return { sheet: 'crouch', frame: player.crouch < .6 ? 0 : 1 }
  }
  if (!player.grounded) {
    // pulo: 0 subindo, 1 caindo, 2 e 3 os mesmos mirando; subindo, as pernas encolhem e o corpo sobe
    const rising = player.vy < 0
    const lift = rising ? jumpTuckLift : 0
    if (player.trigger || player.cooldown > .04) return { sheet: 'jump', frame: rising ? 2 : 3, lift, muzzle: jumpFireMuzzles[rising ? 0 : 1] }
    return { sheet: 'jump', frame: rising ? 0 : 1, lift }
  }
  if (Math.abs(player.vx) > 8) {
    const frame = Math.floor(player.phase)
    if (player.trigger || player.cooldown > .04) return { sheet: 'runFire', frame, muzzle: runFireMuzzles[frame] }
    return { sheet: 'run', frame }
  }
  if (holdingAim) return { sheet: 'idleFire', frame: 0, muzzle: idleFireMuzzle }
  return { sheet: 'idle', frame: Math.floor(idleTime * breathingFps) % sequences.idle.count }
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
  const depth = y > 188 ? height - y + 4 : 16
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
  ctx.scale((droneFacing ? face : -face) * widthScale * spriteScale,spriteScale)
  const columns = sheet === 'droneDeath' || sheet === 'eliteDroneDeath' ? 6 : sheet === 'patrol' || sheet === 'patrolFall' || sheet === 'elite' || sheet === 'eliteFall' ? 4 : 3
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
  for (const enemy of enemies) {
    const x = enemy.x-scroll+(enemy.hitKick || 0)
    const y = enemy.y+(enemy.hitKickY || 0)
    if (x < -90 || x > width+90) continue
    if (enemy.hp <= 0) {
      if (enemy.kind === 'patrol' && enemy.fallAge < 1.2) {
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
  const x = boss.x-scroll
  if (boss.hp <= 0 || x < -90 || x > width+90) return
  const warning = player.x > bossArena && boss.delay <= .36
  const firing = boss.volley > 0 && boss.delay > (boss.hp <= bossHp/2 ? .68 : 1.11)
  const low = (boss.volley - Number(firing)) % 2 === 1
  const frame = warning || firing ? (low ? 2 : 1) : 0
  enemyFrame('boss',frame,x,boss.y,-1)
  if (warning) {
    const [mx,my] = bossMuzzles[frame]
    fill(ctx,'#ffd882',x+mx,boss.y+my-2,3,4)
  }
}
function drawMover(m,scroll) {
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
function render() {
  ctx.save()
  ctx.scale(pixelScale,pixelScale)
  renderWorld()
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
  if (powerUpVisual <= 0 && powerUpMotes.length === 0) return
  const age = powerUpDuration-powerUpVisual
  const x = Math.round(player.x-scroll)
  const y = Math.round(player.y)
  const fadeIn = clamp(age/.16,0,1)
  const fadeOut = clamp(powerUpVisual/.58,0,1)
  const aura = fadeIn*fadeOut*(.8+.2*Math.sin(elapsed*13))
  ctx.save()
  if (!front && aura > .02) {
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
function renderWorld() {
  const scroll = Math.round(camera)
  const bgWidth = Math.round(height * sprites.bg.width / sprites.bg.height)
  const scaledWidth = Math.max(640,bgWidth)
  const shift = Math.round(42 + camera/(end+50-width)*(scaledWidth-width-42))
  ctx.drawImage(sprites.bg,-shift,0,scaledWidth,height)
  drawSmoke(shift)
  for (const [x,y,w] of platforms) terrain(x,y,w,scroll)
  for (const m of movers) drawMover(m,scroll)
  for (const checkpoint of checkpoints) marker(checkpoint,224,scroll,false,respawnX>=checkpoint)
  marker(goal,224,scroll,true,finish)
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
  const pose = playerPose()
  ctx.save()
  ctx.translate(Math.round(player.x-camera),Math.round(player.y))
  ctx.scale(player.face * heroVisualScale,heroVisualScale)
  const showPlayer = playerFall ? !playerFall.belowMap : lives > 0 && (invulnerability < .01 || Math.floor(invulnerability*14)%2 === 0)
  if (showPlayer) heroAtlas(ctx,pose.sheet,pose.frame,0,-(pose.lift || 0),1/pixelScale)
  ctx.restore()
  gameFx.draw(ctx,scroll)   // clarão do cano, faíscas e brilho de medalha (pixelfx)
  drawPowerUpEffect(scroll,true)
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
  const hurt = playerFall && !playerFall.belowMap
  const face = hurt ? (playerFall.age < .16 ? 'shout' : 'pain') : idleFace(performance.now())
  if (face !== hudFace) {
    playerHud.dataset.face = face
    hudFace = face
  }
  if (lives !== hudLives) {
    livesText.setAttribute('aria-label', lives + (lives === 1 ? ' vida' : ' vidas'))
    lifeMedals.forEach((medal, i) => medal.toggleAttribute('data-spent', i >= lives))
    hudLives = lives
  }
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
  const dt = last ? Math.min((now-last)/1000,.033) : 0
  last = now
  if (mode === 'play') update(dt)
  else updatePaused(dt)
  render()
  renderPlayerHud()
  requestAnimationFrame(tick)
}
Promise.all([
  ...Object.entries(sequences).map(([name, { file }]) => loadImage(name,'assets/' + file)),
  loadImage('crouch','assets/edu-v2/agachamento.png'),
  loadImage('bg','assets/cidade.webp'),
  loadImage('patrol','assets/patrulheiro-ex-movimento-v2.png'),
  loadImage('patrolFall','assets/patrulheiro-ex-queda.png'),
  loadImage('elite','assets/soldado-elite-movimento.png'),
  loadImage('eliteFall','assets/soldado-elite-queda.png'),
  loadImage('drone','assets/drone-padrao.png'),
  loadImage('heavyDrone','assets/drone-elite.png'),
  loadImage('droneDeath','assets/drone-padrao-destruicao.png'),
  loadImage('eliteDroneDeath','assets/drone-elite-destruicao.png'),
  loadImage('boss','assets/o-cobrador.png'),
  loadImage('medal','assets/medalha-bulletz.png')
]).then(() => {
  updateMovers()
  // Abra com ?debug para testar: bulletz.warp(x) teleporta o Edu, bulletz.god = true ignora dano
  if (new URLSearchParams(location.search).has('debug')) {
    const debugParams = new URLSearchParams(location.search)
    window.bulletz = {
      player, enemies, boss, movers, pickups, powerUps, droneExplosions, platforms,
      get lives() { return lives }, set lives(v) { lives = v },
      get god() { return invulnerability > 1e5 }, set god(v) { invulnerability = v ? 1e9 : 0 },
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
}).catch(() => {
  announce('Falha ao carregar a arte. Recarregue a página.',Infinity)
})
