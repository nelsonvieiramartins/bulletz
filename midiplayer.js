// Toca um arquivo MIDI direto no navegador com um sintetizador feito de osciladores (sem banco de sons):
// guitarras distorcidas, baixo, melodia de voz em onda quadrada e bateria de ruído. Fica com som de 8/16 bits.
// A interface imita a do <audio> que o jogo usa para a trilha (paused, volume, play, pause, addEventListener),
// então game.js troca uma pela outra sem mexer nos botões de música.
//
// Uso: const trilha = createMidiPlayer('assets/musica-fase2/creed-what-if-2.mid')

// ---------- leitura do MIDI (formato 0/1; só o que a música usa: notas, tempo e programa) ----------
function parseMidi(buffer) {
  const data = new Uint8Array(buffer)
  const u16 = (i) => (data[i] << 8) | data[i + 1]
  const u32 = (i) => ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0
  if (u32(0) !== 0x4d546864) throw new Error('Não é um arquivo MIDI')
  const trackCount = u16(10)
  const division = u16(12)
  if (division & 0x8000) throw new Error('MIDI com tempo em SMPTE não suportado')
  let pos = 8 + u32(4)
  const tempos = [[0, 500000]]
  const notes = []   // { tick, end, note, vel, ch }
  const programs = {}
  for (let t = 0; t < trackCount; t++) {
    if (u32(pos) !== 0x4d54726b) throw new Error('Trilha MIDI inválida')
    const end = pos + 8 + u32(pos + 4)
    let p = pos + 8, tick = 0, status = 0
    const open = new Map()
    const varLen = () => { let v = 0, b; do { b = data[p++]; v = (v << 7) | (b & 0x7f) } while (b & 0x80); return v }
    while (p < end) {
      tick += varLen()
      let b = data[p]
      if (b === 0xff) {
        const type = data[p + 1]; p += 2
        const len = varLen()
        if (type === 0x51) tempos.push([tick, (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]])
        p += len
      } else if (b === 0xf0 || b === 0xf7) {
        p++; p += varLen()
      } else {
        if (b & 0x80) { status = b; p++ }
        const kind = status >> 4, ch = status & 15
        if (kind === 0xc || kind === 0xd) {
          if (kind === 0xc && programs[ch] === undefined) programs[ch] = data[p]
          p++
        } else {
          const d1 = data[p], d2 = data[p + 1]; p += 2
          const key = ch * 128 + d1
          if (kind === 9 && d2 > 0) {
            if (open.has(key)) open.get(key).end = tick   // nota repetida sem soltar: fecha a anterior
            const n = { tick, end: tick + 1, note: d1, vel: d2, ch }
            open.set(key, n); notes.push(n)
          } else if (kind === 8 || kind === 9) {
            const n = open.get(key)
            if (n) { n.end = tick; open.delete(key) }
          }
        }
      }
    }
    pos = end
  }
  tempos.sort((a, b) => a[0] - b[0])
  // mapa de tempo: segundos no início de cada trecho de tempo constante
  const map = []
  let seconds = 0, lastTick = 0, lastTempo = 500000
  for (const [tick, tempo] of tempos) {
    seconds += (tick - lastTick) / division * lastTempo / 1e6
    map.push({ tick, seconds, tempo })
    lastTick = tick; lastTempo = tempo
  }
  const toSeconds = (tick) => {
    let seg = map[0]
    for (const m of map) { if (m.tick <= tick) seg = m; else break }
    return seg.seconds + (tick - seg.tick) / division * seg.tempo / 1e6
  }
  const events = notes.map((n) => ({ t: toSeconds(n.tick), dur: Math.max(.04, toSeconds(n.end) - toSeconds(n.tick)), note: n.note, vel: n.vel / 127, ch: n.ch }))
  events.sort((a, b) => a.t - b.t)
  const length = events.reduce((m, e) => Math.max(m, e.t + e.dur), 0)
  return { events, programs, length }
}

// ---------- sintetizador ----------
const hz = (note) => 440 * 2 ** ((note - 69) / 12)

