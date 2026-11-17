"""Servidor local do BULLETZ: serve a pasta do projeto e deixa o visualizador de sprites salvar edições.

Uso:  python tools/servidor.py [porta]        (padrão 8787, só aceita conexões do próprio computador)

Além dos arquivos, expõe um único endpoint de escrita:
  POST /api/sprite-config   grava assets/sprite-config.json (os canos das armas e os quadros ocultos editados em sprites.html)
Nada mais pode ser gravado por aqui. O conteúdo é validado, o arquivo anterior vira
assets/sprite-config.bak.json e a troca é atômica.
"""
import json
import math
import os
import re
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / 'assets' / 'sprite-config.json'
BACKUP = ROOT / 'assets' / 'sprite-config.bak.json'
MAX_BYTES = 64 * 1024
# quadros esperados por chave: o jogo e o visualizador dependem desses tamanhos
CANOS = {'runFire': 8, 'idleFire': 1, 'crouch': 3, 'jump': 4, 'patrol': 1, 'boss': 3}


def _ponto(p):
    return (isinstance(p, list) and len(p) == 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and abs(v) <= 500 for v in p))


CHAVE_SPRITE = re.compile(r'^[A-Za-z0-9_]{1,40}$')


def _int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def validar_ocultos(ocultos):
    """Quadros ocultos por sprite: { chave: { "de": total de quadros, "quadros": [índices a partir de 0] } }."""
    if not isinstance(ocultos, dict):
        return '"ocultos" precisa ser um objeto'
    for chave, item in ocultos.items():
        if not CHAVE_SPRITE.match(chave):
            return f'chave de sprite inválida: {chave}'
        if not isinstance(item, dict) or not _int(item.get('de')) or not 2 <= item['de'] <= 64:
            return f'"{chave}": "de" precisa ser o total de quadros (2 a 64)'
        quadros = item.get('quadros')
        if (not isinstance(quadros, list) or not quadros or len(set(quadros)) != len(quadros) or len(quadros) >= item['de']
                or any(not _int(q) or not 0 <= q < item['de'] for q in quadros)):
            return f'"{chave}": "quadros" precisa ser uma lista sem repetição, de 0 a {item["de"] - 1}, deixando ao menos um quadro visível'
    return None


def validar(dados):
    """Devolve uma mensagem de erro, ou None se o conteúdo é válido."""
    if not isinstance(dados, dict) or not isinstance(dados.get('canos'), dict):
        return 'faltou o objeto "canos"'
    if 'ocultos' in dados:
        erro = validar_ocultos(dados['ocultos'])
        if erro:
            return erro
    for chave, lista in dados['canos'].items():
        if chave not in CANOS:
            return f'chave desconhecida: {chave}'
        if not isinstance(lista, list) or len(lista) != CANOS[chave]:
            return f'"{chave}" precisa ter {CANOS[chave]} item(ns)'
        if any(p is not None and not _ponto(p) for p in lista):
            return f'"{chave}" tem um ponto inválido (use [x, y] numéricos)'
    return None


def formatar(dados):
    """JSON legível: uma linha por chave."""
    linhas = []
    for chave, lista in dados['canos'].items():
        itens = ','.join('null' if p is None else '[' + ','.join(f'{v:g}' for v in p) + ']' for p in lista)
        linhas.append(f'    "{chave}": [{itens}]')
    texto = '{\n  "versao": 1,\n  "canos": {\n' + ',\n'.join(linhas) + '\n  }'
    ocultos = dados.get('ocultos') or {}
    if ocultos:
        itens = [f'    "{c}": {{"de": {o["de"]}, "quadros": [{",".join(str(q) for q in sorted(o["quadros"]))}]}}' for c, o in sorted(ocultos.items())]
        texto += ',\n  "ocultos": {\n' + ',\n'.join(itens) + '\n  }'
    return texto + '\n}\n'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _host_ok(self):
        porta = self.server.server_address[1]
        validos = {f'localhost:{porta}', f'127.0.0.1:{porta}'}
        if self.headers.get('Host') not in validos:
            return False
        origem = self.headers.get('Origin')
        return origem is None or origem in {f'http://{h}' for h in validos}

    def _json(self, status, corpo):
        dados = json.dumps(corpo, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_POST(self):
        if self.path != '/api/sprite-config':
            return self._json(404, {'erro': 'rota inexistente'})
        if not self._host_ok():
            return self._json(403, {'erro': 'origem não permitida'})
        if (self.headers.get('Content-Type') or '').split(';')[0].strip() != 'application/json':
            return self._json(415, {'erro': 'envie application/json'})
        try:
            tamanho = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            tamanho = 0
        if not 0 < tamanho <= MAX_BYTES:
            return self._json(413, {'erro': 'corpo vazio ou grande demais'})
        try:
            dados = json.loads(self.rfile.read(tamanho).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self._json(400, {'erro': 'JSON inválido'})
        erro = validar(dados)
        if erro:
            return self._json(422, {'erro': erro})
        if CONFIG.exists():
            BACKUP.write_bytes(CONFIG.read_bytes())
        descritor, caminho = tempfile.mkstemp(dir=CONFIG.parent, suffix='.tmp')
        try:
            with os.fdopen(descritor, 'w', encoding='utf-8', newline='\n') as arquivo:
                arquivo.write(formatar(dados))
            os.replace(caminho, CONFIG)
        finally:
            if os.path.exists(caminho):
                os.unlink(caminho)
        self.log_message('sprite-config.json salvo')
        self._json(200, {'ok': True})

    def end_headers(self):
        # em desenvolvimento, nada de cache velho (vale também para o JSON editado)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    servidor = ThreadingHTTPServer(('127.0.0.1', porta), Handler)
    print(f'BULLETZ em http://localhost:{porta}  (Ctrl+C para parar)', flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
