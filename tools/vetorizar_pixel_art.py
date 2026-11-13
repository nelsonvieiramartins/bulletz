"""Converte uma imagem "falso pixel art" (ampliada, grade irregular) em pixel art real + vetor.

Reduz para a grade verdadeira (cor mais frequente por célula), limita a paleta e grava:
  <saida>.png  pixel art 1:1 com transparência
  <saida>.svg  um caminho composto por cor (cada pixel = quadrado vetorial)

Uso: python tools/vetorizar_pixel_art.py entrada saida [--celula 10.53] [--cores 28] [--escala 8]
"""
import argparse
from collections import Counter
from pathlib import Path

from PIL import Image


def reduce_to_grid(src, cell, colors):
    src = src.convert('RGBA')
    w, h = src.size
    gw, gh = round(w / cell), round(h / cell)
    # paleta calculada só com os pixels opacos
    opaque = [p[:3] for p in src.getdata() if p[3] > 200]
    strip = Image.new('RGB', (len(opaque), 1))
    strip.putdata(opaque)
    pal_img = strip.quantize(colors, method=Image.Quantize.MEDIANCUT, kmeans=3)
    quant = src.convert('RGB').quantize(palette=pal_img, dither=Image.Dither.NONE)
    pal = pal_img.getpalette()
    qpx, apx = quant.load(), src.getchannel('A').load()
    out = Image.new('RGBA', (gw, gh), (0, 0, 0, 0))
    opx = out.load()
    for gy in range(gh):
        y0, y1 = round(gy * h / gh), round((gy + 1) * h / gh)
        for gx in range(gw):
            x0, x1 = round(gx * w / gw), round((gx + 1) * w / gw)
            # ignora a borda da célula, onde a grade irregular mistura vizinhos
            mx, my = max(1, (x1 - x0) // 4), max(1, (y1 - y0) // 4)
            votes, solid, total = Counter(), 0, 0
            for y in range(y0 + my, y1 - my):
                for x in range(x0 + mx, x1 - mx):
                    total += 1
                    if apx[x, y] > 128:
                        solid += 1
                        votes[qpx[x, y]] += 1
            if total and solid * 2 > total:
                i = votes.most_common(1)[0][0]
                opx[gx, gy] = (pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2], 255)
    return out


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def to_svg(im, scale, name):
    w, h = im.size
    px = im.load()
    active, rects = {}, {}
    for y in range(h + 1):
        runs = []
        if y < h:
            x = 0
            while x < w:
                p = px[x, y]
                if p[3] == 0:
                    x += 1
                    continue
                x0 = x
                while x < w and px[x, y] == p:
                    x += 1
                runs.append((x0, x, p[:3]))
        new = {k: active.pop(k, y) for k in runs}
        for (x0, x1, c), y0 in active.items():
            rects.setdefault(c, []).append((x0, y0, x1 - x0, y - y0))
        active = new
    paths = []
    for c, rs in sorted(rects.items(), key=lambda kv: sum(kv[0])):
        d = ''.join(f'M{x * scale} {y * scale}h{rw * scale}v{rh * scale}h{-rw * scale}z' for x, y, rw, rh in rs)
        paths.append(f'<path fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}" d="{d}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w * scale}" height="{h * scale}" '
            f'viewBox="0 0 {w * scale} {h * scale}" shape-rendering="crispEdges">\n<g id="{name}">\n'
            + '\n'.join(paths) + '\n</g>\n</svg>\n'), len(rects), sum(len(r) for r in rects.values())


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('entrada')
    ap.add_argument('saida', help='caminho de saída sem extensão')
    ap.add_argument('--celula', type=float, default=10.53, help='tamanho do pixel na imagem de entrada')
    ap.add_argument('--cores', type=int, default=28)
    ap.add_argument('--escala', type=int, default=8, help='pontos por pixel no SVG')
    a = ap.parse_args()
    im = trim(reduce_to_grid(Image.open(a.entrada), a.celula, a.cores))
    out = Path(a.saida)
    im.save(out.with_suffix('.png'))
    svg, ncolors, nrects = to_svg(im, a.escala, out.name)
    out.with_suffix('.svg').write_text(svg, encoding='utf-8')
    print(im.size, ncolors, 'cores', nrects, 'retângulos')
