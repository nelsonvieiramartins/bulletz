// Tela OPÇÕES: detecta os controles ligados ao computador e mapeia os comandos do P1 e do P2 (teclado e controle).
// O jogo cria a tela com createOptions() e a liga a três pontos: handleKey(event) (teclado), tick(dt) (a cada quadro, para ler os controles) e
// onChange() (avisa que a configuração mudou, para o jogo aplicá-la na hora).
import { ACTIONS, DEFAULT_KEYS, RESERVED_KEYS, effectiveKeys, keyLabel, bindingLabel, padName, assignPads, pressedBinding, bindingValue } from './controles.js?v=2'

export function createOptions({ root, cfg, save, getPads, getTwoPlayers, onChange, onClose }) {
  const listen = { target: null, ready: false, baseline: null, wait: 0 }   // captura em andamento: { slot, kind: 'key' | 'pad', action }
  let message = ''
  let openedAt = 0
  let padSignature = ''
  const PLAYER = [{ name: 'JOGADOR 1', cls: 'p1' }, { name: 'JOGADOR 2', cls: 'p2' }]
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e }
  const isStandard = (pad) => pad?.mapping === 'standard'
  const devices = () => getPads().filter(Boolean)

  // todas as teclas em uso (para não repetir): [{ code, slot, action }]
  function usedKeys() {
    const out = []
    for (const slot of [0, 1]) { const k = effectiveKeys(cfg, slot, getTwoPlayers()); for (const [a] of ACTIONS) for (const code of k[a]) out.push({ code, slot, action: a }) }
    return out
  }
  const actionName = (a) => ACTIONS.find(([k]) => k === a)[1]

  function setKey(slot, action, code) {
    if (RESERVED_KEYS.has(code)) { message = keyLabel(code) + ' não pode ser usada como comando. Escolha outra tecla.'; return false }
    const clash = usedKeys().find((u) => u.code === code && !(u.slot === slot && u.action === action))
    if (clash) { message = `${keyLabel(code)} já é usada por ${PLAYER[clash.slot].name} · ${actionName(clash.action)}. Escolha outra tecla.`; return false }
    const keys = effectiveKeys(cfg, slot, getTwoPlayers())
    keys[action] = [code]
    cfg.keys[slot] = keys
    return true
  }
  function setBinding(slot, action, binding) {
    const map = { ...(cfg.pad[slot].map || {}) }
    const clash = ACTIONS.find(([a]) => a !== action && map[a] && map[a].type === binding.type && map[a].index === binding.index && map[a].sign === binding.sign)
    if (clash) { message = `${bindingLabel(binding, true)} já é usado em ${clash[1]}. Escolha outro comando.`; return false }
    map[action] = binding
    cfg.pad[slot].map = map
    return true
  }
  const changed = () => { save(cfg); onChange() }

  // ---- desenho ----
  function render() {
    const keep = root.querySelector('.opt-item:focus')?.dataset.id
    root.replaceChildren()
    root.append(el('h2', 'opt-title', 'OPÇÕES'))
    const pads = devices()
    padSignature = pads.map((p) => p.index + ':' + p.id).join('|')
    // controles detectados
    const found = el('section', 'opt-found')
    found.append(el('h3', '', 'CONTROLES DETECTADOS'))
    if (!pads.length) found.append(el('p', 'opt-none', 'Nenhum controle encontrado. Conecte um controle (USB ou Bluetooth) e aperte um botão nele para o navegador liberar a leitura.'))
    else for (const p of pads) {
      const row = el('div', 'opt-pad'); row.dataset.pad = p.index
      row.append(el('span', 'opt-led'), el('span', 'opt-padname', `Controle ${p.index + 1} · ${padName(p)}`), el('small', '', isStandard(p) ? 'mapeamento padrão' : 'controle genérico'))
      found.append(row)
    }
    root.append(found)
    // colunas dos jogadores
    const cols = el('div', 'opt-cols')
    for (const slot of [0, 1]) cols.append(playerColumn(slot, pads))
    root.append(cols)
    const msg = el('p', 'opt-msg'); msg.id = 'opt-msg'; msg.textContent = message; root.append(msg)
    const back = el('button', 'opt-item opt-back', 'VOLTAR'); back.type = 'button'; back.dataset.id = 'back'; back.onclick = () => close()
    root.append(back)
    if (keep) root.querySelector(`.opt-item[data-id="${keep}"]`)?.focus({ preventScroll: true })
  }

  function item(text, id, onClick, cls = '') {
    const b = el('button', 'opt-item ' + cls, text); b.type = 'button'; b.dataset.id = id; b.onclick = onClick
    return b
  }
  function startListen(slot, kind, action) {
    listen.target = { slot, kind, action }; listen.ready = false; listen.baseline = null; listen.wait = 0
    message = kind === 'key' ? `Aperte a tecla para ${actionName(action)} do ${PLAYER[slot].name} (ESC cancela)` : `Aperte o botão (ou empurre o analógico) para ${actionName(action)} do ${PLAYER[slot].name} (ESC cancela)`
    if (kind === 'pad' && !assignPads(cfg, devices())[slot]) { listen.target = null; message = `${PLAYER[slot].name} está sem controle. Conecte um e aperte um botão nele, ou escolha o controle em "Dispositivo".` }
    render()
    root.querySelector('.opt-item.listening')?.focus({ preventScroll: true })
  }
  function playerColumn(slot, pads) {
    const col = el('section', 'opt-col ' + PLAYER[slot].cls)
    col.append(el('h3', 'opt-player', PLAYER[slot].name))
    const keys = effectiveKeys(cfg, slot, getTwoPlayers())
    col.append(el('h4', '', 'TECLADO'))
    for (const [a, label] of ACTIONS) {
      const on = listen.target && listen.target.slot === slot && listen.target.kind === 'key' && listen.target.action === a
      const row = el('div', 'opt-row'); row.append(el('span', 'opt-action', label))
      row.append(item(on ? 'APERTE UMA TECLA…' : keys[a].map(keyLabel).join(' / '), `k${slot}${a}`, () => startListen(slot, 'key', a), on ? 'listening' : ''))
      col.append(row)
    }
    col.append(el('h4', '', 'CONTROLE'))
    // dispositivo: gira entre automático, nenhum e os controles detectados
    const choices = ['auto', 'none', ...pads.map((p) => p.id)]
    const current = cfg.pad[slot].device
    if (!choices.includes(current)) choices.push(current)
    const label = (d) => d === 'auto' ? 'AUTOMÁTICO' : d === 'none' ? 'NENHUM' : (pads.find((p) => p.id === d) ? padName(pads.find((p) => p.id === d)) : padName({ id: d }) + ' (desconectado)')
    const dev = el('div', 'opt-row'); dev.append(el('span', 'opt-action', 'DISPOSITIVO'))
    dev.append(item('◀ ' + label(current) + ' ▶', `d${slot}`, () => { cfg.pad[slot].device = choices[(choices.indexOf(current) + 1) % choices.length]; message = ''; changed(); render() }))
    col.append(dev)
    const assigned = assignPads(cfg, pads)[slot]
    col.append(el('p', 'opt-assigned', assigned ? `Em uso: Controle ${assigned.index + 1} · ${padName(assigned)}` : 'Nenhum controle em uso.'))
    const map = cfg.pad[slot].map || {}
    for (const [a, labelA] of ACTIONS) {
      const on = listen.target && listen.target.slot === slot && listen.target.kind === 'pad' && listen.target.action === a
      const row = el('div', 'opt-row'); row.append(el('span', 'opt-action', labelA))
      row.append(item(on ? 'APERTE UM BOTÃO…' : map[a] ? bindingLabel(map[a], isStandard(assigned)) : 'PADRÃO', `p${slot}${a}`, () => startListen(slot, 'pad', a), (on ? 'listening ' : '') + (map[a] ? '' : 'dim')))
      col.append(row)
    }
    col.append(item('RESTAURAR PADRÃO', `r${slot}`, () => { cfg.keys[slot] = null; cfg.pad[slot] = { device: 'auto', map: null }; message = `${PLAYER[slot].name}: configuração padrão restaurada.`; changed(); render() }, 'opt-reset'))
    return col
  }

  // ---- teclado: devolve true se a tecla foi tratada ----
  function handleKey(event) {
    if (performance.now() - openedAt < 350) { event.preventDefault(); return true }   // o toque que abriu a tela não vale como comando
    if (listen.target?.kind === 'key') {
      event.preventDefault(); event.stopPropagation()
      if (event.code === 'Escape') { listen.target = null; message = 'Cancelado.'; render(); return true }
      const { slot, action } = listen.target
      if (setKey(slot, action, event.code)) { listen.target = null; message = `${actionName(action)} do ${PLAYER[slot].name}: ${keyLabel(event.code)}`; changed() }
      render()
      return true
    }
    if (listen.target?.kind === 'pad') {
      if (event.code === 'Escape') { event.preventDefault(); listen.target = null; message = 'Cancelado.'; render() }
      return true   // enquanto espera o controle, o teclado não faz mais nada
    }
    if (event.code === 'Escape') { event.preventDefault(); close(); return true }
    const items = [...root.querySelectorAll('.opt-item')]
    const i = items.indexOf(document.activeElement)
    if (['ArrowDown', 'ArrowRight', 'Tab'].includes(event.code) && !event.shiftKey) { event.preventDefault(); items[(i + 1 + items.length) % items.length]?.focus(); return true }
    if (['ArrowUp', 'ArrowLeft'].includes(event.code) || (event.code === 'Tab' && event.shiftKey)) { event.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); return true }
    if (['Enter', 'NumpadEnter', 'Space'].includes(event.code)) { event.preventDefault(); (i >= 0 ? items[i] : items[0])?.click(); return true }
    return false
  }

  // ---- a cada quadro: captura de botão do controle, controle andando pelas opções e luz dos controles ----
  let navDir = 0, navJump = false
  function tick(dt) {
    const pads = devices()
    const sig = pads.map((p) => p.index + ':' + p.id).join('|')
    if (sig !== padSignature && !listen.target) render()   // controle ligado ou desligado: refaz a lista
    for (const p of pads) {
      const led = root.querySelector(`.opt-pad[data-pad="${p.index}"] .opt-led`)
      if (led) led.classList.toggle('on', p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > .5 && Math.abs(a) <= 1))
    }
    if (listen.target?.kind === 'pad') {
      const pad = assignPads(cfg, pads)[listen.target.slot]
      if (!pad) { listen.target = null; message = 'O controle foi desligado.'; render(); return }
      listen.wait += dt
      if (!listen.ready) {
        // espera soltar tudo (o toque que abriu a captura) e fixar o repouso dos eixos
        if (!pad.buttons.some((b) => b.pressed) && listen.wait > .45) { listen.ready = true; listen.baseline = [...pad.axes] }
        return
      }
      const b = pressedBinding(pad, listen.baseline)
      if (b) {
        const { slot, action } = listen.target
        if (setBinding(slot, action, b)) { listen.target = null; message = `${actionName(action)} do ${PLAYER[slot].name}: ${bindingLabel(b, isStandard(pad))}`; changed() }
        else { listen.ready = false; listen.wait = 0 }
        render()
      }
      return
    }
    // controle navegando pela tela: qualquer controle (direção/agachar andam, pulo aperta)
    let dir = 0, jump = false
    for (const p of pads) {
      const x = p.axes[0] ?? 0, y = p.axes[1] ?? 0
      const left = p.buttons[14]?.pressed || x < -.6, right = p.buttons[15]?.pressed || x > .6
      const up = p.buttons[12]?.pressed || y < -.6, down = p.buttons[13]?.pressed || y > .6
      if (right || down) dir = 1; else if (left || up) dir = -1
      if (p.buttons[0]?.pressed) jump = true
      if (p.buttons[1]?.pressed && !navJump) { navJump = true; close(); return }
    }
    const items = [...root.querySelectorAll('.opt-item')]
    const i = items.indexOf(document.activeElement)
    if (dir && dir !== navDir) items[(i + dir + items.length) % items.length]?.focus()
    navDir = dir
    if (jump && !navJump) { (i >= 0 ? items[i] : items[0])?.click() }
    navJump = jump
  }

  function open() { openedAt = performance.now(); listen.target = null; message = ''; navDir = 1; navJump = true; render(); root.querySelector('.opt-item')?.focus({ preventScroll: true }) }
  function close() { listen.target = null; onClose() }
  return { open, close, tick, handleKey, render, get listening() { return !!listen.target } }
}
