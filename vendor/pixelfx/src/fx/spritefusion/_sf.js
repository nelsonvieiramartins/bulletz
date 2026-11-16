// Ponte entre os efeitos oficiais do Sprite Fusion (MIT, © 2026 Hugo Duprez, https://www.spritefusion.com/pixel-art-vfx)
// e o formato desta biblioteca. Os efeitos deles trabalham em unidades de mundo (2 por pixel de arte) e desenham direto
// no quadro (mesmo formato de quadro do pixelfx); o adaptador só cria o efeito na origem do efeito e repassa update/draw.
export function bridge(make) {
  return {
    create(o) {
      let fx = null
      const get = () => fx ?? (fx = make(o))
      return {
        update(dt) { get().update(dt) },
        drawBack(p) { get().draw(p.frame, 'back') },
        draw(p) { get().draw(p.frame, 'front') },
      }
    },
  }
}
