// Efeitos sonoros do jogo: Bitcade Free SFX Pack Vol. 1 (CC0), em assets/sfx/.
// Uso: sfx.init(audioContext) uma vez; depois sfx.play('jump') ou sfx.play('laser', { dx }) para
// sons de inimigos, onde dx = distância horizontal até o Edu (som mais baixo quanto mais longe).

const sfxVolume = .7          // volume geral dos efeitos
const hearingRange = 300      // distância (px do jogo) em que um som de inimigo some

// nome do evento -> arquivo, volume, variação aleatória de tom (±) e intervalo mínimo entre repetições
const sounds = {
  hitEnemy:     { file: 'hit_punch',           volume: .32, pitch: .12, gap: .045 },
  droneBlast:   { file: 'explosion_small',     volume: .6,  pitch: .06 },
  heavyBlast:   { file: 'explosion_crunch',    volume: .7,  pitch: .04 },
  bossDown:     { file: 'explosion_big',       volume: .85 },
  patrolShot:   { file: 'laser_pew',           volume: .3,  pitch: .06, gap: .08 },
  droneShot:    { file: 'laser_blaster',       volume: .3,  pitch: .06, gap: .08 },
  bossShot:     { file: 'laser_charged',       volume: .42, pitch: .03, gap: .12 },
  medal:        { file: 'coin_classic',        volume: .55 },
  extraLife:    { file: 'powerup_extra_life',  volume: .65 },
  powerUp:      { file: 'powerup_charge',      volume: .6 },
  checkpoint:   { file: 'magic_sparkle',       volume: .5 },
  zone:         { file: 'jingle_level_up',     volume: .55 },
  victory:      { file: 'jingle_victory',      volume: .7 }
}

let context = null
let master = null
let level = 1                // controle do jogador (0 a 1), multiplica o volume geral
const buffers = {}
const lastPlayed = {}

async function load(name) {
  const def = sounds[name]
  try {
    const response = await fetch('assets/sfx/' + def.file + '.wav')
    if (!response.ok) throw new Error('HTTP ' + response.status)
    buffers[name] = await context.decodeAudioData(await response.arrayBuffer())
  } catch (error) {
    console.warn('Falha ao carregar o efeito "' + name + '":', error)
  }
}

export const sfx = {
  init(audioContext) {
    if (context || !audioContext) return
    context = audioContext
    master = context.createGain()
    master.gain.value = sfxVolume * level
    master.connect(context.destination)
    Object.keys(sounds).forEach(load)
  },
  /** Volume dos efeitos escolhido pelo jogador, de 0 a 1 (vale também para os sons tocados fora deste módulo, via level). */
  get level() { return level },
  set level(v) { level = Math.max(0, Math.min(1, v)); if (master) master.gain.value = sfxVolume * level },
  play(name, { dx = 0, volume = 1 } = {}) {
    const def = sounds[name]
    const buffer = buffers[name]
    if (!def || !buffer || context.state !== 'running') return
    const now = context.currentTime
    if (def.gap && now - (lastPlayed[name] ?? -1) < def.gap) return
    const near = Math.max(0, 1 - Math.abs(dx) / hearingRange)
    if (near === 0) return
    lastPlayed[name] = now
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    source.playbackRate.value = 1 + (def.pitch ? (Math.random() * 2 - 1) * def.pitch : 0)
    gain.gain.value = def.volume * volume * near
    source.connect(gain).connect(master)
    source.start()
  }
}
