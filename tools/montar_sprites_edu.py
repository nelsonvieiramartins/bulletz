"""Monta as folhas de sprites do protagonista (Edu) a partir das artes geradas.

Entrada:  GRAPHIC/edu-sprites/gerado-*.png  (fundo magenta, grade irregular)
Saída em GRAPHIC/edu-sprites/:
  <animação>.png        folha em pixel art real, células de CELL_W x CELL_H, paleta do conceito
  previa-<animação>.gif prévia animada ampliada
  edu-sprites.svg       todas as folhas em vetor (um grupo por quadro, um caminho por cor)

Uso: python tools/montar_sprites_edu.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'GRAPHIC' / 'edu-sprites'
CELL_W, CELL_H = 192, 160
ANCHOR_X, FEET_Y = 80, 152     # eixo do corpo (cabeça) e linha dos pés dentro da célula
SCALE = 4                      # pontos por pixel no SVG

# nome, arquivo gerado, linhas, colunas, altura-alvo (px) do quadro de referência, índice desse quadro, âncora, fps
SHEETS = [
    ('respiracao', 'gerado-respiracao.png', 1, 4, 133, 0, 'head', 5),
    ('corrida', 'gerado-corrida.png', 2, 4, 129, None, 'head', 12),
    ('corrida-atirando', 'gerado-corrida-atirando.png', 2, 4, 129, None, 'head', 12),
    ('agachar', 'gerado-agachar.png', 1, 4, 131, 0, 'head', 3),
    ('pulo', 'gerado-pulo.png', 1, 4, 134, 1, 'head', 3),
    ('queda', 'gerado-queda.png', 1, 4, 124, 0, 'center', 6),
]


def concept_palette():
    im = Image.open(ROOT / 'GRAPHIC' / 'edu-conceito-pixel.png').convert('RGBA')
    cols = sorted({p[:3] for p in im.getdata() if p[3]})
    return np.array(cols, dtype=np.int32)


def opaque_mask(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    bright = (r > 150) & (b > 150) & (g < np.minimum(r, b) * 0.5)
    dark = (r > 90) & (b > 90) & (g < 45) & (np.abs(r - b) < 45)
    return ~(bright | dark)


def split_runs(profile, n, min_count=2):
    """Divide um perfil (contagem por coluna/linha) em n blocos usando as n-1 maiores lacunas."""
    on = np.where(profile >= min_count)[0]
    gaps = [(on[i + 1] - on[i], on[i], on[i + 1]) for i in range(len(on) - 1) if on[i + 1] - on[i] > 1]
    cuts = sorted(sorted(gaps, reverse=True)[:n - 1], key=lambda g: g[1])
    bounds, start = [], on[0]
    for _, a, b in cuts:
        bounds.append((start, a + 1))
        start = b
    bounds.append((start, on[-1] + 1))
    return bounds


def frames_of(path, rows, cols):
    a = np.asarray(Image.open(path).convert('RGB'))
    mask = opaque_mask(a)
    out = []
    for y0, y1 in split_runs(mask.sum(axis=1), rows, 6):
        for x0, x1 in split_runs(mask[y0:y1].sum(axis=0), cols):
            sub = mask[y0:y1, x0:x1]
            ys = np.where(sub.sum(axis=1) >= 2)[0]
            out.append((a[y0 + ys[0]:y0 + ys[-1] + 1, x0:x1], sub[ys[0]:ys[-1] + 1]))
    return out


def to_grid(rgb, mask, cell, pal):
    """Reduz para a grade real: cor da paleta mais votada no miolo de cada célula."""
    h, w = mask.shape
    gh, gw = max(1, round(h / cell)), max(1, round(w / cell))
    flat = rgb.reshape(-1, 3).astype(np.int32)
    idx = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2).argmin(axis=1).reshape(h, w)
    idx[~mask] = len(pal)
    out = np.zeros((gh, gw, 4), dtype=np.uint8)
    for gy in range(gh):
        y0, y1 = round(gy * h / gh), round((gy + 1) * h / gh)
        my = (y1 - y0) // 4 if y1 - y0 >= 4 else 0  # células pequenas: usa a célula inteira
        for gx in range(gw):
            x0, x1 = round(gx * w / gw), round((gx + 1) * w / gw)
            mx = (x1 - x0) // 4 if x1 - x0 >= 4 else 0
            votes = np.bincount(idx[y0 + my:y1 - my, x0 + mx:x1 - mx].ravel(), minlength=len(pal) + 1)
            solid = votes[:-1].sum()
            if solid * 2 > votes.sum():
                out[gy, gx, :3] = pal[votes[:-1].argmax()]
                out[gy, gx, 3] = 255
    return Image.fromarray(out, 'RGBA')


def head_x(im):
    a = np.asarray(im)[..., 3] > 0
    top = a[:max(1, int(a.shape[0] * 0.16))]
    xs = np.where(top.any(axis=0))[0]
    return int(round((xs[0] + xs[-1]) / 2))


def rects_by_color(im, ox, oy):
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
            rects.setdefault(c, []).append((x0 + ox, y0 + oy, x1 - x0, y - y0))
        active = new
    return rects


def build():
    pal = concept_palette()
    svg_parts, sheet_y, report = [], 0, []
    for name, file, rows, cols, target, ref, anchor, fps in SHEETS:
        frames = frames_of(SRC / file, rows, cols)
        heights = [m.shape[0] for _, m in frames]
        cell = (heights[ref] if ref is not None else max(heights)) / target
        cells, sheet = [], Image.new('RGBA', (CELL_W * cols, CELL_H * rows), (0, 0, 0, 0))
        for i, (rgb, mask) in enumerate(frames):
            g = to_grid(rgb, mask, cell, pal)
            box = g.getbbox()
            g = g.crop(box)
            ax = head_x(g) if anchor == 'head' else g.width // 2
            x, y = ANCHOR_X - ax, FEET_Y - g.height
            if anchor == 'center':
                x = CELL_W // 2 - ax
            if x < 0 or y < 0 or x + g.width > CELL_W:
                report.append(f'  ! {name} quadro {i + 1} não coube na célula ({g.size}, x={x}, y={y})')
            c = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
            c.alpha_composite(g, (max(0, x), max(0, y)))
            cells.append(c)
            cx, cy = (i % cols) * CELL_W, (i // cols) * CELL_H
            sheet.alpha_composite(c, (cx, cy))
            paths = ''.join(
                f'<path fill="#{k[0]:02x}{k[1]:02x}{k[2]:02x}" d="'
                + ''.join(f'M{rx * SCALE} {ry * SCALE}h{rw * SCALE}v{rh * SCALE}h{-rw * SCALE}z' for rx, ry, rw, rh in rs)
                + '"/>' for k, rs in sorted(rects_by_color(c, cx, cy + sheet_y).items()))
            svg_parts.append(f'<g id="{name}-{i + 1}">{paths}</g>')
        sheet.save(SRC / f'{name}.png')
        bg = (58, 56, 82, 255)
        gif = []
        for c in cells:
            f = Image.new('RGBA', c.size, bg)
            f.alpha_composite(c)
            gif.append(f.resize((CELL_W * 3, CELL_H * 3), Image.NEAREST).convert('P', palette=Image.ADAPTIVE))
        gif[0].save(SRC / f'previa-{name}.gif', save_all=True, append_images=gif[1:], duration=int(1000 / fps), loop=0)
        report.append(f'{name}: {len(frames)} quadros, alturas {[c.getbbox()[3] - c.getbbox()[1] for c in cells]}')
        sheet_y += CELL_H * rows
    w, h = CELL_W * 4 * SCALE, sheet_y * SCALE
    (SRC / 'edu-sprites.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
        f'shape-rendering="crispEdges">\n' + '\n'.join(svg_parts) + '\n</svg>\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    print('\n'.join(build()))