function createVoices(ctx, out) {
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  const drive = ctx.createWaveShaper()   // distorção compartilhada pelas guitarras
  const setDrive = (amount) => {          // amount: quanto a onda é espremida (5 = bem distorcido, 1 = quase limpo)
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount) }
    drive.curve = curve
  }
  setDrive(5)
  drive.oversample = '2x'
  const guitarTone = ctx.createBiquadFilter()
  guitarTone.type = 'lowpass'
  guitarTone.frequency.value = 3200
  const guitarLow = ctx.createBiquadFilter()   // corta o grave das guitarras (ajustado por música)
  guitarLow.type = 'highpass'
  guitarLow.frequency.value = 20
  const guitarBus = ctx.createGain()
  guitarBus.gain.value = .5
  drive.connect(guitarTone).connect(guitarLow).connect(guitarBus).connect(out)
  // reverb das guitarras: resposta de sala sintética (ruído que decai em ~1,4 s) misturada em pequena dose
  const room = ctx.createConvolver()
  const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.4), ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / ctx.sampleRate * 4.5)
  }
  room.buffer = impulse
  const reverbSend = ctx.createGain()
  reverbSend.gain.value = 0
  guitarBus.connect(reverbSend).connect(room).connect(out)
  // mixagem da música atual: bass e kick multiplicam o volume do baixo e do bumbo; lowCut (Hz) corta o grave das
  // guitarras; drive é a distorção delas (5 = padrão, menor = mais limpo); guitar é o estilo da guitarra:
  // 'distorcida' (padrão), 'limpa' (guitarra elétrica limpa) ou 'acustica' (violão dedilhado);
  // reverb é a dose de reverberação das guitarras (0 = nenhuma, .1 = bem pouco, .4 = bastante)
  const mix = { bass: 1, kick: 1, lowCut: 20, drive: 5, guitar: 'distorcida', reverb: 0 }

  const envelope = (node, t, peak, dur, attack = .008, release = .07) => {
    node.gain.setValueAtTime(0, t)
    node.gain.linearRampToValueAtTime(peak, t + attack)
    node.gain.setValueAtTime(peak, t + Math.max(attack, dur))
    node.gain.exponentialRampToValueAtTime(.0001, t + dur + release)
    return t + dur + release + .02
  }
  const tone = (type, freq, t, peak, dur, dest, detune = 0, attack, release) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = detune
    osc.connect(gain).connect(dest)
    osc.start(t)
    osc.stop(envelope(gain, t, peak, dur, attack, release))
  }
  const burst = (t, dur, peak, filterType, freq, q = 1) => {
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    src.buffer = noise
    filter.type = filterType
    filter.frequency.value = freq
    filter.Q.value = q
    src.connect(filter).connect(gain).connect(out)
    gain.gain.setValueAtTime(peak, t)
    gain.gain.exponentialRampToValueAtTime(.0001, t + dur)
    src.start(t, Math.random() * .5)
    src.stop(t + dur + .02)
  }
  const sweep = (t, from, to, dur, peak) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(to, t + dur)
    osc.connect(gain).connect(out)
    gain.gain.setValueAtTime(peak, t)
    gain.gain.exponentialRampToValueAtTime(.0001, t + dur)
    osc.start(t)
    osc.stop(t + dur + .02)
  }

  return {
    setMix(m = {}) {
      Object.assign(mix, { bass: 1, kick: 1, lowCut: 20, drive: 5, guitar: 'distorcida', reverb: 0 }, m)
      guitarLow.frequency.value = mix.lowCut
      reverbSend.gain.value = mix.reverb
      setDrive(mix.drive)
    },
    guitar(e, t) {
      const freq = hz(e.note), peak = .2 * (.4 + .6 * e.vel), dur = Math.min(e.dur, 2.5)
      if (mix.guitar === 'limpa') {          // elétrica limpa: timbre arredondado, brilho suave, som que vai caindo
        const tone1 = ctx.createBiquadFilter()
        tone1.type = 'lowpass'; tone1.frequency.value = 2400
        tone1.connect(guitarLow)
        tone('triangle', freq, t, peak * 1.1, dur, tone1, -4, .006, .12)
        tone('sawtooth', freq, t, peak * .22, dur, tone1, 5, .006, .12)
        tone('sine', freq * 2, t, peak * .25, Math.min(dur, .8), tone1, 0, .006, .1)
      } else if (mix.guitar === 'acustica') {   // violão: ataque brilhante que escurece rápido e some em ~1,5 s
        const body = ctx.createBiquadFilter(), gain = ctx.createGain()
        body.type = 'lowpass'
        body.frequency.setValueAtTime(5000, t)
        body.frequency.exponentialRampToValueAtTime(650, t + .35)
        body.connect(gain).connect(guitarLow)
        const decay = Math.min(.55 + 40 / freq, 1)
        const stop = t + Math.min(dur + .15, 2.2)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(peak * 1.5, t + .004)
        gain.gain.setTargetAtTime(0, t + .01, decay * .45)
        for (const [type, detune, level] of [['sawtooth', -3, 1], ['triangle', 4, .7]]) {
          const osc = ctx.createOscillator(), g = ctx.createGain()
          osc.type = type; osc.frequency.value = freq; osc.detune.value = detune
          g.gain.value = level
          osc.connect(g).connect(body)
          osc.start(t); osc.stop(stop)
        }
      } else {
        tone('sawtooth', freq, t, peak, dur, drive, -6)
        tone('sawtooth', freq, t, peak * .8, dur, drive, 7)
      }
    },
    bass(e, t) {
      const freq = hz(e.note), dur = Math.min(e.dur, 2.5)
      tone('triangle', freq, t, mix.bass * .5 * (.5 + .5 * e.vel), dur, out, 0, .01, .08)
      tone('sawtooth', freq, t, mix.bass * .12, dur, out, 0, .01, .06)
    },
    lead(e, t) {   // melodia da voz: onda quadrada com um pouco de vibrato lento
      const freq = hz(e.note), dur = Math.min(e.dur, 3)
      const osc = ctx.createOscillator(), gain = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      lfo.frequency.value = 5.5
      depth.gain.value = freq * .006
      lfo.connect(depth).connect(osc.frequency)
      osc.connect(gain).connect(out)
      const stop = envelope(gain, t, .09 * (.5 + .5 * e.vel), dur, .02, .09)
      lfo.start(t); osc.start(t); osc.stop(stop); lfo.stop(stop)
    },
    backing(e, t) {
      tone('triangle', hz(e.note), t, .07, Math.min(e.dur, 3), out, 0, .05, .2)
    },
    drum(e, t) {
      const v = .4 + .6 * e.vel
      switch (e.note) {
        case 35: case 36: sweep(t, 150, 42, .16, .75 * v * mix.kick); burst(t, .02, .15 * v, 'lowpass', 900); break
        case 37: burst(t, .05, .25 * v, 'bandpass', 2500, 2); break
        case 38: case 40: burst(t, .15, .5 * v, 'bandpass', 1900, .8); sweep(t, 230, 140, .09, .3 * v); break
        case 39: burst(t, .1, .35 * v, 'bandpass', 1500, 1); break
        case 41: case 43: sweep(t, 130, 70, .22, .6 * v * mix.kick); break
        case 45: case 47: sweep(t, 190, 100, .2, .55 * v); break
        case 48: case 50: sweep(t, 260, 140, .18, .5 * v); break
        case 42: case 44: burst(t, .045, .2 * v, 'highpass', 7500); break
        case 46: burst(t, .24, .2 * v, 'highpass', 7000); break
        case 49: case 52: case 55: case 57: burst(t, .9, .3 * v, 'highpass', 4500); break
        case 51: case 53: case 59: burst(t, .22, .15 * v, 'highpass', 8500); break
        default: burst(t, .08, .15 * v, 'bandpass', 3000)
      }
    }
  }
}

