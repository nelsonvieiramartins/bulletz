# Recorta os 12 carros de GRAPHIC/fase2-av-t9/carros.webp, grava um sprite por carro em assets/fase2/carros/
# (em 2x, rodas apoiadas na última linha) e mede o teto de cada um, que vira plataforma no jogo.
# Saída: assets/fase2/carros/carro-01..12.webp e assets/fase2/carros.json (em unidades do mundo).
# Uso: python tools/montar_carros.py
import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = root / 'GRAPHIC' / 'fase2-av-t9' / 'carros.webp'
out_dir = root / 'assets' / 'fase2' / 'carros'
out_dir.mkdir(parents=True, exist_ok=True)

SCALE = 0.81     # da arte original para o jogo em 2x (um sedan fica com ~63 unidades de altura, igual ao Edu)
# ajuste de tamanho por carro (número na ordem da imagem): caminhonetes maiores, fusca (o amarelo) menor
SIZE = {7: 1.12, 8: 1.12, 9: 1.12, 11: 1.12, 4: .96}
MIN_WIDTH = 10    # unidades: largura mínima de uma plataforma depois de juntar os trechos
MIN_SURFACE = 24 # px (em 2x): largura mínima de um trecho plano para virar plataforma
PAD = 6         # px de sombra mantidos abaixo das rodas

im = Image.open(src).convert('RGBA')
cols = [(150, 660), (700, 1300), (1300, 1900)]
rows = [(0, 172), (172, 340), (340, 495), (495, 667)]
cells = [(c, r) for r in rows for c in cols]   # ordem de leitura: linha a linha

info = []
for n, ((x0, x1), (y0, y1)) in enumerate(cells, 1):
    cell = im.crop((x0, y0, x1, y1))
    alpha = np.asarray(cell)[:, :, 3]
    ys, xs = np.where(alpha > 200)
    box = (xs.min(), ys.min(), xs.max() + 1, min(ys.max() + 1 + PAD, cell.height))
    car = cell.crop(box)
    scale = SCALE * SIZE.get(n, 1)
    w, h = round(car.width * scale), round(car.height * scale)
    car = car.resize((w, h), Image.LANCZOS)
    car.save(out_dir / f'carro-{n:02d}.webp', quality=92, method=6)

    a = np.asarray(car)[:, :, 3]
    solid = a > 200
    body_h = int(np.where(solid.any(axis=1))[0].max()) + 1       # linha de apoio das rodas
    top = np.array([np.argmax(solid[:, x]) if solid[:, x].any() else body_h for x in range(w)])
    # superfície do teto: o nível mais alto que tem um trecho plano contínuo de pelo menos 30% da largura
    best = None
    for level in range(int(top.min()), body_h):
        ok = np.abs(top - level) <= 5
        run = longest = start = 0
        bestrun = (0, 0)
        for x in range(w):
            if ok[x]:
                run += 1
                if run > longest: longest, bestrun = run, (x - run + 1, x + 1)
            else:
                run = 0
        if longest >= .3 * w:
            best = (level, bestrun)
            break
    level, (rx0, rx1) = best
    # todas as superfícies onde dá para subir: trechos quase planos do contorno de cima (teto, capô, porta-malas, caçamba)
    surfaces = []
    x = 0
    while x < w:
        start_level, end = top[x], x
        while end + 1 < w and abs(top[end + 1] - start_level) <= 4:
            end += 1
        if end - x + 1 >= MIN_SURFACE and start_level < body_h - 12:
            y = int(np.median(top[x:end + 1]))
            surfaces.append({'x0': (x + 2) / 2, 'x1': (end - 1) / 2, 'y': (body_h - y) / 2})   # 1 unidade de folga em cada ponta
            x = end + 1
        else:
            x += 1
    # junta trechos vizinhos de mesma altura (o contorno tem pequenos degraus) e descarta os estreitos demais
    merged = []
    for s in surfaces:
        if merged and s['x0'] - merged[-1]['x1'] <= 3 and abs(s['y'] - merged[-1]['y']) <= 3:
            merged[-1]['x1'] = s['x1']
            merged[-1]['y'] = max(merged[-1]['y'], s['y'])
        else:
            merged.append(dict(s))
    surfaces = [s for s in merged if s['x1'] - s['x0'] >= MIN_WIDTH]
    info.append({
        'surfaces': surfaces,
        'file': f'carro-{n:02d}.webp',
        'w': w / 2, 'h': h / 2,                    # unidades do mundo (2 px = 1 unidade)
        'roofY': (body_h - level) / 2,             # altura do teto acima do chão
        'roofX0': rx0 / 2, 'roofX1': rx1 / 2       # trecho plano do teto, a partir da esquerda do carro
    })
    print(n, info[-1])

(root / 'assets' / 'fase2' / 'carros.json').write_text(json.dumps(info, indent=1), encoding='utf-8')
