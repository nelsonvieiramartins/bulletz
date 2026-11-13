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
    ('corrida', 'gerado-corrida-v2.png', 2, 4, 129, None, 'head', 12),
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


# --- Alternância de pernas na corrida -------------------------------------------------------
# A arte gerada traz só 4 poses de perna e não distingue a perna de perto da de longe. Aqui os
# quadros 5-8 passam a ser cópias exatas dos quadros 1-4 com as pernas trocadas: a perna de perto
# fica clara e com a listra laranja, a de longe fica escurecida e sem listra.
# Polígonos e listras em coordenadas da célula (192x160), marcados sobre gerado-corrida-v2.png.
# Cada pose: (perna X, perna Y), cada perna = (polígonos, listra a desenhar se a arte não tiver).
FAR_SHADE = 0.62
LEG_POSES = [
    # pose 1 · contato: X = perna de trás (com listra na arte), Y = perna da frente
    (([[(5, 88), (64, 88), (63, 108), (60, 109), (56, 156), (5, 156)]], None),
     ([[(64, 90), (74, 92), (78, 98), (86, 98), (90, 104), (100, 112), (120, 130), (120, 156),
        (56, 156), (60, 109), (63, 108)]], [(68, 93), (79, 105), (91, 120), (98, 131)])),
    # pose 2 · apoio: X = perna levantada atrás, Y = perna apoiada (com listra na arte)
    (([[(75, 92), (84, 96), (92, 108), (90, 120), (74, 120), (74, 108)],
       [(59, 103), (60, 121), (40, 126), (28, 125), (28, 99), (45, 99)]],
      [(77, 95), (84, 104), (86, 113), None, (57, 112), (47, 113)]),
     ([[(50, 87), (75, 90), (74, 108), (74, 120), (76, 132), (86, 146), (86, 156), (55, 156),
        (57, 132), (60, 121), (59, 103), (52, 96)]], None)),
    # pose 3 · passagem: X = perna que avança dobrada (com listra na arte), Y = perna de apoio
    (([[(53, 84), (66, 86), (78, 96), (88, 108), (86, 118), (74, 122), (64, 119), (60, 122),
        (52, 127), (44, 126), (44, 103), (56, 103), (54, 95)]], None),
     ([[(57, 121), (64, 119), (70, 121), (66, 132), (68, 156), (44, 156), (44, 134), (52, 128)]],
      [(61, 122), (59, 134)])),
    # pose 4 · voo: X = joelho alto à frente (com listra na arte), Y = perna estendida atrás
    (([[(57, 84), (80, 84), (89, 90), (98, 91), (98, 101), (93, 112), (93, 130), (68, 130),
        (68, 106), (79, 99), (72, 97), (57, 96)]], None),
     ([[(55, 96), (72, 97), (74, 103), (66, 112), (56, 125), (48, 132), (48, 156), (26, 156),
        (26, 128), (46, 108), (52, 100)]], [(63, 100), (51, 113), (39, 128)])),
]
# Quem é a perna de perto em cada um dos 8 quadros: (pose, 0 = X ou 1 = Y). A mesma perna física
# segue: atrás, levantada, avançando, joelho alto | contato à frente, apoiada, apoio, estendida.
LEG_CYCLE = [(0, 0), (1, 0), (2, 0), (3, 0), (0, 1), (1, 1), (2, 1), (3, 1)]
LEG_SHEETS = {'corrida'}


def _is_stripe(c):
    c = [int(v) for v in c[:3]]
    return c[0] > 115 and c[0] > c[1] > c[2] and c[0] - c[2] > 70 and c[2] < 110


def _is_gun_tan(c):
    c = [int(v) for v in c[:3]]
    return c[0] > 150 and c[1] > 120 and c[2] > 85 and c[0] - c[2] > 25


def _leg_mask(size, polys):
    from PIL import ImageDraw
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon(poly, fill=255)
    return np.asarray(m) > 0


def _stripe_points(line):
    """Pixels de uma polilinha (None separa trechos)."""
    pts = []
    for a, b in zip(line, line[1:]):
        if a is None or b is None:
            continue
        n = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
        for i in range(n + 1):
            pts.append((round(a[0] + (b[0] - a[0]) * i / n), round(a[1] + (b[1] - a[1]) * i / n)))
    return pts


