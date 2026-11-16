# Monta o helicóptero do Oficial de Justiça (chefe da Fase 1) a partir das artes em GRAPHIC/Boss Heli.
# Saídas em assets/boss-heli/:
#   corpo.png   folha 4x3 com as poses do Oficial na porta do helicóptero (SEM rotor principal e SEM hélice traseira), cada quadro fw x fh px
#   rotor1..5.png   rotor principal, do giro lento (pás nítidas) ao disco borrado (as artes de "Rotor Principal Sequencia")
#   cauda1..5.png   cauda com a hélice traseira, do giro lento ao disco (as artes de "Rotor Traseiro Sequencia")
#   heli.json   medidas para o jogo: tamanho do quadro, âncora e posição de cada rotor/cauda dentro do quadro
# As artes vêm em RGB com fundo preto (o corpo) e o helicóptero olha para a DIREITA. O Oficial vem das folhas de gestos (recortadas na porta aberta).
# Uso: python tools/montar_heli.py
import json
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image, ImageFilter

root = Path(__file__).resolve().parent.parent
src = root / 'GRAPHIC' / 'Boss Heli'
out = root / 'assets' / 'boss-heli'
out.mkdir(parents=True, exist_ok=True)

BODY = src / 'Open-Door Justice Helicopter.png'
GESTOS = src / 'Pixel-Art Helicopter Official Sprite Sheet.png'   # 8x2 quadros
ROTOR = src / 'Rotor Principal Sequencia.webp'                    # 5 quadros: pás nítidas -> disco borrado (2000x667, fundo preto)
CAUDA = src / 'Rotor Traseiro Sequencia.webp'                     # 5 quadros da cauda com a hélice traseira (RGBA)

# poses: índice do quadro na folha de gestos (0-7 em cima, 8-15 embaixo)
POSES = [0, 1, 3, 7, 4, 14, 15, 2, 12, 11]
# 0 parado, 1 mão aberta, 2 aponta p/ esquerda, 3 aponta p/ direita, 4 e 8 apontam p/ baixo e à esquerda, 5 e 9 apontam p/ baixo e à direita,
# 6 chama (palma) / grita, 7 reação ao tiro (mão aberta, careta)
WIDTH_UNITS = 340                   # largura do helicóptero no jogo, em unidades do mundo (a folha é em 2x)
PIXEL_SCALE = 2

def bg_key(rgb, thr=22):
    """Fundo preto ligado à borda vira transparente; o desenho fica INTEIRO por dentro (sem furos): canais escuros e contornos que
    chegam à borda não contam como fundo (só os vãos largos do fundo)."""
    a = np.asarray(rgb).astype(int)
    dark = a.max(axis=2) < thr
    lab, n = ndimage.label(dark)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    core = ndimage.binary_opening(bg, structure=np.ones((3, 3)), iterations=4)   # só o fundo "largo"
    core = ndimage.binary_propagation(core, mask=bg)                              # e o que está colado nele
    bg = ndimage.binary_dilation(core, iterations=3) & bg                         # as bordas finas voltam
    solid = ~bg
    solid = ndimage.binary_fill_holes(ndimage.binary_closing(solid, structure=np.ones((3, 3)), iterations=3))   # silhueta sem furos
    alpha = np.where(solid, 255, 0).astype(np.uint8)
    return Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), 'RGBA')

def glow_key(rgb):
    """Rotor: o brilho vira transparência suave (preto = nada)."""
    a = np.asarray(rgb).astype(float)
    alpha = np.clip((a.max(axis=2) - 10) / 60, 0, 1)
    return Image.fromarray(np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)]), 'RGBA')

# ---- corpo
body = bg_key(Image.open(BODY).convert('RGB'))
arr = np.asarray(body).copy()
H, W = arr.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
# sem pás, cubo e mastro (os quadros do rotor os substituem) e sem a cauda com a hélice (a cauda animada vem por cima)
erase = (yy < 258) | ((xx < 790) & (yy < 310)) | ((xx > 1300) & (yy < 310)) | ((xx < 300) & (yy < 700))
arr[erase] = 0
# esquis: o recorte antigo (com preto entre as pernas) sai e entra o recorte novo, feito à mão (GRAPHIC/Boss Heli/pes_helicoptero.png, mesma escala do corpo)
arr[(yy >= 684) & (xx >= 620) & (xx <= 1580)] = 0
arr[(yy >= 662) & (xx >= 1570)] = 0   # o gancho solto embaixo do nariz
# só o casco principal fica: pecinhas soltas (as caixinhas escuras sob a barriga e sob a cauda, que o recorte deixava picotadas) saem
lab, nlab = ndimage.label(arr[:, :, 3] > 0)
sizes = ndimage.sum(arr[:, :, 3] > 0, lab, range(1, nlab + 1))
arr[lab != 1 + int(np.argmax(sizes))] = 0
# bordas do casco: suaviza o serrilhado do recorte e devolve um contorno escuro fino em volta (o contorno original saía junto com o fundo)
solid = arr[:, :, 3] > 0
solid = ndimage.binary_closing(ndimage.binary_opening(solid, iterations=2), iterations=2)
edge = ndimage.binary_dilation(solid, iterations=3) & ~solid
arr[~solid & ~edge] = 0
arr[edge] = (18, 14, 28, 255)
arr[solid, 3] = 255
body = Image.fromarray(arr, 'RGBA')
FEET = src / 'pes_helicoptero.png'
FEET_POS = (642, 656)   # canto do recorte dos pés na arte do corpo (alinhado pela ponta esquerda e pela base dos esquis)
body.alpha_composite(Image.open(FEET).convert('RGBA'), FEET_POS)

