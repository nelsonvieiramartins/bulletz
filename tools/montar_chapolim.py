# Monta as folhas do Chapolim Colorado para o jogo a partir das artes em GRAPHIC/champolim.
# As artes vêm em RGB com fundo preto e o personagem virado para a DIREITA; as folhas saem com alfa e viradas para a
# ESQUERDA (como os outros inimigos), na mesma escala, pés na mesma linha e corpo centralizado em cada quadro:
#   assets/chapolim/corrida.png (4x2 = 8 quadros), ataque.png (4x2 = 8: guarda, marreta sobe, golpe, impacto), queda.png (5x1 = 5)
#   e salto.png (5x2 = 10: agacha, sobe, marreta no alto, desce, impacto)
# Fontes: "Pixel Art Superhero Running Sprite Sheet" (corrida), "CH Hero Hammer Attack Sequence" (ataque) e
# "Pixel Art Hero Hammer Defeat Animation" (queda, com a marreta).
# Uso: python tools/montar_chapolim.py   (imprime as medidas para colocar em game.js)
import glob
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
src = root / 'GRAPHIC' / 'champolim'
out_dir = root / 'assets' / 'chapolim'
out_dir.mkdir(parents=True, exist_ok=True)

TARGET = 142   # altura do Chapolim correndo, em px do jogo em 2x (71 unidades do mundo; o Fofão tem 68)
PAD = 6
JUMP_BOOST = 1.3   # a arte do salto veio com o personagem menor: sobe para a cabeça ter o tamanho da corrida
ATTACK_BOOST = 1.13   # a arte do ataque foi desenhada com o personagem menor (agachado, cabeça menor): sobe para a cabeça ter o tamanho da corrida

def find(part):
    for f in sorted(glob.glob(str(src / '*.*'))):
        if part in Path(f).name:
            return f
    raise FileNotFoundError(part)

sheets = {
    'corrida': (find('Superhero Running'), 4, 2),
    'ataque': (find('CH Hero Hammer Attack'), 4, 2),
    'queda': (find('Hero Hammer Defeat Animation'), 5, 1),
    'salto': (find('salto especial'), 5, 2),   # ataque especial aéreo: agacha, salta, cai com a marreta (10 quadros)
}

def keyed(path):
    """Fundo preto (ligado à borda) vira transparente; os pretos de dentro do desenho ficam."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    dark = a.max(axis=2) < 14   # só o preto do fundo: contornos escuros do desenho (cabelo, boca) não podem ser comidos
    labels, n = ndimage.label(dark)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    sizes = ndimage.sum(dark, labels, range(1, n + 1))
    big = {i + 1 for i, s in enumerate(sizes) if s > 150}   # vãos pretos grandes (entre a marreta e o corpo) também são fundo
    bg = np.isin(labels, list(edge | big))
    # contorno suave: pixels escuros ao lado do fundo ficam meio transparentes
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    rim = ndimage.binary_dilation(bg, iterations=1) & ~bg & (a.max(axis=2) < 70)
    alpha[rim] = 120
    return Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), 'RGBA')

def strips(im, count):
    filled = (np.asarray(im)[:, :, 3] > 40).any(axis=0)
    runs, start = [], None
    for x, f in enumerate(filled):
        if f and start is None: start = x
        if not f and start is not None: runs.append([start, x]); start = None
    if start is not None: runs.append([start, len(filled)])
    while len(runs) > count:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps))
        runs[i][1] = runs[i + 1][1]
        del runs[i + 1]
    assert len(runs) == count, (len(runs), count)
    for a, b in runs:
        yield im.crop((a, 0, b, im.height))

def cells(im, cols, rows):
    if rows == 1:
        yield from strips(im, cols)
        return
    # os quadros se tocam na grade (a marreta e a ponta passam para a célula do vizinho): cada quadro é a sua própria mancha
    arr = np.asarray(im)
    rh = im.height // rows
    for r in range(rows):
        band = arr[r * rh:(r + 1) * rh]
        solid = band[:, :, 3] > 40
        labels, n = ndimage.label(ndimage.binary_dilation(solid, iterations=3))
        sizes = [(int(((labels == i) & solid).sum()), i) for i in range(1, n + 1)]
        main = sorted(sizes, reverse=True)[:cols]   # as `cols` maiores manchas são os personagens (riscos e faíscas soltos são menores)
        comps = sorted((float(np.where((labels == i) & solid)[1].mean()), i) for _, i in main)
        for _, i in comps:
            piece = band.copy()
            piece[labels != i] = 0
            yield Image.fromarray(piece, 'RGBA')

def clean(cell, keep_effects, min_light=18, join=6):
    a = np.asarray(cell).copy()
    solid = a[:, :, 3] > 40
    if not keep_effects:
        # riscos brancos/cinzentos do golpe: pixels sem cor longe do corpo colorido (dentes, olhos e solas ficam: estão colados nele)
        r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
        mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
        body = ndimage.binary_dilation((mx - mn) >= 45, iterations=4) & solid
        ys = np.arange(a.shape[0])[:, None]
        loose = solid & ~body & (mx > min_light) & ((mx - mn) < 38) & (ys < a.shape[0] * 0.78)
        a[loose] = 0
        solid = a[:, :, 3] > 40
    near = ndimage.binary_dilation(solid, iterations=join)
    labels, n = ndimage.label(near)
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    main = 1 + int(np.argmax(sizes))
    a[labels != main] = 0
    return Image.fromarray(a)

def trim(cell):
    al = np.asarray(cell)[:, :, 3]
    ys, xs = np.where(al > 40)
    return cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

frames = {}
for name, (path, cols, rows) in sheets.items():
    im = keyed(path)
    # salto: limiar de claridade alto, para não apagar os fios escuros das antenas
    frames[name] = [trim(clean(ImageOps.mirror(c), name not in ('ataque', 'salto'), 90 if name == 'salto' else 18, 3 if name == 'salto' else 6)) for c in cells(im, cols, rows)]

scale = TARGET / float(np.median([f.height for f in frames['corrida']]))
print('escala', round(scale, 4))

for name, fr in frames.items():
    s = scale
    if name == 'queda':
        s = TARGET / float(fr[0].height)   # 1º quadro em pé com a mesma altura do Chapolim correndo
        print('escala da queda', round(s, 4))
    if name == 'ataque':
        s *= ATTACK_BOOST
    elif name == 'salto':
        s *= JUMP_BOOST
    scaled = [f.resize((max(1, round(f.width * s)), max(1, round(f.height * s))), Image.LANCZOS) for f in fr]
    centers = []
    for f in scaled:
        al = np.asarray(f)[:, :, 3].astype(float)
        centers.append((al.sum(axis=0) * np.arange(f.width)).sum() / al.sum())
    left = max(centers)
    right = max(f.width - c for f, c in zip(scaled, centers))
    cw = int(np.ceil(left + right)) + 2 * PAD
    ch = max(f.height for f in scaled) + 2 * PAD
    cols = 5 if name in ('queda', 'salto') else 4
    rows = int(np.ceil(len(scaled) / cols))
    sheet = Image.new('RGBA', (cw * cols, ch * rows), (0, 0, 0, 0))
    ax = int(round(left)) + PAD
    ay = ch - PAD
    for i, (f, c) in enumerate(zip(scaled, centers)):
        sheet.alpha_composite(f, ((i % cols) * cw + ax - int(round(c)), (i // cols) * ch + ay - f.height))
    sheet.save(out_dir / f'{name}.png', optimize=True)
    print(name, 'celula', cw, 'x', ch, 'ancora', (ax, ay), 'colunas', cols, 'quadros', len(scaled))
