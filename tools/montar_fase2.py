# Gera as imagens do jogo da Fase 2 (Av. T-9, Goiânia) a partir das artes em GRAPHIC/fase2-av-t9.
# Saída em assets/fase2, em 2x (altura 540 = 270 unidades do mundo, 1 px da imagem = 1 px do canvas).
# Uso: python tools/montar_fase2.py
#
# Além das versões redimensionadas, monta as faixas que se repetem sem emenda no jogo:
#   - rua-t9-continua.webp: rua A + rua B numa faixa só. A calçada da B é alinhada à da A e, em cada
#     junção, a calçada e o asfalto passam de uma para a outra com pontilhado, enquanto as fachadas
#     somem em pontilhado e deixam um respiro de céu entre os quarteirões.
#   - ceu-predios-continuo.webp: céu A seguido do céu A espelhado (as bordas casam pixel a pixel).
#     O céu anda a 12% da câmera, então só uma junção aparece na fase inteira.
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
orig = root / 'GRAPHIC' / 'fase2-av-t9'
game = root / 'assets' / 'fase2'
game.mkdir(parents=True, exist_ok=True)

STREET_B_LIFT = 24   # px (em 2x): quanto a calçada da rua B está mais baixa que a da rua A
SEAM = 96            # px (em 2x): largura de cada junção da rua
SIDEWALK_ROW = 395   # px (em 2x): acima disto são fachadas; abaixo, calçada e asfalto

resized = {}
for name in ['carreta-furacao', 'rua-t9-a', 'rua-t9-b', 'ceu-predios-a', 'ceu-predios-b']:
    im = Image.open(orig / (name + '.webp')).convert('RGBA')
    if name == 'carreta-furacao':
        im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox())
        h = 360  # 180 unidades do mundo: ~2x a altura do Edu
    else:
        h = 540
    w = 2 * round(im.width * h / im.height / 2)  # par: metade inteira em unidades do mundo, sem costura
    out = im.resize((w, h), Image.LANCZOS)
    resized[name] = out
    if name.startswith('ceu'):
        out = out.convert('RGB')
    out.save(game / (name + '.webp'), quality=90, method=6)
    print(name, out.size)

# --- rua sem emenda ---
bayer = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + .5) / 16
a = np.asarray(resized['rua-t9-a']).copy()
b0 = np.asarray(resized['rua-t9-b'])
b = np.zeros_like(b0)
b[:-STREET_B_LIFT] = b0[STREET_B_LIFT:]
b[-STREET_B_LIFT:] = b0[-STREET_B_LIFT:]   # completa o pé do asfalto repetindo a última faixa (sem as faixas brancas)

def junction(left, right):
    """Passa da borda direita de `left` para a borda esquerda de `right` (ambas com SEAM colunas)."""
    h = left.shape[0]
    t = (np.arange(SEAM) + .5) / SEAM
    th = np.tile(bayer, (h // 4 + 1, SEAM // 4 + 1))[:h, :SEAM]
    out = np.zeros_like(left)
    low = np.arange(h)[:, None] >= SIDEWALK_ROW
    take_right = th < t                      # calçada e asfalto: troca pontilhada de uma rua para a outra
    out[:] = np.where((low & take_right)[..., None], right, left)
    # fachadas: a da esquerda some na 1ª metade, a da direita aparece na 2ª; no meio fica o céu
    keep_left = th >= np.clip(2 * t, 0, 1)
    keep_right = th < np.clip(2 * t - 1, 0, 1)
    up = ~low
    out[up & ~keep_left & ~keep_right] = 0
    out[up & keep_right] = right[up & keep_right]
    out[up & keep_left] = left[up & keep_left]
    return out

strip = np.concatenate([
    a[:, SEAM:-SEAM], junction(a[:, -SEAM:], b[:, :SEAM]),
    b[:, SEAM:-SEAM], junction(b[:, -SEAM:], a[:, :SEAM])
], axis=1)
Image.fromarray(strip).save(game / 'rua-t9-continua.webp', quality=90, method=6)
print('rua-t9-continua', strip.shape[1], 'x', strip.shape[0])

# --- céu sem emenda ---
sky = resized['ceu-predios-a'].convert('RGB')
both = Image.new('RGB', (sky.width * 2, sky.height))
both.paste(sky, (0, 0))
both.paste(sky.transpose(Image.FLIP_LEFT_RIGHT), (sky.width, 0))
both.save(game / 'ceu-predios-continuo.webp', quality=90, method=6)
print('ceu-predios-continuo', both.size)