// ---------- player com a interface do <audio> ----------
export function createMidiPlayer(url, { volume = .4, loop = true, mix: initialMix } = {}) {
  let currentMix = initialMix
  let ctx = null, master = null, voices = null, song = null
  let timer = null, loading = null
  let startAt = 0, cursor = 0, passes = 0
  let playing = false
  let level = volume
  const listeners = { playing: [], pause: [] }
  const emit = (name) => listeners[name].forEach((fn) => fn())
  const lookahead = .6

  function voiceFor(e) {
    if (e.ch === 9) return voices.drum
    const program = song.programs[e.ch] ?? 0
    if (program >= 24 && program <= 31) return voices.guitar     // guitarras
    if (program >= 32 && program <= 39) return voices.bass       // baixos
    if (e.ch === 8) return voices.backing                        // vocal de apoio (canal 9 no MIDI)
    return program >= 56 && program <= 79 ? voices.lead : voices.backing
  }

  function schedule() {
    if (!playing) return
    const horizon = ctx.currentTime + lookahead
    for (;;) {
      if (cursor >= song.events.length) {
        if (!loop) { api.pause(); return }
        cursor = 0
        passes++
      }
      const e = song.events[cursor]
      const t = startAt + passes * (song.length + .4) + e.t
      if (t > horizon) break
      if (t >= ctx.currentTime - .05) voiceFor(e)(e, Math.max(t, ctx.currentTime))
      cursor++
    }
  }

  async function load() {
    if (loading) return loading
    loading = (async () => {
      const AudioEngine = window.AudioContext || window.webkitAudioContext
      ctx = new AudioEngine()
      master = ctx.createGain()
      master.gain.value = level * .8
      const limiter = ctx.createDynamicsCompressor()
      master.connect(limiter).connect(ctx.destination)
      voices = createVoices(ctx, master)
      voices.setMix(currentMix)
      song = await fetchSong(url)
    })()
    return loading
  }

  async function fetchSong(source) {
    const response = await fetch(source)
    if (!response.ok) throw new Error('Falha ao carregar o MIDI: HTTP ' + response.status)
    return parseMidi(await response.arrayBuffer())
  }

  const api = {
    get paused() { return !playing },
    get volume() { return level },
    set volume(v) { level = v; if (master) master.gain.value = v * .8 },
    async play() {
      if (playing) return
      await load()
      await ctx.resume()
      if (!timer) { startAt = ctx.currentTime + .1; cursor = 0; passes = 0 }
      playing = true
      if (!timer) timer = setInterval(schedule, 120)
      schedule()
      emit('playing')
    },
    pause() {
      if (!playing) return
      playing = false
      ctx?.suspend()   // congela a linha do tempo: ao tocar de novo continua de onde parou
      emit('pause')
    },
    /** Troca a música; se já estava tocando, continua tocando a nova desde o começo. */
    async setSource(newUrl, mix) {
      currentMix = mix
      voices?.setMix(mix)
      if (newUrl === url) return
      url = newUrl
      if (!ctx) return                       // ainda não carregou nada: o primeiro play usa a nova
      await loading
      const wasPlaying = playing
      playing = false
      song = await fetchSong(newUrl)
      cursor = 0
      passes = 0
      startAt = ctx.currentTime + .1
      if (wasPlaying) { playing = true; schedule() }
    },
    addEventListener(name, fn) { listeners[name]?.push(fn) }
  }
  return api
}