# ---- Oficial na porta
gestos = Image.open(GESTOS).convert('RGB')
cw, ch = gestos.width / 8, gestos.height / 2
DOOR = (995, 380, 1257, 655)         # abertura da porta no corpo (x0, y0, x1, y1)
CELL_OPEN = (35, 22, 245, 285)       # abertura da porta na célula do gesto
CELL_BOOT = (60, 286, 120, 346)      # a bota apoiada no esqui
k = (DOOR[3] - DOOR[1]) / (CELL_OPEN[3] - CELL_OPEN[1])
def officer_layer(idx):
    c, r = idx % 8, idx // 8
    cell = gestos.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
    crop = cell.crop((CELL_OPEN[0], CELL_OPEN[1], CELL_OPEN[2], CELL_BOOT[3]))
    crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    m = np.zeros((crop.height, crop.width), np.uint8)
    ow, oh = round((CELL_OPEN[2] - CELL_OPEN[0]) * k), round((CELL_OPEN[3] - CELL_OPEN[1]) * k)
    m[:oh, :ow] = 255
    bx0, by0 = round((CELL_BOOT[0] - CELL_OPEN[0]) * k), round((CELL_BOOT[1] - CELL_OPEN[1]) * k)
    bx1 = round((CELL_BOOT[2] - CELL_OPEN[0]) * k)
    m[by0:, bx0:bx1] = 255
    mask = Image.fromarray(m, 'L').filter(ImageFilter.GaussianBlur(5))
    return crop, mask, DOOR[2] - ow, DOOR[1]

# ---- caixa do quadro e escala final
box_x0, box_y0, box_x1, box_y1 = 30, 100, 1710, 815
scale = WIDTH_UNITS * PIXEL_SCALE / (box_x1 - box_x0)
fw, fh = round((box_x1 - box_x0) * scale), round((box_y1 - box_y0) * scale)

frames = []
for idx in POSES:
    base = body.copy()
    crop, mask, ox, oy = officer_layer(idx)
    layer = crop.convert('RGBA')
    layer.putalpha(mask)
    full = Image.new('RGBA', base.size, (0, 0, 0, 0))
    full.alpha_composite(layer, (ox, oy))
    base.alpha_composite(full)
    frames.append(base.crop((box_x0, box_y0, box_x1, box_y1)).resize((fw, fh), Image.LANCZOS))
