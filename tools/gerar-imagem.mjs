#!/usr/bin/env node
// Gera imagens com a API da OpenAI e salva direto no projeto.
// Sem dependências: usa apenas o Node 21.7+ (fetch, FormData e loadEnvFile nativos).
//
// Uso:
//   node tools/gerar-imagem.mjs "prompt" [opções]
//
// Opções:
//   --out <arquivo>      Caminho de saída (padrão: assets/gerado/<slug>-<data>.png)
//   --size <LxA>         1024x1024 | 1536x1024 | 1024x1536 | auto   (padrão: 1024x1024)
//   --quality <q>        low | medium | high | auto                (padrão: medium)
//   --transparent        Fundo transparente (ideal para sprites)
//   --ref <arquivo>      Imagem de referência; pode repetir (usa o endpoint de edição)
//   --n <número>         Quantas variações gerar (padrão: 1)
//   --model <id>         Modelo (padrão: OPENAI_IMAGE_MODEL ou gpt-image-2)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.join(RAIZ, '.env');
if (existsSync(ENV)) process.loadEnvFile(ENV);

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

class Falha extends Error {}
function falhar(msg) {
  throw new Falha(msg);
}

function lerArgs(argv) {
  const o = { prompt: [], refs: [], size: '1024x1024', quality: 'medium', n: 1, transparent: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => argv[++i] ?? falhar(`Faltou o valor de ${a}`);
    if (a === '--out') o.out = valor();
    else if (a === '--size') o.size = valor();
    else if (a === '--quality') o.quality = valor();
    else if (a === '--model') o.model = valor();
    else if (a === '--n') o.n = Number(valor());
    else if (a === '--ref') o.refs.push(valor());
    else if (a === '--transparent') o.transparent = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) falhar(`Opção desconhecida: ${a}`);
    else o.prompt.push(a);
  }
  o.prompt = o.prompt.join(' ').trim();
  return o;
}

function slug(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'imagem';
}

// Sem process.exit(): encerrar à força com o fetch aberto derruba o Node no Windows.
async function main() {
const o = lerArgs(process.argv.slice(2));

if (o.help || !o.prompt) {
  console.log((await readFile(fileURLToPath(import.meta.url), 'utf8'))
    .split('\n').slice(1, 16).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exitCode = o.help ? 0 : 1;
  return;
}

const chave = process.env.OPENAI_API_KEY;
if (!chave) falhar('OPENAI_API_KEY não encontrada. Copie .env.example para .env e cole sua chave lá.');
if (!Number.isInteger(o.n) || o.n < 1 || o.n > 10) falhar('--n deve ser um número de 1 a 10.');

const modelo = o.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const formato = o.out && path.extname(o.out).toLowerCase() === '.webp' ? 'webp' : 'png';
const campos = {
  model: modelo,
  prompt: o.prompt,
  size: o.size,
  quality: o.quality,
  n: o.n,
  output_format: formato,
  ...(o.transparent && { background: 'transparent' }),
};

let url, init;
if (o.refs.length) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, String(v));
  for (const ref of o.refs) {
    const arq = path.resolve(RAIZ, ref);
    if (!existsSync(arq)) falhar(`Referência não encontrada: ${ref}`);
    const tipo = MIME[path.extname(arq).toLowerCase()] ?? falhar(`Formato não suportado em --ref: ${ref}`);
    form.append('image[]', new Blob([await readFile(arq)], { type: tipo }), path.basename(arq));
  }
  url = 'https://api.openai.com/v1/images/edits';
  init = { method: 'POST', headers: { Authorization: `Bearer ${chave}` }, body: form };
} else {
  url = 'https://api.openai.com/v1/images/generations';
  init = {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(campos),
  };
}

console.log(`Gerando ${o.n} imagem(ns) com ${modelo} (${o.size}, ${o.quality}${o.refs.length ? `, ${o.refs.length} ref.` : ''})...`);
const inicio = Date.now();

let resp;
try {
  resp = await fetch(url, init);
} catch (e) {
  falhar(`Falha de rede ao chamar a OpenAI: ${e.cause?.message || e.message}`);
}
const corpo = await resp.json().catch(() => null);
if (!resp.ok) falhar(`OpenAI respondeu ${resp.status}: ${corpo?.error?.message || resp.statusText}`);

const imagens = corpo?.data?.filter(d => d.b64_json) ?? [];
if (!imagens.length) falhar('A resposta não trouxe nenhuma imagem.');

const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const base = path.resolve(RAIZ, o.out || path.join('assets', 'gerado', `${slug(o.prompt)}-${carimbo}.${formato}`));
await mkdir(path.dirname(base), { recursive: true });

for (const [i, img] of imagens.entries()) {
  const ext = path.extname(base);
  const destino = imagens.length > 1 ? `${base.slice(0, -ext.length)}-${i + 1}${ext}` : base;
  await writeFile(destino, Buffer.from(img.b64_json, 'base64'));
  console.log(`✔ ${path.relative(RAIZ, destino)}`);
}

const uso = corpo.usage ? ` · ${corpo.usage.total_tokens} tokens` : '';
console.log(`Pronto em ${((Date.now() - inicio) / 1000).toFixed(1)}s${uso}`);
}

main().catch(e => {
  if (!(e instanceof Falha)) throw e;
  console.error(`
✖ ${e.message}
`);
  process.exitCode = 1;
});
