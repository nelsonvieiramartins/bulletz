// Configuração dos controles do P1 e do P2 (tela OPÇÕES): teclas do teclado e botões do controle, guardadas no navegador.
// Formato salvo em localStorage 'bulletz.controles':
//   { keys: [ {left,right,down,jump,fire} | null, ... ],          // teclas por jogador (listas de event.code); null = padrão do jogo
//     pad:  [ { device: 'auto' | 'none' | <id do controle>, map: { left,right,down,jump,fire } | null }, ... ] }
// Um comando de controle é { type: 'button', index } ou { type: 'axis', index, sign } (sign = -1 ou +1: para que lado do eixo).

export const ACTIONS = [['left', 'ESQUERDA'], ['right', 'DIREITA'], ['jump', 'PULAR'], ['down', 'AGACHAR'], ['fire', 'ATIRAR']]

// Padrões do jogo (os mesmos de antes das opções)
export const DEFAULT_KEYS = {
  solo: { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], down: ['ArrowDown', 'KeyS'], jump: ['Space', 'ArrowUp', 'KeyW'], fire: ['KeyG'] },   // 1 jogador
  p1: { left: ['KeyA'], right: ['KeyD'], down: ['KeyS'], jump: ['Space', 'KeyW'], fire: ['KeyG'] },                                                     // P1 com 2 jogadores
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'], jump: ['ArrowUp', 'Numpad0'], fire: ['KeyL', 'Numpad1', 'Numpad4'] }
}
// Teclas que o jogo já usa para outra coisa e não podem ser comandos
export const RESERVED_KEYS = new Set(['Escape', 'Enter', 'NumpadEnter', 'KeyR', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'ContextMenu'])

const STORAGE = 'bulletz.controles'
const cloneKeys = (k) => Object.fromEntries(ACTIONS.map(([a]) => [a, [...k[a]]]))
const validKeys = (k) => k && typeof k === 'object' && ACTIONS.every(([a]) => Array.isArray(k[a]) && k[a].length && k[a].every((c) => typeof c === 'string' && c.length < 24))
const validBinding = (b) => b && ((b.type === 'button' && Number.isInteger(b.index) && b.index >= 0 && b.index < 64) ||
  (b.type === 'axis' && Number.isInteger(b.index) && b.index >= 0 && b.index < 16 && (b.sign === 1 || b.sign === -1) && Number.isFinite(b.rest) && Math.abs(b.rest) <= 1))

export function loadControls() {
  const cfg = { keys: [null, null], pad: [{ device: 'auto', map: null }, { device: 'auto', map: null }] }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null')
    if (saved) for (const i of [0, 1]) {
      if (validKeys(saved.keys?.[i])) cfg.keys[i] = cloneKeys(saved.keys[i])
      const p = saved.pad?.[i]
      if (p) {
        if (typeof p.device === 'string' && p.device.length < 200) cfg.pad[i].device = p.device
        // só entram os comandos válidos (um comando antigo ou estragado é descartado sem perder os outros)
        if (p.map && typeof p.map === 'object') {
          const m = Object.fromEntries(ACTIONS.filter(([a]) => validBinding(p.map[a])).map(([a]) => [a, p.map[a]]))
          if (Object.keys(m).length) cfg.pad[i].map = m
        }
      }
    }
  } catch {}
  return cfg
}
export function saveControls(cfg) { try { localStorage.setItem(STORAGE, JSON.stringify(cfg)) } catch {} }

/** Teclas do jogador slot (0 = P1, 1 = P2): as personalizadas ou, na falta delas, o padrão do modo (1 ou 2 jogadores). */
export function effectiveKeys(cfg, slot, twoPlayers) {
  return cfg.keys[slot] ?? cloneKeys(slot === 1 ? DEFAULT_KEYS.p2 : twoPlayers ? DEFAULT_KEYS.p1 : DEFAULT_KEYS.solo)
}

// ---- nomes para mostrar ----
const KEY_NAMES = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'ESPAÇO', Backspace: 'BACKSPACE', Delete: 'DEL', Insert: 'INS', Home: 'HOME', End: 'END',
  PageUp: 'PG UP', PageDown: 'PG DN', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .' }