# pose extra (a última do quadro): porta FECHADA, sem o Oficial, para o helicóptero que cruza o fundo da Fase 1 depois do primeiro checkpoint.
# A porta de correr (com janela) é copiada duas vezes sobre a abertura.
closed = body.copy()
panel = body.crop((862, 378, 993, 656))
closed.alpha_composite(panel, (DOOR[0], 378))
closed.alpha_composite(panel, (DOOR[0] + 131, 378))
frames.append(closed.crop((box_x0, box_y0, box_x1, box_y1)).resize((fw, fh), Image.LANCZOS))
cols = 4
rows = -(-len(frames) // cols)
sheet = Image.new('RGBA', (fw * cols, fh * rows), (0, 0, 0, 0))
for i, f in enumerate(frames):
    sheet.alpha_composite(f, ((i % cols) * fw, (i // cols) * fh))
sheet.save(out / 'corpo.png', optimize=True)

meta = {'frame': [fw, fh], 'cols': cols, 'poses': len(frames), 'scale': scale, 'rotors': [], 'tails': []}

# ---- rotor principal: o cubo mantém a proporção da arte do corpo; só as pás são esticadas na horizontal para ter a envergadura do helicóptero
HUB_X, HUB_BASE_Y = 1060, 256        # cubo no corpo: x do eixo e base do cubo
STRETCH = 2.3
HW = 105                              # meia-largura do cubo (com as raízes das pás), preservada 1:1
rot_im = glow_key(Image.open(ROTOR).convert('RGB'))
# (x0, x1, y0, y1, x do eixo, y da base do cubo) de cada quadro, medidos na folha
RWIN = [(0, 670, 40, 275, 339, 230), (670, 1335, 40, 275, 1004, 231), (1335, 2000, 30, 275, 1672, 231),
        (100, 920, 360, 610, 507, 561), (1030, 1860, 360, 610, 1442, 561)]
def stretched(im, hub_x):
    """Esticar só as pás: o miolo (cubo) fica 1:1, o resto de cada lado é esticado na horizontal."""
    left = im.crop((0, 0, hub_x - HW, im.height))
    mid = im.crop((hub_x - HW, 0, hub_x + HW, im.height))
    right = im.crop((hub_x + HW, 0, im.width, im.height))
    lw, rw = round(left.width * STRETCH), round(right.width * STRETCH)
    new = Image.new('RGBA', (lw + mid.width + rw, im.height), (0, 0, 0, 0))
    new.alpha_composite(left.resize((lw, im.height), Image.LANCZOS), (0, 0))
    new.alpha_composite(right.resize((rw, im.height), Image.LANCZOS), (lw + mid.width, 0))
    new.alpha_composite(mid, (lw, 0))
    return new, lw + HW
for n, (x0, x1, y0, y1, hx, hb) in enumerate(RWIN, 1):
    a = np.asarray(rot_im.crop((x0, y0, x1, y1)))[:, :, 3]
    ys, xs = np.where(a > 12)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = rot_im.crop((x0 + bx0, y0 + by0, x0 + bx1, y0 + by1))
    hub_x = hx - x0 - bx0
    hub_y = hb - y0 - by0
    big, hub_cx = stretched(crop, hub_x)
    px, py = HUB_X - hub_cx, HUB_BASE_Y - hub_y     # canto do quadro do rotor na arte do corpo
    sm = big.resize((max(1, round(big.width * scale)), max(1, round(big.height * scale))), Image.LANCZOS)
    sm.save(out / f'rotor{n}.png', optimize=True)
    meta['rotors'].append({'size': list(sm.size), 'x': round((px - box_x0) * scale), 'y': round((py - box_y0) * scale)})

# ---- cauda com a hélice traseira (RGBA, 5 quadros lado a lado): alinhada ao corpo pelo farol vermelho do alto da cauda
tail = np.asarray(Image.open(CAUDA).convert('RGBA'))
body_rgb = np.asarray(Image.open(BODY).convert('RGB')).astype(int)
red_b = (body_rgb[:, :, 0] > 190) & (body_rgb[:, :, 1] < 70) & (body_rgb[:, :, 2] < 70)
by_, bx_ = np.where(red_b[:400, :400])
BEACON_BODY = (bx_.mean(), by_.mean())
TS = 0.92   # a arte da cauda é um pouco maior que a do corpo
TRUNS = [(41, 394), (428, 786), (822, 1179), (1210, 1579), (1610, 1982)]
red_t = (tail[:, :, 0] > 190) & (tail[:, :, 1] < 70) & (tail[:, :, 2] < 70) & (tail[:, :, 3] > 40)
tail_im = Image.fromarray(tail, 'RGBA')
# as 5 artes da cauda não vêm perfeitamente alinhadas entre si: o farol e o tubo da cauda mudam alguns pixels de um quadro para o outro e
# a cauda "tremia" no jogo. Cada quadro é alinhado ao primeiro pela parte que não gira (o tubo e a deriva), por correlação.
left, right = 135, 235                                # recorte relativo ao farol: do fim da hélice até o trecho do tubo da cauda
tail_f = tail.astype(float)
tail_f[:, :, :3] *= tail_f[:, :, 3:4] / 255.0         # cor ponderada pela transparência
def window(bcx, dx, dy):
    x0_, y0_ = round(bcx - left) + dx, 70 + dy
    return tail_f[y0_:y0_ + 522, x0_ + 140:x0_ + left + right]   # só a parte da direita (tubo e deriva), longe da hélice
bc0 = None
shifts = []
seams = []
for n, (x0, x1) in enumerate(TRUNS, 1):
    ty_, tx_ = np.where(red_t[:, x0 - 20:x1 + 20])
    bcx, bcy = tx_.mean() + x0 - 20, ty_.mean()       # farol deste quadro
    if bc0 is None:
        bc0 = bcx; ref = window(bcx, 0, 0); sdx = sdy = 0
    else:
        best = None
        for dy_ in range(-14, 15):
            for dx_ in range(-14, 15):
                w_ = window(bcx, dx_, dy_)
                if w_.shape != ref.shape: continue
                d_ = float(((w_ - ref) ** 2).mean())
                if best is None or d_ < best[0]: best = (d_, dx_, dy_)
        _, sdx, sdy = best
    shifts.append((sdx, sdy))
    crop = tail_im.crop((round(bcx - left) + sdx, 70 + sdy, round(bcx + right) + sdx, 592 + sdy))
    bcy = bcy - sdy   # o farol, já na posição alinhada (o quadro foi deslocado)
    cs = crop.resize((round(crop.width * TS), round(crop.height * TS)), Image.LANCZOS)
    # emenda: a ponta direita da cauda some aos poucos sobre o tubo do corpo (que continua por baixo daí em diante)
    arr_t = np.asarray(cs).astype(float)
    arr_raw = arr_t.copy()
    ramp = 60
    fade = np.clip((arr_t.shape[1] - 1 - np.arange(arr_t.shape[1])) / ramp, 0, 1)
    arr_t[:, :, 3] *= fade[None, :]
    cs = Image.fromarray(arr_t.astype(np.uint8), 'RGBA')
    bx = BEACON_BODY[0] - left * TS                   # canto do recorte na arte do corpo
    by = BEACON_BODY[1] - (bcy - 70) * TS
    # a emenda com o corpo: afina a posição (até 8 px) comparando o tubo da cauda com o do corpo na zona onde os dois existem (x 300 a 360)
    best_seam = None
    for sy_ in range(-8, 9):
        for sx_ in range(-8, 9):
            ox_, oy_ = round(bx) + sx_, round(by) + sy_
            lx0, lx1 = 300 - ox_, 360 - ox_
            if lx0 < 0 or lx1 > arr_raw.shape[1] or oy_ < 0 or oy_ + arr_raw.shape[0] > body_rgb.shape[0]: continue
            ov = arr_raw[:, lx0:lx1, :]
            bd = body_rgb[oy_:oy_ + arr_raw.shape[0], 300:360, :]
            ok_ = (ov[:, :, 3] > 200) & (bd.max(axis=2) > 40)
            if ok_.sum() < 300: continue
            d_ = float(((ov[:, :, :3][ok_] - bd[ok_]) ** 2).mean())
            if best_seam is None or d_ < best_seam[0]: best_seam = (d_, sx_, sy_)
    if best_seam:
        bx, by = round(bx) + best_seam[1], round(by) + best_seam[2]
    seams.append(best_seam[1:] if best_seam else None)
    sm = cs.resize((max(1, round(cs.width * scale)), max(1, round(cs.height * scale))), Image.LANCZOS)
    sm.save(out / f'cauda{n}.png', optimize=True)
    meta['tails'].append({'size': list(sm.size), 'x': round((bx - box_x0) * scale), 'y': round((by - box_y0) * scale)})

print('alinhamento da cauda (dx,dy) por quadro:', shifts, ' emenda com o corpo:', seams)
meta['anchor'] = [round((1060 - box_x0) * scale), fh - round((815 - 780) * scale)]
meta['door'] = [round((DOOR[0] - box_x0) * scale), round((DOOR[1] - box_y0) * scale), round((DOOR[2] - box_x0) * scale), round((DOOR[3] - box_y0) * scale)]
# ---- helicóptero destruído no chão (GRAPHIC/Boss Heli/destruido.png): mesma escala do corpo, recortado rente ao desenho
wreck = Image.open(src / 'destruido.png').convert('RGBA')
wa = np.asarray(wreck)[:, :, 3]
wy, wx = np.where(wa > 40)
wbox = (wx.min(), wy.min(), wx.max() + 1, wy.max() + 1)
wreck = wreck.crop(wbox)
wsm = wreck.resize((round(wreck.width * scale), round(wreck.height * scale)), Image.LANCZOS)
wsm.save(out / 'destruido.png', optimize=True)
# onde estão as chamas pintadas na arte (base de cada fogo, na arte original) -> o jogo põe fogo e fumaça animados em cima delas
FIRES = [(1632, 655, 20), (1332, 604, 13)]   # x, y da base e altura das chamas (unidades do jogo)
meta['wreck'] = {'size': list(wsm.size), 'fires': [[round((fx - wbox[0]) * scale), round((fy - wbox[1]) * scale), fh_] for fx, fy, fh_ in FIRES]}
(out / 'heli.json').write_text(json.dumps(meta, indent=1))
print(json.dumps(meta))

# prévia: corpo + rotor (quadro 5) + cauda (quadro 5) sobre um fundo vivo, para conferir furos
bgc = Image.new('RGBA', (fw + 60, fh + 120), (255, 80, 200, 255))
off = (30, 90)
bgc.alpha_composite(frames[0], off)
r = Image.open(out / 'rotor5.png'); m = meta['rotors'][4]
bgc.alpha_composite(r, (off[0] + m['x'], off[1] + m['y']))
t = Image.open(out / 'cauda5.png'); m = meta['tails'][4]
bgc.alpha_composite(t, (off[0] + m['x'], off[1] + m['y']))
bgc.save(out / '_previa.png')