def alternate_legs(cells):
    """Devolve 8 quadros: as 4 poses dos quadros 1-4, cada uma com as duas atribuições de perna."""
    poses = [np.asarray(c).copy() for c in cells[:4]]
    stripe_cols = sorted({tuple(px[:3]) for a in poses for px in a.reshape(-1, 4) if px[3] and _is_stripe(px)},
                         key=lambda c: sum(int(v) for v in c))
    stripe_col = stripe_cols[len(stripe_cols) * 2 // 3]
    out = []
    for pose_i, near_i in LEG_CYCLE:
        a = poses[pose_i].copy()
        h, w = a.shape[:2]
        near, far = LEG_POSES[pose_i][near_i], LEG_POSES[pose_i][1 - near_i]
        far_mask = _leg_mask((w, h), far[0]) & (a[..., 3] > 0)
        near_mask = _leg_mask((w, h), near[0]) & (a[..., 3] > 0) & ~far_mask
        # perna de longe: tira a listra (usa a cor da calça ao lado) e escurece
        for y, x in zip(*np.where(far_mask)):
            c = a[y, x]
            if _is_gun_tan(c):
                continue
            if _is_stripe(c):
                for d in (1, 2, 3, 4, 5):
                    near_px = [(y, x + d), (y, x - d), (y + d, x), (y - d, x)]
                    ok = [(yy, xx) for yy, xx in near_px if 0 <= xx < w and 0 <= yy < h and far_mask[yy, xx]
                          and not _is_stripe(poses[pose_i][yy, xx]) and not _is_gun_tan(poses[pose_i][yy, xx])
                          and int(poses[pose_i][yy, xx, :3].astype(int).sum()) > 60]
                    if ok:
                        c = poses[pose_i][ok[0]]
                        break
            a[y, x, :3] = np.round(c[:3].astype(float) * FAR_SHADE)
        # perna de perto: desenha a listra se a arte não tiver
        if near[1]:
            for x, y in _stripe_points(near[1]):
                if 0 <= x < w and 0 <= y < h and near_mask[y, x] and int(a[y, x, :3].astype(int).sum()) > 45:
                    a[y, x, :3] = stripe_col
        out.append(Image.fromarray(a, 'RGBA'))
    return out


# --- Corrida atirando com as mesmas pernas da corrida ----------------------------------------
# O tronco e a arma vêm da corrida atirando; as pernas (já alternadas) vêm do mesmo quadro da
# corrida. O tronco é alinhado pela cabeça, então o balanço do corpo também é o mesmo e a troca
# entre correr e correr atirando acontece sem salto.
WAIST_BELOW_HEAD = 62
FIRE_LEG_SOURCE = {'corrida-atirando': 'corrida'}
LEG_OFFSETS = {}


def _top(c):
    a = np.asarray(c)[..., 3] > 0
    return int(np.where(a.any(axis=1))[0][0])


def legs_from(run_cells, fire_cells):
    out, offsets = [], []
    for i, (run, fire) in enumerate(zip(run_cells, fire_cells)):
        r, f = np.asarray(run), np.asarray(fire)
        h, w = r.shape[:2]
        dy = _top(run) - _top(fire)
        cut = _top(run) + WAIST_BELOW_HEAD
        pose_i = LEG_CYCLE[i][0]
        legs = _leg_mask((w, h), [poly for leg in LEG_POSES[pose_i] for poly in leg[0]])
        a = np.zeros_like(r)
        keep = legs & (np.arange(h)[:, None] >= cut) & (r[..., 3] > 0)
        a[keep] = r[keep]
        # restos da arma da corrida (carregador) sobre a coxa: pinta com a calça vizinha
        def junk(px):
            c = [int(v) for v in px[:3]]
            return _is_gun_tan(px) or (c[0] > 120 and c[1] > 100 and c[2] > 90 and max(c) - min(c) < 60)
        for y, x in zip(*np.where(keep)):
            if not junk(a[y, x]):
                continue
            for d in range(1, 9):
                cand = [(y, x - d), (y, x + d), (y + d, x)]
                ok = [(yy, xx) for yy, xx in cand if 0 <= xx < w and yy < h and keep[yy, xx] and not junk(r[yy, xx])
                      and int(r[yy, xx, 2]) > int(r[yy, xx, 0]) + 10]
                if ok:
                    a[y, x] = r[ok[0]]
                    break
        shifted = np.zeros_like(f)
        if dy >= 0:
            shifted[dy:] = f[:h - dy]
        else:
            shifted[:h + dy] = f[-dy:]
        torso = (shifted[..., 3] > 0) & (np.arange(h)[:, None] < cut + 2)
        a[torso] = shifted[torso]
        out.append(Image.fromarray(a, 'RGBA'))
        offsets.append(dy)
    return out, offsets


def build():
    pal = concept_palette()
    svg_parts, sheet_y, report = [], 0, []
    built = {}
    for name, file, rows, cols, target, ref, anchor, fps in SHEETS:
        frames = frames_of(SRC / file, rows, cols)
        heights = [m.shape[0] for _, m in frames]
        cell = (heights[ref] if ref is not None else max(heights)) / target
        cells = []
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
        if name in LEG_SHEETS:
            cells = alternate_legs(cells)
        built[name] = cells
        if name in FIRE_LEG_SOURCE:
            cells, LEG_OFFSETS[name] = legs_from(built[FIRE_LEG_SOURCE[name]], cells)
            report.append(f'  {name}: tronco deslocado {LEG_OFFSETS[name]} px na vertical')
        sheet = Image.new('RGBA', (CELL_W * cols, CELL_H * rows), (0, 0, 0, 0))
        for i, c in enumerate(cells):
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
