# Recorta o miolo (aro e cubo) das 4 rodas da Carreta Furação para o jogo girar sobre a arte (Fase 2.1).
# Saída: assets/fase2/rodas/roda-1..4.webp (círculos com fundo transparente) e assets/fase2/rodas.json,
# com o centro e o raio de cada roda em pixels da carreta já em 2x (assets/fase2/carreta-furacao.webp).
# Uso: python tools/montar_rodas.py  (rode depois de tools/montar_fase2.py)
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
truck = Image.open(root / 'assets' / 'fase2' / 'carreta-furacao.webp').convert('RGBA')
out_dir = root / 'assets' / 'fase2' / 'rodas'
out_dir.mkdir(parents=True, exist_ok=True)

# centros e raio do aro, ajustados por um círculo sobre a borda clara do aro de cada roda (px da carreta em 2x)
centers = [(179, 315), (279, 315), (927, 315), (1203, 315)]
RIM = 25   # raio do miolo que gira, em px (o aro tem ~24; o pneu escuro em volta fica parado)

wheels = []
for n, (cx, cy) in enumerate(centers, 1):
    disc = truck.crop((cx - RIM, cy - RIM, cx + RIM + 1, cy + RIM + 1))
    mask = Image.new('L', disc.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, disc.width - 1, disc.height - 1), fill=255)
    disc.putalpha(mask)
    disc.save(out_dir / f'roda-{n}.webp', lossless=True)
    wheels.append({'file': f'roda-{n}.webp', 'cx': cx, 'cy': cy, 'r': RIM, 'size': disc.width})
    print(n, wheels[-1])

(root / 'assets' / 'fase2' / 'rodas.json').write_text(json.dumps({'sprite': {'w': truck.width, 'h': truck.height}, 'rodas': wheels}, indent=1), encoding='utf-8')
