"""Gera o cenário vetorial da Fase 2 · Refinaria da Pensão (SVG em camadas).

Uso: python tools/gerar_cenario_fase2.py
Saída: GRAPHIC/fase2-refinaria-da-pensao.svg (2560x1080, mesma proporção de assets/cidade.webp)
"""
import random
from pathlib import Path

W, H = 2560, 1080
GROUND = 900
rnd = random.Random(1987)

# Paleta: noite tóxica (contraste com o pôr do sol roxo/laranja da Fase 1)
SKY_FAR = '#0d3046'
BACK, BACK_HI = '#0a2233', '#14405a'
MID, MID_HI = '#071826', '#103347'
FRONT = '#030a12'
LIT, LIT_DIM = '#c8f36a', '#2f7f7a'
HOT, HOT_HI = '#ff9a3c', '#ffe08a'
ALERT = '#e2533f'


def rect(x, y, w, h, fill, extra=''):
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" {extra}/>'


def circle(cx, cy, r, fill, extra=''):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" {extra}/>'


def ellipse(cx, cy, rx, ry, fill, extra=''):
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}" {extra}/>'


def poly(points, fill, extra=''):
    pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in points)
    return f'<polygon points="{pts}" fill="{fill}" {extra}/>'


def path(d, fill, extra=''):
    return f'<path d="{d}" fill="{fill}" {extra}/>'


def line(x1, y1, x2, y2, stroke, width, extra=''):
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{stroke}" stroke-width="{width}" {extra}/>')


def group(name, items):
    return f'<g id="{name}">\n' + '\n'.join(items) + '\n</g>'


def truss(x, y_top, y_bottom, width, color, weight=5):
    """Torre treliçada vertical."""
    out = [line(x, y_top, x, y_bottom, color, weight), line(x + width, y_top, x + width, y_bottom, color, weight)]
    step = width * 1.1
    y, flip = y_top, False
    while y < y_bottom - 1:
        y2 = min(y + step, y_bottom)
        a, b = (x, x + width) if flip else (x + width, x)
        out.append(line(a, y, b, y2, color, weight * 0.6))
        out.append(line(x, y, x + width, y, color, weight * 0.6))
        y, flip = y2, not flip
    return out


# ---------------------------------------------------------------- céu
def sky():
    out = [rect(0, 0, W, H, 'url(#gSky)')]
    for _ in range(170):
        x, y = rnd.uniform(0, W), rnd.uniform(0, 620)
        s = rnd.choice([2, 2, 3, 3, 4, 6])
        op = rnd.uniform(0.35, 1) * (1 - y / 800)
        out.append(poly([(x, y - s), (x + s, y), (x, y + s), (x - s, y)], '#d9f5e4', f'opacity="{op:.2f}"'))
    return group('ceu', out)


def moon():
    cx, cy, r = 1930, 250, 118
    out = [circle(cx, cy, 340, 'url(#gMoon)'),
           circle(cx, cy, r, '#e6f6c9'),
           path(f'M{cx - 20},{cy - r} A{r},{r} 0 0 1 {cx - 20},{cy + r} A{r * 1.35},{r * 1.35} 0 0 0 {cx - 20},{cy - r}Z',
                '#b9d9a6', 'opacity="0.55"')]
    for dx, dy, cr in [(-38, -30, 22), (30, 20, 30), (-10, 55, 14), (48, -48, 12), (-60, 28, 10)]:
        out.append(circle(cx + dx, cy + dy, cr, '#a9cc9a', 'opacity="0.6"'))
    return group('lua', out)


def cloud(cx, cy, w, fill, op):
    out = []
    n = int(w / 70)
    for i in range(n):
        t = i / max(n - 1, 1)
        bump = 1 - abs(t - 0.5) * 1.4
        rx = rnd.uniform(60, 95)
        out.append(ellipse(cx - w / 2 + t * w, cy - 14 * bump, rx, 16 + 26 * bump, fill))
    out.append(rect(cx - w / 2 - 60, cy - 4, w + 120, 22, fill, 'rx="11"'))
    return f'<g opacity="{op}">' + ''.join(out) + '</g>'


def clouds():
    specs = [(360, 190, 620, '#12344f', .8), (1180, 120, 520, '#0f2c46', .8), (2300, 420, 560, '#1a4d5c', .7),
             (820, 420, 760, '#174656', .65), (1560, 520, 900, '#1f5f66', .6), (160, 560, 520, '#226a6c', .55),
             (2140, 610, 700, '#2c7d74', .5)]
    return group('nuvens', [cloud(*s) for s in specs])