export function keyLabel(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return 'NUM ' + code.slice(6)
  return code.toUpperCase()
}
const STD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3', '↑', '↓', '←', '→', 'HOME']
const STD_AXES = [['Analógico ←', 'Analógico →'], ['Analógico ↑', 'Analógico ↓'], ['Analógico dir. ←', 'Analógico dir. →'], ['Analógico dir. ↑', 'Analógico dir. ↓']]
/** Nome de um comando de controle (usa os nomes do controle padrão quando o mapeamento é "standard"). */
export function bindingLabel(b, standard = true) {
  if (!b) return '—'
  if (b.type === 'button') return standard && STD_BUTTONS[b.index] ? 'BOTÃO ' + STD_BUTTONS[b.index] : 'BOTÃO ' + b.index
  if (b.index < 4 && standard) return STD_AXES[b.index][b.sign > 0 ? 1 : 0].toUpperCase()
  return 'EIXO ' + b.index + (b.sign > 0 ? ' +' : ' −')
}
/** Nome curto de um controle detectado (tira os códigos de fabricante). */
export function padName(pad) {
  const id = String(pad.id || 'Controle').replace(/\(.*?(vendor|vid).*?\)/gi, '').replace(/\s{2,}/g, ' ').trim()
  return id.length > 38 ? id.slice(0, 36) + '…' : id
}

// ---- leitura de um comando (usado pelo jogo e pela captura da tela de opções) ----
/** Quanto o comando b está acionado no controle pad (0 a 1). */
export function bindingValue(pad, b, deadzone = .35) {
  if (!pad || !b) return 0
  if (b.type === 'button') return pad.buttons[b.index]?.pressed ? 1 : 0
  // eixo: conta a partir do repouso que foi lido na captura (gatilhos analógicos repousam em -1: sem isso ficariam "apertados" sozinhos)
  const v = pad.axes[b.index]
  if (!Number.isFinite(v) || Math.abs(v) > 1) return 0
  const span = Math.abs((b.sign > 0 ? 1 : -1) - (b.rest ?? 0))
  if (span < .5) return 0   // o repouso já está no extremo desse lado: comando inválido
  const d = (v - (b.rest ?? 0)) * b.sign
  return d > deadzone * span ? Math.min(1, (d - deadzone * span) / (span * (1 - deadzone))) : 0
}
/** Procura o primeiro comando acionado agora (botão apertado ou eixo empurrado), para a captura. baseline = eixos em repouso. */
export function pressedBinding(pad, baseline) {
  const button = pad.buttons.findIndex((x) => x.pressed)
  if (button >= 0) return { type: 'button', index: button }
  for (let i = 0; i < pad.axes.length; i++) {
    const v = pad.axes[i] - (baseline?.[i] ?? 0)
    if (Math.abs(v) > .7 && Math.abs(pad.axes[i]) <= 1) return { type: 'axis', index: i, sign: v > 0 ? 1 : -1, rest: Math.round((baseline?.[i] ?? 0) * 100) / 100 }
  }
  return null
}

/**
 * Escolhe o controle de cada jogador. pads = controles conectados. Devolve [pad do P1, pad do P2] (null = nenhum).
 * 'auto': o P1 fica com o primeiro e o P2 com o próximo; um controle escolhido pelo nome vale para aquele jogador; 'none' = sem controle.
 */
export function assignPads(cfg, pads) {
  const result = [null, null], used = new Set()
  for (const i of [0, 1]) {
    const d = cfg.pad[i].device
    if (d === 'auto' || d === 'none') continue
    const found = pads.find((p) => p.id === d && !used.has(p.index))
    if (found) { result[i] = found; used.add(found.index) }
  }
  for (const i of [0, 1]) {
    if (cfg.pad[i].device !== 'auto') continue
    const found = pads.find((p) => !used.has(p.index))
    if (found) { result[i] = found; used.add(found.index) }
  }
  return result
}
