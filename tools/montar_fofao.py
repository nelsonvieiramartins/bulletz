# Monta as folhas do Fofão para o jogo a partir das artes em GRAPHIC/fofao.
# Todas as folhas saem com o personagem virado para a ESQUERDA (como os outros inimigos), na mesma escala,
# com os pés na mesma linha e o corpo centralizado em cada quadro:
#   assets/fofao/corrida.png (4x2 = 8 quadros), ataque.png e ataque2.png (4x2 = 8, dois golpes diferentes) e queda.png (5x1 = 5)
# Fontes: "Mirrored Red-Haired Runner..." (corrida, já virada para a esquerda), "Corrected F-Emblazoned Knife Attack..."
# (ataque, para a esquerda) e "Fofão-Style Clown Knockdown Sprite Sequence.png" (queda, vem virada para a direita: espelhada).
# Uso: python tools/montar_fofao.py   (imprime as medidas para colocar em game.js)
import glob
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
src = root / 'GRAPHIC' / 'fofao'
out_dir = root / 'assets' / 'fofao'
out_dir.mkdir(parents=True, exist_ok=True)

TARGET = 136   # altura do Fofão correndo, em px do jogo em 2x (68 unidades do mundo)
THIN = 0.86    # fator só na largura: o Fofão fica mais fino sem mudar a altura
PAD = 6

def find(part, exclude=None):
    for f in sorted(glob.glob(str(src / '*.png'))):
        name = Path(f).name
        if part in name and not (exclude and exclude in name):
            return f
    raise FileNotFoundError(part)

sheets = {
    'corrida': (find('Mirrored Red-Haired Runner'), 4, 2, False),
    'ataque': (find('Corrected F-Emblazoned Knife Attack'), 4, 2, False),
    'ataque2': (find('Red-Haired Fighter Knife Attack'), 4, 2, True),   # segundo golpe: vem virado para a direita (espelhado)
    'queda': (find('Knockdown Sprite Sequence', exclude='Copia'), 5, 1, True),
}

def strips(path, count):
    """Separa os quadros pelas colunas vazias entre eles (os quadros da queda não ocupam uma grade regular)."""
    im = Image.open(path).convert('RGBA')
    filled = (np.asarray(im)[:, :, 3] > 40).any(axis=0)
    runs, start = [], None
    for x, f in enumerate(filled):
        if f and start is None: start = x
        if not f and start is not None: runs.append([start, x]); start = None
    if start is not None: runs.append([start, len(filled)])
    while len(runs) > count:   # junta os vizinhos mais próximos (pedaços soltos de um mesmo quadro)
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps))
        runs[i][1] = runs[i + 1][1]
        del runs[i + 1]
    assert len(runs) == count, (len(runs), count)
    for a, b in runs:
        yield im.crop((a, 0, b, im.height))

def cells(path, cols, rows):
    if rows == 1 and cols == 5:
        yield from strips(path, cols)
        return
    # Os quadros se tocam na grade (a ponta da faca passa para a célula do vizinho): separa cada um pela sua própria
    # mancha de pixels (componente conexo), em vez de cortar numa grade fixa.
    im = Image.open(path).convert('RGBA')
    arr = np.asarray(im)
    rh = im.height // rows
    for r in range(rows):
        band = arr[r * rh:(r + 1) * rh]
        solid = band[:, :, 3] > 40
        labels, n = ndimage.label(ndimage.binary_dilation(solid, iterations=3))
        comps = []
        for i in range(1, n + 1):
            m = (labels == i) & solid
            if m.sum() > 150:
                comps.append((np.where(m)[1].mean(), i))
        comps.sort()
        assert len(comps) == cols, (path, r, len(comps))
        for _, i in comps:
            piece = band.copy()
            piece[labels != i] = 0
            yield Image.fromarray(piece, 'RGBA')

def clean(cell):
    """Apaga os respingos soltos (riscos e setas de movimento da arte, longe do corpo): fica só o que toca o corpo."""
    a = np.asarray(cell).copy()
    solid = a[:, :, 3] > 40
    near = ndimage.binary_dilation(solid, iterations=8)   # o que está a até ~8 px do corpo ainda é do personagem
    labels, n = ndimage.label(near)
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    main = 1 + int(np.argmax(sizes))
    a[labels != main] = 0
    return Image.fromarray(a)

def trim(cell):
    a = np.asarray(cell)[:, :, 3]
    ys, xs = np.where(a > 40)
    return cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

frames = {}
for name, (path, cols, rows, flip) in sheets.items():
    frames[name] = []
    for cell in cells(path, cols, rows):
        t = trim(clean(ImageOps.mirror(cell) if flip else cell))
        frames[name].append(t)

# escala única: a corrida define a altura do personagem em pé
scale = TARGET / float(np.median([f.height for f in frames['corrida']]))
print('escala', round(scale, 4))

info = {}
for name, fr in frames.items():
    s = scale
    if name == 'queda':
        # a arte da queda foi desenhada maior que a da corrida: ajusta para o 1º quadro (em pé) ter a altura do Fofão correndo
        s = TARGET / float(fr[0].height)
        print('escala da queda', round(s, 4))
    scaled = [f.resize((max(1, round(f.width * s * THIN)), max(1, round(f.height * s))), Image.LANCZOS) for f in fr]
    # o centro do corpo é o centro de massa da imagem: a faca estendida pesa pouco e não desloca o personagem
    centers = []
    for f in scaled:
        a = np.asarray(f)[:, :, 3].astype(float)
        xs = (a.sum(axis=0) * np.arange(f.width)).sum() / a.sum()
        centers.append(xs)
    left = max(c for c in centers)                      # maior distância do centro até a esquerda
    right = max(f.width - c for f, c in zip(scaled, centers))
    cw = int(np.ceil(left + right)) + 2 * PAD
    ch = max(f.height for f in scaled) + 2 * PAD
    cols = 5 if name == 'queda' else 4
    rows = int(np.ceil(len(scaled) / cols))
    sheet = Image.new('RGBA', (cw * cols, ch * rows), (0, 0, 0, 0))
    ax = int(round(left)) + PAD
    ay = ch - PAD
    for i, (f, c) in enumerate(zip(scaled, centers)):
        x = (i % cols) * cw + ax - int(round(c))
        y = (i // cols) * ch + ay - f.height
        sheet.alpha_composite(f, (x, y))
    sheet.save(out_dir / f'{name}.png', optimize=True)
    info[name] = (cw, ch, ax, ay, cols, len(scaled))
    print(name, 'celula', cw, 'x', ch, 'ancora', (ax, ay), 'colunas', cols, 'quadros', len(scaled))
