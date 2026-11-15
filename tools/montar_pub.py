# Prepara o Vikings Pub (fim da Fase 2.1) a partir do recorte GRAPHIC/fase2-av-t9/vikings-pub-recorte.webp (fundo transparente).
# O jogo usa o céu, os prédios e o asfalto padrão; o pub entra por cima como uma camada recortada.
# O recorte é cortado na altura em que começa a calçada dele (as plantas e a cerca param ali) e escalado; no jogo a base
# fica na linha onde começa a calçada da rua padrão. Saída: assets/fase2/vikings-pub.webp, em 2x (1 px = 1 px do canvas).
# Uso: python tools/montar_pub.py   (imprime as medidas para colocar em game.js)
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = root / 'GRAPHIC' / 'fase2-av-t9' / 'vikings-pub-recorte.webp'
out = root / 'assets' / 'fase2' / 'vikings-pub.webp'

CUT = 512        # linha (no recorte) onde termina o que fica em pé e começa a calçada dele
SCALE = 0.78     # px do recorte -> px do jogo em 2x
DOOR_X = 1445    # centro da porta principal ("VIKINGS PUB"), em px do recorte

im = Image.open(src).convert('RGBA').crop((0, 0, 2000, CUT))
w, h = 2 * round(im.width * SCALE / 2), 2 * round(im.height * SCALE / 2)
im.resize((w, h), Image.LANCZOS).save(out, lossless=True, method=6)
print('vikings-pub', (w, h), '-> unidades', (w // 2, h // 2))
print('porta (centro) em x =', round(DOOR_X * SCALE / 2), 'unidades da esquerda')
