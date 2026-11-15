# BULLETZ — Divorced Dad Rock

Jogo de plataforma e tiro em pixel art que roda no navegador. Ano 1987: os EX-TERMINADORES dominam o mundo com pensões intergalácticas e boletos infinitos, e a unidade BULLETZ precisa derrubar o Dr. Alimônio.

**Fase 1 · A Cidade dos Boletos**: três setores (Cidade dos Boletos, Viadutos da Pensão e Distrito dos Juros), com plataformas móveis, Patrulheiros Elite, Drones Elite e o chefe O Cobrador.

## Como jogar localmente

O jogo usa módulos JavaScript e áudio, então precisa de um servidor local (abrir o `index.html` com duplo clique não funciona):

```bash
python tools/servidor.py 8787
```

`tools/servidor.py` serve o jogo e deixa a tela de sprites (`sprites.html`) salvar edições permanentes, como a posição do cano de cada arma, em `assets/sprite-config.json`. Com `python -m http.server` o jogo roda igual, mas a tela de sprites só consegue baixar o JSON em vez de salvar.

Depois abra http://localhost:8787 e clique em **INICIAR JOGO**.

## Controles

| Ação | Teclado | Controle |
| --- | --- | --- |
| Correr | ← → | Analógico ou direcional |
| Saltar | Espaço | A / ✕ |
| Agachar | ↓ ou S | ↓ |
| Disparar | G | X / □ |
| Menu (pausa) | ESC | Menu / Options |
| Reiniciar | R | pelo menu |

## Estrutura

- `index.html`, `style.css`, `game.js`: o jogo
- `assets/`: sprites, retratos do HUD, cenário, sons e logo usados no jogo
- `GRAPHIC/` e `FX SOUND/`: artes e sons originais em alta resolução

Para testar trechos da fase, abra `http://localhost:8787/?debug` e use no console `bulletz.warp(5500)` (teleporta) e `bulletz.god = true` (ignora tiros).
