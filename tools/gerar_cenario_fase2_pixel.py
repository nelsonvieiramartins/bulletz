"""Fase 2 · Refinaria da Pensão em pixel art vetorial.

Desenha a cena numa grade de 640x270 (mesma resolução de assets/cidade.webp), sem
anti-aliasing e com dithering, e converte os pixels em retângulos vetoriais (4pt por pixel).

Uso: python tools/gerar_cenario_fase2_pixel.py
Saída: GRAPHIC/fase2-refinaria-pixel.svg (vetor em camadas) e GRAPHIC/fase2-refinaria-pixel.png (640x270)
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw

W, H, S = 640, 270, 4
G = 226  # linha do chão
rnd = random.Random(1987)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

SKY = ['#040818', '#071229', '#0a1d3a', '#0d2c4a', '#124457', '#1b6062', '#3a8a70', '#7fbf78', '#cfe07a', '#e8ee9a']
SKY_Y = [0, 28, 54, 80, 104, 128, 150, 168, 184, 200]
HAZE, HAZE_HI = '#2a7068', '#3a8a78'
FAR, FAR_HI, FAR_DK = '#0d3046', '#164a63', '#0a2538'
BACK, BACK_HI, BACK_HI2, BACK_DK = '#0a2233', '#14405a', '#1f5a72', '#06141f'
MID, MID_HI, MID_HI2, MID_DK = '#071826', '#103347', '#1a4a5e', '#040f19'
FRONT, FRONT_HI = '#030a12', '#0b1f2d'
LIT, LIT_HI, LIT_DIM = '#c8f36a', '#edffb0', '#2f7f7a'
HOT, HOT_HI, HOT_DK = '#ff9a3c', '#ffe08a', '#b85a22'
ALERT, ALERT_HI = '#e2533f', '#ff9a80'


def bay(x, y):
    return (BAYER[y % 4][x % 4] + 0.5) / 16


def rgba(c):
    return ImageColor.getrgb(c) + (255,)


class Layer:
    def __init__(self, name):
        self.name = name
        self.im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.px = self.im.load()

    def rect(self, x, y, w, h, c):
        if w > 0 and h > 0:
            self.d.rectangle([int(x), int(y), int(x + w - 1), int(y + h - 1)], fill=c)

    def dot(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H:
            self.px[x, y] = rgba(c)

    def on(self, x, y):
        return 0 <= x < W and 0 <= y < H and self.px[x, y][3] > 0

    def line(self, x1, y1, x2, y2, c, w=1):
        self.d.line([int(x1), int(y1), int(x2), int(y2)], fill=c, width=w)

    def poly(self, pts, c):
        self.d.polygon([(int(x), int(y)) for x, y in pts], fill=c)

    def dither(self, x, y, w, h, c, density, only_on=True):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if bay(xx, yy) < density and (not only_on or self.on(xx, yy)):
                    self.dot(xx, yy, c)

    def disk(self, cx, cy, r, c, density=1.0, only_on=False, falloff=False):
        for yy in range(int(cy - r), int(cy + r) + 1):
            for xx in range(int(cx - r), int(cx + r) + 1):
                dist = math.hypot(xx - cx, yy - cy)
                if dist > r:
                    continue
                dens = density * (1 - dist / r) if falloff else density
                if bay(xx, yy) < dens and (not only_on or self.on(xx, yy)):
                    self.dot(xx, yy, c)

    def ring(self, cx, cy, r, c):
        self.d.ellipse([int(cx - r), int(cy - r), int(cx + r), int(cy + r)], outline=c)

    def truss(self, x, y0, y1, w, c):
        self.line(x, y0, x, y1, c)
        self.line(x + w, y0, x + w, y1, c)
        y, flip = y0, False
        while y < y1:
            y2 = min(y + w, y1)
            a, b = (x, x + w) if flip else (x + w, x)
            self.line(a, y, b, y2, c)
            self.line(x, y, x + w, y, c)
            y, flip = y2, not flip

    def glow_light(self, x, y, c=ALERT, hi=ALERT_HI, r=5):
        self.disk(x, y, r, c, 0.8, falloff=True)
        self.rect(x - 1, y - 1, 2, 2, hi)


# ------------------------------------------------------------------ céu
def sky():
    L = Layer('ceu')
    for y in range(H):
        i = max(k for k in range(len(SKY_Y)) if SKY_Y[k] <= y)
        nxt = SKY_Y[i + 1] if i + 1 < len(SKY_Y) else 10 ** 6
        for x in range(W):
            c = SKY[i]
            d_next, d_prev = nxt - y, y - SKY_Y[i]
            if d_next <= 9 and bay(x, y) < (9 - d_next) / 9 * 0.5:
                c = SKY[i + 1]
            elif i > 0 and d_prev < 9 and bay(x + 2, y + 2) < (9 - d_prev) / 9 * 0.5:
                c = SKY[i - 1]
            L.px[x, y] = rgba(c)
    for _ in range(190):
        x, y = rnd.randrange(W), rnd.randrange(150)
        p = rnd.random()
        if p < 0.06:
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                L.dot(x + dx, y + dy, '#d9f5e4' if (dx, dy) == (0, 0) else '#7fb7a8')
        else:
            L.dot(x, y, '#d9f5e4' if p > 0.55 and y < 100 else '#5f9c96')
    return L


def moon():
    L = Layer('lua')
    cx, cy, r = 483, 62, 29
    L.disk(cx, cy, 58, '#1b6062', 0.55, falloff=True)
    L.disk(cx, cy, 44, '#3a8a70', 0.45, falloff=True)
    for yy in range(cy - r, cy + r + 1):
        for xx in range(cx - r, cx + r + 1):
            d = math.hypot(xx - cx, yy - cy)
            if d > r:
                continue
            d2 = math.hypot(xx - (cx + 9), yy - (cy - 7))
            c = '#e6f6c9'
            if d2 > r + 3 or (d2 > r - 3 and bay(xx, yy) < 0.5):
                c = '#b9d9a6'
            if d2 > r + 12 and bay(xx, yy) < 0.5:
                c = '#93bd92'
            L.dot(xx, yy, c)
    for dx, dy, cr in [(-9, -8, 5), (8, 5, 7), (-2, 14, 3), (13, -12, 3), (-15, 7, 2), (2, -17, 2)]:
        L.disk(cx + dx, cy + dy, cr, '#a9cc9a', only_on=True)
        for a in range(20, 110, 8):
            L.dot(cx + dx + cr * math.cos(math.radians(a)), cy + dy + cr * math.sin(math.radians(a)), '#86ae88')
    return L


def clouds():
    L = Layer('nuvens')
    specs = [(90, 48, 150, '#0f2c46', '#1a4460'), (295, 30, 130, '#0c2440', '#173a58'),
             (575, 104, 140, '#16505a', '#27706f'), (205, 104, 190, '#144857', '#226a6c'),
             (390, 130, 220, '#1f6468', '#37877a'), (40, 140, 130, '#236c6c', '#3f9480'),
             (535, 152, 170, '#327f72', '#5fae7a')]
    hi = {}
    for cx, cy, w, c, h in specs:
        hi[rgba(c)] = h
        L.rect(cx - w // 2, cy, w, 4, c)
        L.rect(cx - w // 2 + 6, cy + 4, w - 12, 2, c)
        x = cx - w // 2 + 4
        while x < cx + w // 2 - 12:
            lw = rnd.randint(12, 30)
            t = 1 - abs((x + lw / 2 - cx) / (w / 2))
            lh = int(2 + t * rnd.randint(4, 9))
            L.rect(x, cy - lh, lw, lh, c)
            if lw > 16:
                L.rect(x + 4, cy - lh - 2, lw - 9, 2, c)
            x += lw - rnd.randint(2, 6)
        L.dither(cx - w // 2 - 8, cy + 1, 8, 2, c, 0.5, only_on=False)
        L.dither(cx + w // 2, cy + 1, 8, 2, c, 0.5, only_on=False)
    for y in range(1, H):
        for x in range(W):
            p = L.px[x, y]
            if p[3] and p in hi and not L.px[x, y - 1][3]:
                L.px[x, y] = rgba(hi[p])
    return L


# ------------------------------------------------------------------ skyline
def skyline():
    L = Layer('skyline-distante')
    # fileira enevoada, mais clara, bem ao fundo
    x = -6
    while x < W:
        w, h = rnd.randint(10, 26), rnd.randint(30, 78)
        top = 214 - h
        L.rect(x, top, w, h + 14, HAZE)
        L.rect(x, top, 1, h, HAZE_HI)
        if rnd.random() < 0.4:
            L.rect(x + w // 2, top - rnd.randint(6, 16), 1, 16, HAZE)
        if rnd.random() < 0.3:
            L.rect(x + 2, top - 4, w - 4, 4, HAZE)
        x += w + rnd.randint(0, 5)
    # fileira próxima
    x = -8
    while x < W:
        w, h = rnd.randint(14, 34), rnd.randint(34, 98)
        top = 216 - h
        body = rnd.choice([FAR, FAR, FAR_DK])
        L.rect(x, top, w, h + 12, body)
        L.rect(x, top, 1, h, FAR_HI)
        L.rect(x + w - 2, top, 2, h, FAR_DK)
        L.rect(x, top, w, 1, FAR_HI)
        kind = rnd.random()
        if kind < 0.25:
            L.rect(x + 3, top - 8, w - 6, 8, body)
            L.rect(x + 3, top - 8, w - 6, 1, FAR_HI)
            L.rect(x + w // 2, top - 22, 1, 14, body)
            L.dot(x + w // 2, top - 23, ALERT)
        elif kind < 0.45:
            for i in range(w // 2):
                L.rect(x + i, top - i, w - 2 * i, 1, body)
        elif kind < 0.6:  # caixa d'água
            L.rect(x + 3, top - 9, 9, 6, body)
            L.rect(x + 4, top - 3, 1, 3, body)
            L.rect(x + 10, top - 3, 1, 3, body)
            L.rect(x + 3, top - 10, 9, 1, FAR_HI)
        elif kind < 0.8:
            L.rect(x + w - 5, top - rnd.randint(8, 20), 1, 20, body)
        for wy in range(top + 4, 214, 6):
            for wx in range(x + 3, x + w - 4, 5):
                p = rnd.random()
                if p > 0.52:
                    L.rect(wx, wy, 2, 3, LIT if p > 0.9 else LIT_DIM)
                    if p > 0.9:
                        L.dot(wx, wy, LIT_HI)
        x += w + rnd.randint(-2, 6)
    return L


# ------------------------------------------------------------------ refinaria ao fundo
def vapor(L, x, y):
    puffs = []
    r = 7.0
    for _ in range(10):
        puffs.append((x, y, r))
        x += rnd.uniform(6, 13)
        y -= rnd.uniform(8, 13)
        r += rnd.uniform(1.5, 3.2)
    n = len(puffs)
    for i, (px_, py_, pr) in enumerate(puffs):
        L.disk(px_, py_, pr, '#1f5f66', 1.0 if i < n - 4 else (0.75 if i < n - 2 else 0.5))
    for i, (px_, py_, pr) in enumerate(puffs[:-2]):
        L.disk(px_ - pr * 0.25, py_ - pr * 0.3, pr * 0.62, '#2f8580', 1.0 if i < n - 5 else 0.5, only_on=True)
    for i, (px_, py_, pr) in enumerate(puffs[:-4]):
        L.disk(px_ - pr * 0.4, py_ - pr * 0.45, pr * 0.3, '#58a89a', only_on=True)
    for px_, py_, pr in puffs[:-3]:
        L.disk(px_ + pr * 0.35, py_ + pr * 0.4, pr * 0.5, '#174a55', 0.5, only_on=True)


def cooling_tower(L, cx, bw, h):
    base, top = G - 4, G - 4 - h
    tw, waist = bw * 0.36, bw * 0.30
    vapor(L, cx, top - 4)
    for y in range(top, base + 6):
        t = min((y - top) / h, 1)
        if t < 0.3:
            hw = waist + (tw - waist) * ((0.3 - t) / 0.3) ** 2
        else:
            hw = waist + (bw / 2 - waist) * ((t - 0.3) / 0.7) ** 2
        hw = int(round(hw))
        x0 = cx - hw
        L.rect(x0, y, 2 * hw, 1, BACK)
        band = max(3, hw // 4)
        L.rect(x0 + 2, y, band, 1, BACK_HI)
        L.dither(x0 + 2 + band, y, 5, 1, BACK_HI, 0.5)
        L.dot(x0, y, BACK_HI2 if y % 2 else BACK_HI)
        L.rect(cx + hw - 3, y, 3, 1, BACK_DK)
        L.dither(cx + hw - 8, y, 5, 1, BACK_DK, 0.5)
        if (y - top) % 13 == 12:
            L.dither(x0, y, 2 * hw, 1, BACK_DK, 0.6)
    tw = int(tw)
    L.rect(cx - tw, top, 2 * tw, 2, BACK_HI2)
    L.rect(cx - tw + 3, top, 2 * tw - 6, 1, BACK_DK)
    # arcos na base
    for ax in range(cx - bw // 2 + 6, cx + bw // 2 - 8, 9):
        L.rect(ax, base - 6, 5, 8, BACK_DK)
        L.dot(ax, base - 6, BACK)
        L.dot(ax + 4, base - 6, BACK)


def chimney(L, x, h, w=8):
    top = G - 6 - h
    L.rect(x, top, w, h + 8, BACK)
    L.rect(x - 1, top + h // 2, w + 2, h // 2 + 8, BACK)
    L.rect(x, top, 2, h + 8, BACK_HI)
    L.rect(x + w - 2, top, 2, h + 8, BACK_DK)
    for sy in (6, 17):
        L.rect(x, top + sy, w, 5, ALERT)
        L.rect(x, top + sy, 2, 5, ALERT_HI)
        L.rect(x + w - 2, top + sy, 2, 5, '#9c3328')
    L.rect(x - 1, top - 2, w + 2, 2, BACK_HI2)
    for ry in range(top + 30, G - 10, 14):
        L.rect(x - 1, ry, w + 2, 1, BACK_HI)
    L.rect(x + w // 2, top - 6, 1, 4, BACK_HI)
    L.glow_light(x + w // 2, top - 7)


def sphere_tank(L, cx, r):
    cy = G - 14 - r
    for dx in (-r + 5, -5, 5, r - 5):
        L.line(cx + dx, cy + r // 2, cx + int(dx * 1.15), G, BACK)
    L.line(cx - r + 5, G - 8, cx + r - 5, G - 8, BACK)
    for yy in range(cy - r, cy + r + 1):
        for xx in range(cx - r, cx + r + 1):
            d = math.hypot(xx - cx, yy - cy)
            if d > r:
                continue
            dh = math.hypot(xx - (cx - r * 0.35), yy - (cy - r * 0.35))
            c = BACK
            if dh < r * 0.45 or (dh < r * 0.7 and bay(xx, yy) < 0.5):
                c = BACK_HI
            if dh < r * 0.18:
                c = BACK_HI2
            if dh > r * 1.15 and bay(xx, yy) < 0.5:
                c = BACK_DK
            if dh > r * 1.3:
                c = BACK_DK
            L.dot(xx, yy, c)
    L.rect(cx - r, cy, 2 * r + 1, 1, BACK_DK)
    L.rect(cx - r, cy - 1, 2 * r + 1, 1, BACK_HI)
    L.rect(cx - 1, cy - r - 4, 3, 4, BACK_HI)
    # escada em espiral
    for i in range(0, r, 2):
        L.dot(cx + r - 3 - i // 2, cy - r + 6 + i * 2, BACK_HI2)


def column(L, x, w, h):
    top = G - 6 - h
    L.rect(x, top + 2, w, h + 6, BACK)
    L.rect(x + 1, top + 1, w - 2, 1, BACK)
    L.rect(x + 2, top, w - 4, 1, BACK)
    L.rect(x + 1, top + 3, 2, h, BACK_HI)
    L.dither(x + 3, top + 3, 2, h, BACK_HI, 0.5)
    L.rect(x + w - 2, top + 3, 2, h, BACK_DK)
    for y in range(top + 12, G - 14, 17):
        L.rect(x - 3, y, w + 6, 1, BACK_HI2)
        L.rect(x - 3, y + 1, w + 6, 1, BACK_DK)
        for px_ in (x - 3, x - 1, x + w, x + w + 2):
            L.rect(px_, y - 4, 1, 4, BACK_HI)
        L.rect(x - 3, y - 4, 3, 1, BACK_HI)
        L.rect(x + w, y - 4, 3, 1, BACK_HI)
    L.rect(x + w // 2, top - 10, 1, 10, BACK_HI)
    L.dot(x + w // 2, top - 11, ALERT_HI)
    # tubo lateral
    L.rect(x + w + 3, top + 14, 1, h - 10, BACK)


def flare(L, x, h):
    top = G - h
    fx, fy = x + 5, top - 14
    L.disk(fx, fy - 18, 54, HOT_DK, 0.5, falloff=True)
    L.disk(fx, fy - 18, 34, HOT, 0.55, falloff=True)
    L.truss(x, top, G, 10, BACK_HI)
    L.rect(x - 2, top + 40, 15, 1, BACK_HI2)
    L.rect(x - 2, top + 100, 15, 1, BACK_HI2)
    L.rect(x + 3, top - 14, 5, 16, BACK)
    L.rect(x + 3, top - 14, 1, 16, HOT_DK)
    L.rect(x + 2, top - 15, 7, 2, BACK_HI2)
    L.poly([(fx - 1, fy), (fx - 8, fy - 10), (fx - 9, fy - 20), (fx - 5, fy - 32), (fx + 1, fy - 48),
            (fx + 3, fy - 36), (fx + 9, fy - 24), (fx + 9, fy - 12), (fx + 2, fy)], HOT)
    L.poly([(fx, fy), (fx - 5, fy - 8), (fx - 5, fy - 18), (fx, fy - 32), (fx + 5, fy - 18), (fx + 5, fy - 8)], HOT_HI)
    L.poly([(fx, fy), (fx - 2, fy - 6), (fx, fy - 15), (fx + 2, fy - 6)], '#fff8dc')
    for dx, dy, c in [(-6, -40, HOT), (5, -52, HOT_HI), (9, -44, HOT), (-3, -56, HOT), (12, -34, HOT_DK), (2, -62, HOT_DK)]:
        L.dot(fx + dx, fy + dy, c)


def refinery_back():
    L = Layer('refinaria-fundo')
    cooling_tower(L, 82, 76, 100)
    cooling_tower(L, 153, 62, 82)
    cooling_tower(L, 568, 70, 92)
    chimney(L, 28, 128)
    chimney(L, 204, 150, 9)
    chimney(L, 458, 116)
    chimney(L, 620, 140, 9)
    for cx in (240, 278, 316):
        sphere_tank(L, cx, 18)
    L.rect(222, G - 34, 112, 1, BACK_HI)  # passarela entre as esferas
    for px_ in range(222, 334, 6):
        L.rect(px_, G - 38, 1, 4, BACK_HI)
    L.rect(222, G - 38, 112, 1, BACK_HI)
    flare(L, 352, 160)
    for x, w, h in [(390, 13, 110), (410, 11, 85), (428, 15, 126), (503, 12, 98), (520, 10, 74)]:
        column(L, x, w, h)
    # cabos em catenária entre as chaminés e a tocha
    for xa, ya, xb, yb, sag in [(212, 72, 357, 70, 22), (357, 70, 462, 108, 14), (32, 96, 208, 72, 26)]:
        for xx in range(xa, xb):
            t = (xx - xa) / (xb - xa)
            yy = ya + (yb - ya) * t + sag * 4 * t * (1 - t)
            if not L.on(xx, int(yy)):
                L.dot(xx, yy, BACK)
    L.rect(0, G - 10, W, 20, BACK)
    L.rect(0, G - 10, W, 1, BACK_HI)
    L.dither(0, G - 9, W, 2, BACK_HI, 0.25)
    return L


# ------------------------------------------------------------------ plano médio
def window(L, x, y, w, h, lit, on_c=LIT, on_hi=LIT_HI):
    if lit:
        L.rect(x, y, w, h, on_c)
        L.rect(x, y, w, 1, on_hi)
        L.dither(x, y + h - 3, w, 3, HOT_DK if on_c == HOT else LIT_DIM, 0.4)
    else:
        L.rect(x, y, w, h, MID_HI)
        L.dither(x, y, w, h // 2, MID_HI2, 0.3)
    L.rect(x + w // 2, y, 1, h, MID)
    L.rect(x, y + h // 2, w, 1, MID)


def factory(L, x, w):
    top = 180
    L.rect(x, top, w, G - top, MID)
    L.dither(x, top, w, G - top, MID_HI, 0.07)
    n = 4
    tw = w // n
    for i in range(n):
        a = x + i * tw
        for k in range(16):
            L.rect(a, top - 16 + k, max(1, int((k + 1) * tw / 16)), 1, MID)
        for k in range(3, 15):
            ww = int((k - 2) * tw / 16 * 0.62)
            L.rect(a + 2, top - 16 + k, ww, 1, LIT)
        L.rect(a + 2, top - 3, int(tw * 0.5), 1, LIT_DIM)
        for mx in range(a + 6, a + int(tw * 0.5), 5):
            L.rect(mx, top - 12, 1, 12, MID)
        L.rect(a, top - 16, 1, 16, MID_HI2)
    L.rect(x, top, w, 1, MID_HI2)
    for i in range((w - 8) // 12):
        window(L, x + 5 + i * 12, top + 10, 7, 11, rnd.random() > 0.3)
    L.rect(x, top + 27, w, 2, MID_HI)
    L.rect(x, top + 29, w, 1, MID_DK)
    dx = x + int(w * 0.42)
    L.rect(dx, top + 32, 18, G - top - 32, MID_DK)
    L.rect(dx, top + 32, 18, 1, MID_HI2)
    for sy in range(top + 35, G, 3):
        L.rect(dx + 1, sy, 16, 1, MID)
    L.rect(dx + 8, top + 29, 3, 2, HOT_HI)
    L.disk(dx + 9, top + 33, 6, HOT, 0.35, only_on=True, falloff=True)
    # dutos e exaustor no telhado
    L.rect(x + w - 16, top - 30, 6, 30, MID)
    L.rect(x + w - 16, top - 30, 1, 30, MID_HI2)
    L.rect(x + w - 17, top - 31, 8, 2, MID_HI)
    for i, (dx2, dy2, r) in enumerate([(-12, -37, 3), (-8, -44, 4), (-2, -52, 5), (6, -59, 6)]):
        L.disk(x + w + dx2, top + dy2, r, '#2f8580', 0.8 - i * 0.15)
    # tubo descendo pela parede
    L.rect(x + 3, top + 30, 2, G - top - 30, MID_HI)
    L.rect(x + 2, top + 44, 4, 2, MID_HI2)


def tank(L, x, w, h):
    top = G - h
    L.rect(x, top, w, h, MID)
    for k in range(6):
        inset = [10, 6, 4, 2, 1, 0][k]
        L.rect(x + inset, top - 6 + k, w - 2 * inset, 1, MID)
        L.dot(x + inset, top - 6 + k, MID_HI2)
    L.rect(x + 2, top, 4, h, MID_HI)
    L.dither(x + 6, top, 4, h, MID_HI, 0.5)
    L.rect(x + 2, top, 1, h, MID_HI2)
    L.rect(x + w - 4, top, 4, h, MID_DK)
    L.dither(x + w - 8, top, 4, h, MID_DK, 0.5)
    for hy in (int(h * 0.28), int(h * 0.6), h - 6):
        L.rect(x, top + hy, w, 1, MID_HI2)
        L.rect(x, top + hy + 1, w, 1, MID_DK)
    for rx in range(x + 4, x + w - 2, 4):  # rebites
        L.dot(rx, top + 3, MID_HI2)
    lx = x + w - 12
    L.rect(lx, top - 10, 1, h + 10, MID_HI2)
    L.rect(lx + 4, top - 10, 1, h + 10, MID_HI2)
    for y in range(top - 8, G, 3):
        L.rect(lx, y, 5, 1, MID_HI2)
    for px_ in range(x + 2, lx, 5):  # guarda-corpo
        L.rect(px_, top - 11, 1, 5, MID_HI)
    L.rect(x + 2, top - 11, lx - x, 1, MID_HI)
    sx, sy = x + w // 2 - 4, top + int(h * 0.42)
    for k in range(9):  # placa de perigo
        L.rect(sx - k // 2 - 1, sy + k, k + 3 - (k % 2), 1, HOT)
    L.rect(sx, sy + 3, 1, 3, MID_DK)
    L.dot(sx, sy + 7, MID_DK)


def pipe_rack(L, x1, x2):
    for x in range(x1, x2, 47):
        L.truss(x, 186, G, 8, MID_HI)
        L.rect(x - 1, 185, 11, 1, MID_HI2)
    for y, th in ((184, 6), (193, 4), (199, 4)):
        L.rect(x1 - 6, y, x2 - x1 + 18, th, MID)
        L.rect(x1 - 6, y, x2 - x1 + 18, 1, MID_HI2)
        L.rect(x1 - 6, y + 1, x2 - x1 + 18, 1, MID_HI)
        L.rect(x1 - 6, y + th - 1, x2 - x1 + 18, 1, MID_DK)
        for x in range(x1 + 14, x2, 37):
            L.rect(x, y - 1, 3, th + 2, MID_HI)
            L.rect(x, y - 1, 1, th + 2, MID_HI2)
    # curva de expansão
    L.rect(x1 + 60, 170, 4, 14, MID)
    L.rect(x1 + 60, 170, 24, 4, MID)
    L.rect(x1 + 80, 170, 4, 14, MID)
    L.rect(x1 + 60, 170, 24, 1, MID_HI2)
    L.rect(x1 + 60, 170, 1, 14, MID_HI2)
    # volante de válvula
    vx = x1 + 112
    L.rect(vx, 176, 1, 8, MID_HI2)
    L.ring(vx, 174, 5, ALERT)
    L.rect(vx - 4, 174, 9, 1, ALERT)
    L.rect(vx, 170, 1, 9, ALERT)
    L.dot(vx, 174, ALERT_HI)
    # vazamento de vapor
    for i, (dx, dy, r) in enumerate([(30, 180, 2), (34, 175, 3), (39, 169, 4)]):
        L.disk(x1 + dx, dy, r, '#2f8580', 0.7 - i * 0.15)
    # manômetros
    for gx in (x1 + 20, x2 - 22):
        L.rect(gx, 180, 1, 4, MID_HI2)
        L.disk(gx, 178, 2, LIT_HI)
        L.dot(gx, 178, MID_DK)


def billboard(L, x, y, w, h):
    for lx in (x + 14, x + w - 22):
        L.truss(lx, y + h + 6, G, 8, MID_HI)
    L.rect(x - 4, y + h + 3, w + 8, 2, MID_HI)  # passarela de manutenção
    L.rect(x - 4, y + h + 5, w + 8, 1, MID_DK)
    for px_ in range(x - 4, x + w + 5, 6):
        L.rect(px_, y + h - 2, 1, 5, MID_HI)
    L.rect(x - 3, y - 3, w + 6, h + 6, MID)
    L.rect(x - 3, y - 3, w + 6, 1, MID_HI2)
    L.rect(x - 3, y - 3, 1, h + 6, MID_HI2)
    L.rect(x, y, w, h, '#0b2433')
    L.dither(x, y, w, h, '#123a4a', 0.25)
    L.d.rectangle([x, y, x + w - 1, y + h - 1], outline=LIT_DIM)
    bx = x + 6
    while bx < x + w - 8:
        bw = rnd.choice([1, 1, 2, 3, 5])
        L.rect(bx, y + 5, bw, h - 15, LIT)
        L.rect(bx, y + 5, bw, 1, LIT_HI)
        L.dither(bx, y + h - 14, bw, 4, LIT_DIM, 0.5)
        bx += bw + rnd.choice([1, 2, 2, 3, 4])
    for i in range(14):  # linha digitável
        if i % 5 != 4:
            L.rect(x + 7 + i * 6, y + h - 7, 4, 3, LIT)
    for i in range(5):  # refletores
        lx = x + 8 + i * (w - 16) // 4
        L.rect(lx, y - 8, 1, 5, MID_HI)
        L.rect(lx - 1, y - 9, 3, 2, HOT_HI)
        L.dither(lx - 3, y - 3, 7, 5, LIT_DIM, 0.3)
    for k in range(4):  # cantos piscando em vermelho
        L.dot(x - 3 + (k % 2) * (w + 5), y - 3 + (k // 2) * (h + 5), ALERT_HI)


def control_building(L, x):
    top = 162
    w = W - x
    L.rect(x, top, w, G - top, MID)
    L.dither(x, top, w, G - top, MID_HI, 0.06)
    L.rect(x - 3, top - 3, w + 3, 3, MID_HI)
    L.rect(x - 3, top - 3, w + 3, 1, MID_HI2)
    L.rect(x, top, w, 1, MID_DK)
    L.rect(x + 15, top - 20, 38, 17, MID)
    L.rect(x + 15, top - 20, 38, 1, MID_HI2)
    L.rect(x + 15, top - 20, 1, 17, MID_HI2)
    for vx in range(x + 19, x + 50, 4):
        L.rect(vx, top - 15, 2, 8, MID_DK)
    for r in range(3):
        for c in range(w // 18):
            wx, wy = x + 6 + c * 18, top + 7 + r * 18
            lit = rnd.random() > 0.42
            window(L, wx, wy, 12, 10, lit, HOT, HOT_HI)
            L.rect(wx - 1, wy + 10, 14, 1, MID_HI2)
            if not lit and rnd.random() < 0.4:  # ar-condicionado
                L.rect(wx + 2, wy + 11, 8, 4, MID_HI)
                L.rect(wx + 3, wy + 12, 6, 1, MID_DK)
    L.rect(x + 2, top + 2, 2, G - top - 2, MID_HI)  # calha
    L.rect(x + 1, top + 30, 4, 1, MID_HI2)
    # porta com escada
    px_ = x + 60
    L.rect(px_, G - 22, 12, 22, MID_DK)
    L.rect(px_, G - 22, 12, 1, MID_HI2)
    L.rect(px_ + 5, G - 25, 3, 2, HOT_HI)
    L.dot(px_ + 9, G - 11, HOT)
    for k in range(4):
        L.rect(px_ - 2 - k * 2, G - 4 + k, 16 + k * 4, 1, MID_HI)
    # antena parabólica
    ax, ay = x + 84, top - 18
    L.rect(ax, ay + 4, 2, 12, MID_HI)
    L.rect(ax - 3, ay + 15, 8, 1, MID_HI2)
    for k in range(15):
        ang = math.radians(200 + k * 9)
        for rr in (13, 14):
            L.dot(ax + 10 + rr * math.cos(ang), ay - 2 - rr * math.sin(ang) * -1 - 6, MID_HI2)
    L.poly([(ax - 3, ay - 12), (ax + 2, ay + 5), (ax + 14, ay + 6), (ax + 1, ay + 1)], MID_HI)
    L.line(ax + 2, ay + 2, ax + 12, ay - 9, MID_HI2)
    L.rect(ax + 12, ay - 10, 2, 2, ALERT_HI)
    # torre de antena
    tx = x + 27
    L.truss(tx, top - 92, top - 20, 8, MID_HI)
    L.rect(tx + 4, top - 104, 1, 12, MID_HI2)
    L.rect(tx - 4, top - 80, 17, 1, MID_HI2)
    L.rect(tx - 2, top - 62, 13, 1, MID_HI2)
    L.rect(tx - 6, top - 84, 3, 5, MID_HI)
    L.rect(tx + 12, top - 84, 3, 5, MID_HI)
    L.glow_light(tx + 4, top - 105, r=6)


def ground(L):
    bands = [('#0e2c3d', 0), ('#0a2231', 8), ('#071826', 22)]
    for y in range(G, H):
        d = y - G
        i = max(k for k in range(3) if bands[k][1] <= d)
        nxt = bands[i + 1][1] if i < 2 else 999
        for x in range(W):
            c = bands[i][0]
            if nxt - d <= 4 and bay(x, y) < (4 - (nxt - d)) / 4 * 0.5 + 0.12:
                c = bands[i + 1][0]
            L.px[x, y] = rgba(c)
    L.rect(0, G, W, 1, BACK_HI)
    L.dither(0, G + 1, W, 1, BACK_HI, 0.5, only_on=False)
    # placas de concreto e rachaduras
    for x in range(22, W, 58):
        L.rect(x, G + 1, 1, 7, MID)
    for _ in range(40):
        x, y = rnd.randrange(W), rnd.randrange(G + 3, G + 20)
        L.rect(x, y, rnd.randint(2, 6), 1, MID)
    # poças tóxicas com reflexo
    for cx, w, c, chi in [(75, 60, LIT_DIM, LIT), (280, 90, LIT_DIM, LIT), (457, 80, LIT_DIM, LIT),
                          (585, 70, HOT_DK, HOT)]:
        for row, shrink in enumerate([10, 3, 0, 4, 12]):
            y = G + 9 + row
            L.rect(cx - w // 2 + shrink, y, w - 2 * shrink, 1, '#0c3a40' if c == LIT_DIM else '#3a2a22')
        for _ in range(9):
            xx = rnd.randint(cx - w // 2 + 6, cx + w // 2 - 12)
            L.rect(xx, G + 10 + rnd.randint(0, 2), rnd.randint(3, 8), 1, c)
        for _ in range(3):
            xx = rnd.randint(cx - w // 4, cx + w // 4 - 6)
            L.rect(xx, G + 11, rnd.randint(2, 5), 1, chi)


def midground():
    L = Layer('refinaria-meio')
    factory(L, 10, 124)
    tank(L, 150, 38, 60)
    tank(L, 192, 32, 46)
    pipe_rack(L, 235, 392)
    billboard(L, 410, 125, 95, 42)
    control_building(L, 522)
    # poste de luz
    L.rect(399, G - 46, 2, 46, MID_HI)
    L.rect(399, G - 47, 8, 1, MID_HI2)
    L.rect(405, G - 46, 3, 2, LIT_HI)
    for k in range(10):
        L.dither(406 - k, G - 44 + k * 2, 2 * k + 2, 2, LIT_DIM, 0.22, only_on=False)
    ground(L)
    return L


# ------------------------------------------------------------------ primeiro plano
def barrel(L, x, y, w=18, h=24):
    L.rect(x, y, w, h, FRONT)
    L.rect(x + 1, y - 1, w - 2, 1, FRONT_HI)
    L.rect(x, y, 2, h, FRONT_HI)
    for by in (5, h - 7):
        L.rect(x - 1, y + by, w + 2, 2, FRONT_HI)
    sx, sy = x + w // 2 - 1, y + 9
    for k in range(6):
        L.rect(sx - k // 2 - 1, sy + k, k + 3 - (k % 2), 1, LIT)
    L.dot(sx, sy + 3, FRONT)
    L.dot(sx, sy + 4, FRONT)


def foreground():
    L = Layer('primeiro-plano')
    top = 240
    for y in range(top, H):
        for x in range(W):
            if (x + y) % 8 == 0 or (x - y) % 8 == 0:
                L.dot(x, y, FRONT)
    L.rect(0, top - 2, W, 3, FRONT)
    L.rect(0, top - 2, W, 1, FRONT_HI)
    for x in range(12, W, 66):
        L.rect(x, top - 12, 5, H - top + 12, FRONT)
        L.rect(x, top - 12, 1, H - top + 12, FRONT_HI)
        L.rect(x + 1, top - 14, 3, 2, FRONT)
        L.dot(x + 2, top - 15, FRONT)
        L.line(x + 2, top - 12, x + 9, top - 18, FRONT)  # braço do arame
    for i, x in enumerate(range(0, W, 4)):  # arame farpado
        y = top - 17 + (1 if i % 2 else -1)
        L.rect(x, y, 4, 1, FRONT)
        if i % 3 == 0:
            L.dot(x + 1, y - 1, FRONT)
            L.dot(x + 2, y + 1, FRONT)
    for bx in (44, 64, 372, 574, 594, 614):
        barrel(L, bx, H - 27)
    barrel(L, 54, H - 51)
    barrel(L, 584, H - 51)
    # caixote
    L.rect(98, H - 22, 24, 22, FRONT)
    L.d.rectangle([98, H - 22, 121, H - 1], outline=FRONT_HI)
    L.line(99, H - 21, 120, H - 2, FRONT_HI)
    L.line(120, H - 21, 99, H - 2, FRONT_HI)
    # tubulação com volante
    L.rect(204, H - 20, 132, 12, FRONT)
    L.rect(204, H - 20, 132, 1, FRONT_HI)
    L.dither(204, H - 19, 132, 2, FRONT_HI, 0.3)
    for fx in (210, 262, 314):
        L.rect(fx, H - 22, 4, 16, FRONT)
        L.rect(fx, H - 22, 1, 16, FRONT_HI)
    L.rect(226, H - 38, 10, 18, FRONT)
    L.rect(226, H - 38, 1, 18, FRONT_HI)
    L.rect(222, H - 40, 18, 3, FRONT)
    L.ring(231, H - 48, 8, FRONT)
    L.ring(231, H - 48, 7, FRONT)
    L.rect(223, H - 48, 17, 1, FRONT)
    L.rect(231, H - 56, 1, 17, FRONT)
    L.rect(204, H - 8, 4, 8, FRONT)
    L.rect(330, H - 8, 4, 8, FRONT)
    # placa de perigo
    sx = 470
    L.rect(sx, H - 44, 3, 44, FRONT)
    for k in range(26):
        L.rect(sx + 1 - k // 2 - 2, H - 68 + k, (k // 2) * 2 + 5, 1, FRONT)
    for k in range(4, 23):
        L.rect(sx + 1 - (k - 4) // 2, H - 68 + k, ((k - 4) // 2) * 2 + 1, 1, HOT)
    L.rect(sx + 1, H - 58, 1, 8, FRONT)
    L.rect(sx, H - 57, 3, 5, FRONT)
    L.rect(sx, H - 48, 3, 2, FRONT)
    # mato na base da cerca
    for _ in range(60):
        x = rnd.randrange(W)
        hgt = rnd.randint(2, 6)
        L.rect(x, H - hgt, 1, hgt, FRONT)
        L.dot(x + rnd.choice([-1, 1]), H - hgt + 1, FRONT)
    return L


# ------------------------------------------------------------------ saída
def rects_by_color(im):
    px = im.load()
    active, out = {}, {}
    for y in range(H + 1):
        runs = []
        if y < H:
            x = 0
            while x < W:
                p = px[x, y]
                if p[3] == 0:
                    x += 1
                    continue
                x0 = x
                while x < W and px[x, y] == p:
                    x += 1
                runs.append((x0, x, p[:3]))
        new = {k: active.pop(k, y) for k in runs}
        for (x0, x1, c), y0 in active.items():
            out.setdefault(c, []).append((x0, y0, x1 - x0, y - y0))
        active = new
    return out


def build():
    layers = [sky(), moon(), clouds(), skyline(), refinery_back(), midground(), foreground()]
    flat = Image.new('RGBA', (W, H))
    parts, total = [], 0
    for L in layers:
        flat.alpha_composite(L.im)
        paths = []
        for c, rects in sorted(rects_by_color(L.im).items()):
            total += len(rects)
            d = ''.join(f'M{x * S} {y * S}h{w * S}v{h * S}h{-w * S}z' for x, y, w, h in rects)
            paths.append(f'<path fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}" d="{d}"/>')
        parts.append(f'<g id="{L.name}">\n' + '\n'.join(paths) + '\n</g>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W * S}" height="{H * S}" '
           f'viewBox="0 0 {W * S} {H * S}" shape-rendering="crispEdges">\n' + '\n'.join(parts) + '\n</svg>\n')
    return svg, flat, total


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent / 'GRAPHIC'
    svg, flat, total = build()
    (root / 'fase2-refinaria-pixel.svg').write_text(svg, encoding='utf-8')
    flat.convert('RGB').save(root / 'fase2-refinaria-pixel.png')
    print(total, 'retângulos;', len(svg) // 1024, 'KB de SVG')