# ---------------------------------------------------------------- skyline distante
def far_skyline():
    out, x = [], -20
    base = 850
    while x < W:
        w = rnd.uniform(56, 140)
        h = rnd.uniform(140, 400)
        top = base - h
        out.append(rect(x, top, w, h + 60, SKY_FAR))
        kind = rnd.random()
        if kind < 0.3:
            out.append(rect(x + w * 0.2, top - 34, w * 0.6, 34, SKY_FAR))
            out.append(rect(x + w * 0.42, top - 80, w * 0.16, 46, SKY_FAR))
        elif kind < 0.5:
            out.append(poly([(x, top), (x + w / 2, top - 46), (x + w, top)], SKY_FAR))
        elif kind < 0.7:
            out.append(line(x + w / 2, top, x + w / 2, top - rnd.uniform(50, 110), SKY_FAR, 4))
        # janelas
        cols, rows = int(w // 18), int(h // 26)
        for r in range(rows):
            for c in range(cols):
                p = rnd.random()
                if p < 0.5:
                    continue
                fill = LIT if p > 0.9 else LIT_DIM
                out.append(rect(x + 8 + c * 18, top + 14 + r * 26, 8, 12, fill, f'opacity="{0.9 if p > 0.9 else 0.45}"'))
        x += w + rnd.uniform(-6, 26)
    return group('skyline-distante', out)


# ---------------------------------------------------------------- refinaria ao fundo
def cooling_tower(cx, base_w, h):
    base, top = GROUND - 30, GROUND - 30 - h
    bw, tw, waist = base_w / 2, base_w * 0.36, base_w * 0.3
    wy = top + h * 0.3
    d = (f'M{cx - bw},{base} Q{cx - waist},{wy + h * 0.25} {cx - waist},{wy} Q{cx - waist},{top + 20} {cx - tw},{top} '
         f'L{cx + tw},{top} Q{cx + waist},{top + 20} {cx + waist},{wy} Q{cx + waist},{wy + h * 0.25} {cx + bw},{base}Z')
    hi = (f'M{cx - bw},{base} Q{cx - waist},{wy + h * 0.25} {cx - waist},{wy} Q{cx - waist},{top + 20} {cx - tw},{top} '
          f'L{cx - tw + 30},{top} Q{cx - waist + 34},{top + 20} {cx - waist + 34},{wy} '
          f'Q{cx - waist + 34},{wy + h * 0.25} {cx - bw + 60},{base}Z')
    out = [path(d, BACK), path(hi, BACK_HI),
           ellipse(cx, top, tw, 12, '#06141f'),
           rect(cx - tw, top + 36, tw * 2, 8, BACK_HI, 'opacity="0.6"')]
    # vapor
    px, py, pr = cx, top - 20, 46
    for i in range(9):
        out.append(circle(px, py, pr, '#3b8f8c', f'opacity="{0.42 - i * 0.035:.2f}"'))
        px += rnd.uniform(26, 60)
        py -= rnd.uniform(34, 58)
        pr += rnd.uniform(6, 16)
    return out


def chimney(x, h, w=34):
    top = GROUND - 30 - h
    out = [poly([(x, GROUND), (x + 5, top), (x + w - 5, top), (x + w, GROUND)], BACK),
           rect(x + 5, top + 26, w - 10, 20, ALERT, 'opacity="0.75"'),
           rect(x + 4, top + 70, w - 8, 20, ALERT, 'opacity="0.75"'),
           rect(x + 2, top - 8, w - 4, 10, BACK_HI),
           circle(x + w / 2, top - 16, 22, 'url(#gAlert)'),
           circle(x + w / 2, top - 16, 6, '#ff8a70')]
    return out


def sphere_tank(cx, r):
    cy = GROUND - 60 - r
    out = []
    for dx in (-r * 0.7, -r * 0.25, r * 0.25, r * 0.7):
        out.append(line(cx + dx, cy + r * 0.5, cx + dx * 1.15, GROUND, BACK, 7))
    out += [circle(cx, cy, r, BACK),
            path(f'M{cx - r},{cy} A{r},{r} 0 0 1 {cx},{cy - r} A{r * 1.4},{r * 1.4} 0 0 0 {cx - r},{cy}Z', BACK_HI),
            rect(cx - r, cy - 5, r * 2, 9, '#06141f', 'opacity="0.7"'),
            rect(cx - 5, cy - r - 16, 10, 18, BACK_HI)]
    return out


def column(x, w, h):
    top = GROUND - 30 - h
    out = [rect(x, top, w, h + 30, BACK, f'rx="{w / 2:.0f}"'),
           rect(x + 5, top + 10, w * 0.22, h, BACK_HI, 'rx="5"')]
    for y in range(int(top + 50), GROUND - 60, 70):
        out.append(rect(x - 9, y, w + 18, 7, BACK_HI))
        out.append(line(x - 9, y, x - 9, y - 22, BACK_HI, 3))
        out.append(line(x + w + 9, y, x + w + 9, y - 22, BACK_HI, 3))
    out.append(line(x + w / 2, top, x + w / 2, top - 46, BACK, 5))
    return out


def flare(x, h):
    top = GROUND - h
    out = truss(x, top, GROUND, 44, BACK_HI, 6)
    out.append(rect(x + 14, top - 60, 16, 66, BACK))
    fx, fy = x + 22, top - 60
    out += [circle(fx, fy - 70, 260, 'url(#gFlare)'),
            path(f'M{fx},{fy} C{fx - 62},{fy - 50} {fx - 34},{fy - 130} {fx + 8},{fy - 196} '
                 f'C{fx + 2},{fy - 130} {fx + 70},{fy - 96} {fx},{fy}Z', HOT),
            path(f'M{fx},{fy} C{fx - 32},{fy - 36} {fx - 14},{fy - 84} {fx + 6},{fy - 120} '
                 f'C{fx + 6},{fy - 80} {fx + 36},{fy - 56} {fx},{fy}Z', HOT_HI),
            path(f'M{fx},{fy} C{fx - 12},{fy - 18} {fx - 4},{fy - 40} {fx + 3},{fy - 56} '
                 f'C{fx + 4},{fy - 36} {fx + 14},{fy - 24} {fx},{fy}Z', '#fff8dc')]
    return out


def refinery_back():
    out = []
    out += cooling_tower(330, 300, 400)
    out += cooling_tower(610, 250, 330)
    out += cooling_tower(2270, 280, 370)
    out += chimney(120, 520) + chimney(820, 600, 38) + chimney(1830, 470) + chimney(2480, 560, 38)
    for cx in (960, 1110, 1260):
        out += sphere_tank(cx, 72)
    out += flare(1420, 640)
    for x, w, h in [(1560, 52, 440), (1640, 44, 340), (1712, 58, 500), (2010, 48, 390), (2080, 40, 300)]:
        out += column(x, w, h)
    out.append(rect(0, GROUND - 40, W, 80, BACK))
    return group('refinaria-fundo', out)


# ---------------------------------------------------------------- plano médio
def factory(x, w):
    top = 720
    out = [rect(x, top, w, GROUND - top, MID)]
    n = 4
    tw = w / n
    for i in range(n):
        a = x + i * tw
        out.append(poly([(a, top), (a, top - 64), (a + tw, top)], MID))
        out.append(poly([(a + 6, top - 4), (a + 6, top - 52), (a + tw * 0.55, top - 4)], LIT, 'opacity="0.85"'))
    for i in range(int(w // 46)):
        lit = rnd.random() > 0.3
        out.append(rect(x + 18 + i * 46, top + 44, 28, 44, LIT if lit else MID_HI, f'opacity="{0.9 if lit else 1}"'))
    out.append(rect(x, top + 112, w, 8, MID_HI))
    out.append(rect(x + w * 0.4, top + 130, 70, GROUND - top - 130, '#020a12'))
    return out


def tank(x, w, h):
    top = GROUND - h
    out = [rect(x, top, w, h, MID),
           ellipse(x + w / 2, top, w / 2, 22, MID),
           rect(x + 8, top, w * 0.18, h, MID_HI),
           rect(x, top + h * 0.3, w, 6, MID_HI), rect(x, top + h * 0.62, w, 6, MID_HI)]
    lx = x + w - 26
    out += [line(lx, top - 10, lx, GROUND, MID_HI, 3), line(lx + 14, top - 10, lx + 14, GROUND, MID_HI, 3)]
    for y in range(int(top), GROUND, 16):
        out.append(line(lx, y, lx + 14, y, MID_HI, 2))
    out.append(poly([(x + w / 2 - 22, top + h * 0.4), (x + w / 2, top + h * 0.4 - 36), (x + w / 2 + 22, top + h * 0.4)], HOT))
    out.append(rect(x + w / 2 - 3, top + h * 0.4 - 24, 6, 13, MID))
    return out


def pipe_rack(x1, x2):
    out = []
    for x in range(x1, x2, 190):
        out += truss(x, 742, GROUND, 30, MID_HI, 5)
    for y, th in ((736, 22), (770, 14), (792, 14)):
        out.append(rect(x1 - 20, y, x2 - x1 + 60, th, MID, f'rx="{th / 2:.0f}"'))
        out.append(rect(x1 - 20, y + 3, x2 - x1 + 60, 3, MID_HI))
        for x in range(x1 + 60, x2, 150):
            out.append(rect(x, y - 2, 10, th + 4, MID_HI))
    # válvula
    vx = (x1 + x2) // 2 + 40
    out += [circle(vx, 724, 20, 'none', f'stroke="{ALERT}" stroke-width="6"'),
            line(vx - 20, 724, vx + 20, 724, ALERT, 4), line(vx, 704, vx, 744, ALERT, 4)]
    return out


def barcode_billboard(x, y, w, h):
    """Outdoor de código de barras gigante: o boleto que nunca vence."""
    out = []
    for lx in (x + w * 0.2, x + w * 0.8):
        out += truss(lx - 14, y + h, GROUND, 28, MID_HI, 5)
    out += [rect(x - 10, y - 10, w + 20, h + 20, MID),
            rect(x, y, w, h, '#0b2433'),
            rect(x, y, w, h, 'none', f'stroke="{LIT_DIM}" stroke-width="5"')]
    bx = x + 26
    while bx < x + w - 30:
        bw = rnd.choice([5, 5, 9, 14, 20])
        out.append(rect(bx, y + 22, bw, h - 62, LIT))
        bx += bw + rnd.choice([6, 8, 12, 16])
    for i in range(12):
        out.append(rect(x + 30 + i * ((w - 60) / 12), y + h - 30, (w - 60) / 12 - 8, 12, LIT, 'opacity="0.7"'))
    for i in range(5):
        out.append(circle(x + 30 + i * (w - 60) / 4, y - 26, 8, HOT_HI))
        out.append(line(x + 30 + i * (w - 60) / 4, y - 20, x + 30 + i * (w - 60) / 4, y - 10, MID_HI, 3))
    return out


def control_building(x):
    top = 650
    w = W - x + 20
    out = [rect(x, top, w, GROUND - top, MID),
           rect(x - 12, top - 14, w + 12, 16, MID_HI),
           rect(x + 60, top - 80, 150, 68, MID)]
    for r in range(3):
        for c in range(int(w // 74)):
            lit = rnd.random() > 0.45
            out.append(rect(x + 26 + c * 74, top + 30 + r * 72, 50, 42, HOT if lit else MID_HI,
                            f'opacity="{0.9 if lit else 1}"'))
            out.append(line(x + 51 + c * 74, top + 30 + r * 72, x + 51 + c * 74, top + 72 + r * 72, MID, 4))
    # antena parabólica (eco da Fase 1)
    dx, dy = x + 330, top - 70
    out += [line(dx, dy + 56, dx, dy + 10, MID_HI, 7),
            path(f'M{dx - 62},{dy - 28} A70,70 0 0 0 {dx + 54},{dy + 34}Z', MID_HI),
            line(dx - 4, dy + 4, dx + 36, dy - 44, MID_HI, 4), circle(dx + 36, dy - 44, 7, ALERT)]
    out += truss(x + 110, top - 300, top - 80, 36, MID_HI, 5)
    out += [circle(x + 128, top - 312, 24, 'url(#gAlert)'), circle(x + 128, top - 312, 7, '#ff8a70')]
    return out


def midground():
    out = []
    out += factory(40, 500)
    out += tank(600, 150, 240) + tank(770, 130, 190)
    out += pipe_rack(940, 1560)
    out += barcode_billboard(1640, 500, 380, 170)
    out += control_building(2090)
    out.append(rect(0, GROUND, W, H - GROUND, 'url(#gGround)'))
    # reflexos tóxicos no chão
    for cx, w in [(300, 300), (1120, 420), (1830, 360), (2380, 300)]:
        out.append(ellipse(cx, GROUND + 46, w / 2, 9, LIT, 'opacity="0.16"'))
        out.append(ellipse(cx + 30, GROUND + 50, w / 4, 4, LIT, 'opacity="0.3"'))
    return group('refinaria-meio', out)


# ---------------------------------------------------------------- primeiro plano
def barrel(x, y, w=70, h=96):
    return [rect(x, y, w, h, FRONT, 'rx="6"'),
            rect(x - 3, y + 20, w + 6, 6, '#0b1f2d'), rect(x - 3, y + h - 28, w + 6, 6, '#0b1f2d'),
            poly([(x + w / 2 - 15, y + 62), (x + w / 2, y + 36), (x + w / 2 + 15, y + 62)], LIT, 'opacity="0.75"')]


def foreground():
    out = []
    top, bottom = 950, H
    for x in range(-120, W + 120, 30):
        out.append(line(x, top, x + 120, bottom, FRONT, 2.5, 'opacity="0.8"'))
        out.append(line(x + 120, top, x, bottom, FRONT, 2.5, 'opacity="0.8"'))
    out.append(rect(0, top - 6, W, 10, FRONT))
    for x in range(40, W, 260):
        out.append(rect(x, top - 40, 16, bottom - top + 40, FRONT))
        out.append(poly([(x - 6, top - 40), (x + 8, top - 62), (x + 22, top - 40)], FRONT))
    # arame farpado
    pts = []
    for i, x in enumerate(range(0, W + 40, 40)):
        pts.append((x, top - 30 + (10 if i % 2 else -10)))
    out.append('<polyline points="' + ' '.join(f'{x},{y}' for x, y in pts) +
               f'" fill="none" stroke="{FRONT}" stroke-width="4"/>')
    for bx in (180, 255, 1500, 2290, 2365, 2440):
        out += barrel(bx, H - 110)
    out += barrel(215, H - 200)
    # tubulação com volante
    out += [rect(820, H - 80, 520, 46, FRONT, 'rx="23"'), rect(900, H - 150, 46, 110, FRONT),
            rect(888, H - 160, 70, 16, FRONT), rect(1240, H - 88, 20, 62, '#0b1f2d'), rect(840, H - 88, 20, 62, '#0b1f2d'),
            circle(923, H - 186, 34, 'none', f'stroke="{FRONT}" stroke-width="9"'),
            line(889, H - 186, 957, H - 186, FRONT, 6), line(923, H - 220, 923, H - 152, FRONT, 6)]
    # placa de perigo
    out += [rect(1880, H - 190, 12, 190, FRONT),
            poly([(1826, H - 170), (1886, H - 270), (1946, H - 170)], FRONT),
            poly([(1846, H - 180), (1886, H - 248), (1926, H - 180)], HOT),
            rect(1882, H - 228, 8, 28, FRONT), rect(1882, H - 194, 8, 8, FRONT)]
    return group('primeiro-plano', out)


DEFS = f'''<defs>
<linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#040818"/><stop offset="0.3" stop-color="#0a2540"/>
<stop offset="0.52" stop-color="#14595f"/><stop offset="0.66" stop-color="#4a9c78"/>
<stop offset="0.76" stop-color="#cfe07a"/><stop offset="1" stop-color="#e8ee9a"/>
</linearGradient>
<linearGradient id="gGround" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#0a2231"/><stop offset="0.35" stop-color="#061521"/><stop offset="1" stop-color="#030a12"/>
</linearGradient>
<radialGradient id="gMoon"><stop offset="0" stop-color="#e6f6c9" stop-opacity="0.55"/>
<stop offset="0.4" stop-color="#9fd6b0" stop-opacity="0.18"/><stop offset="1" stop-color="#9fd6b0" stop-opacity="0"/></radialGradient>
<radialGradient id="gFlare"><stop offset="0" stop-color="{HOT_HI}" stop-opacity="0.7"/>
<stop offset="0.35" stop-color="{HOT}" stop-opacity="0.28"/><stop offset="1" stop-color="{HOT}" stop-opacity="0"/></radialGradient>
<radialGradient id="gAlert"><stop offset="0" stop-color="{ALERT}" stop-opacity="0.8"/>
<stop offset="1" stop-color="{ALERT}" stop-opacity="0"/></radialGradient>
</defs>'''


def build():
    layers = [sky(), moon(), clouds(), far_skyline(), refinery_back(), midground(), foreground()]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
            f'{DEFS}\n' + '\n'.join(layers) + '\n</svg>\n')


if __name__ == '__main__':
    out = Path(__file__).resolve().parent.parent / 'GRAPHIC' / 'fase2-refinaria-da-pensao.svg'
    out.write_text(build(), encoding='utf-8')
    print(out, out.stat().st_size, 'bytes')
