// Ponte para o pixel-vfx-codex (https://github.com/888wing/pixel-vfx-codex, MIT, (c) 2026 Pixel VFX Codex contributors;
// os 64 efeitos "game" recriam a biblioteca 00GameDevs, MIT, (c) 2026 00GameDevs; o motor adapta tecnicas do pixel-plays, MIT, (c) 2026 Amir Mushich).
// Os arquivos originais ficam intactos em vendor/pixel-vfx-codex/ (scripts classicos que registram PXFX.define no window).
// Aqui cada efeito vira um modulo da nossa biblioteca: o motor renderiza o efeito num buffer pequeno com fundo transparente
// (camera 2D de frente, ou 2.5D) e o adaptador copia os pixels para o nosso quadro. Os scripts so carregam quando um efeito e usado.
const base = (p) => new URL('../../../../pixel-vfx-codex/' + p, import.meta.url).href
const loaded = new Map()
function loadScript(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = ok
    s.onerror = () => { loaded.delete(src); fail(new Error('falha ao carregar ' + src)) }
    document.head.append(s)
  }))
  return loaded.get(src)
}
let engine = null
const loadEngine = () => engine ?? (engine = loadScript(base('engine/pxfx.js')).then(() => loadScript(base('engine/kit.js'))))
const SIZE = { '2d': [160, 100], '25d': [240, 150], '3d': [240, 150] }
const views = {}
function viewFor(mode) {
  if (!views[mode]) {
    const [w, h] = SIZE[mode]
    const v = new PXFX.View(null, w, h)
    v.mode = mode
    v.transparent = true   // sem fundo e sem cenario: so o efeito
    v.noProps = true
    views[mode] = v
  }
  return views[mode]
}

export function codexFx([id, pack, name, desc, category, schools, duration]) {
  const meta = {
    name: name + ' (Codex)',
    desc: desc + ' Do pixel-vfx-codex, pacote ' + pack + '.',
    tags: ['codex', pack, category, ...schools, duration > 4 ? 'long' : 'one-shot'],
    size: [160, 100],
    origin: [80, 64],
    duration,
    loop: false,
    fps: 12,
    bg: 'ground',
    options: { scale: 1, mode: '2d' },
  }
  return {
    meta,
    create(o) {
      let def = null, tm = null
      loadEngine().then(() => loadScript(base('fx/' + id + '.js'))).then(() => { def = PXFX.get(id); tm = PXFX.timing(def) }).catch((e) => console.warn('[codex]', e.message))
      return {
        update() {},
        draw(p, t) {
          if (!def) return
          const mode = SIZE[o.mode] ? o.mode : '2d', v = viewFor(mode), [W, H] = SIZE[mode]
          v.renderAt(def, Math.min(t, tm.length - 1e-3), tm)
          const s = Math.max(1, Math.round(o.scale || 1)), f = p.frame, ox = Math.round(o.x ?? 0), oy = Math.round(o.y ?? 0)
          const cx = W >> 1, cy = Math.round(H * 0.64), flip = o.flip ? -1 : 1
          const pix = v.pix, C = f.color
          for (let by = 0; by < H; by++) {
            for (let bx = 0; bx < W; bx++) {
              const c = pix[by * W + bx]
              if (!(c >>> 24)) continue
              const x0 = ox + (bx - cx) * s * flip - (flip < 0 ? s - 1 : 0) - f.ox, y0 = oy + (by - cy) * s - f.oy
              for (let dy = 0; dy < s; dy++) {
                const y = y0 + dy
                if (y < 0 || y >= f.h) continue
                for (let dx = 0; dx < s; dx++) {
                  const x = x0 + dx
                  if (x >= 0 && x < f.w) C[y * f.w + x] = c
                }
              }
            }
          }
        },
      }
    },
  }
}
