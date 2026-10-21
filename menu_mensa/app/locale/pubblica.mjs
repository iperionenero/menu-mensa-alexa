// Scarica il menu.json attuale dal repo, lancia lo scraper
// (che unisce i giorni nuovi a quelli vecchi) e, se il menu è cambiato,
// carica il file aggiornato su GitHub tramite API (niente git, niente credenziali di lavoro).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.REPO || 'iperionenero/menu-mensa-alexa';
const FILE = 'data/menu.json';
const BRANCH = process.env.BRANCH || 'main';
const API = process.env.GITHUB_API || 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) throw new Error('GITHUB_TOKEN mancante');

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'menu-mensa-alexa',
};
const url = `${API}/repos/${REPO}/contents/${FILE}`;

async function leggiRemoto() {
  const r = await fetch(`${url}?ref=${BRANCH}`, { headers });
  if (r.status === 404) return { sha: undefined, text: null };
  if (r.status === 401) throw new Error('GitHub: token non valido o scaduto (401). Creane uno nuovo, inseriscilo nella configurazione dell\'add-on e riavvialo');
  if (!r.ok) throw new Error(`GitHub GET ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { sha: j.sha, text: Buffer.from(j.content, 'base64').toString('utf8') };
}

const soloGiorni = t => { try { return JSON.stringify(JSON.parse(t).days); } catch { return null; } };

const remoto = await leggiRemoto();
const locale = path.join(ROOT, FILE);
fs.mkdirSync(path.dirname(locale), { recursive: true });
if (remoto.text) fs.writeFileSync(locale, remoto.text);

const run = spawnSync(process.execPath, [path.join(ROOT, 'scraper/scrape.mjs')], {
  cwd: ROOT, stdio: 'inherit', env: process.env,
});
if (run.status !== 0) throw new Error(`Lo scraper è uscito con codice ${run.status}: menu non aggiornato`);

const nuovo = fs.readFileSync(locale, 'utf8');
if (remoto.text && soloGiorni(nuovo) === soloGiorni(remoto.text)) {
  console.log('Menu invariato: niente da caricare.');
} else {
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Menu aggiornato ${oggi}`,
      content: Buffer.from(nuovo, 'utf8').toString('base64'),
      sha: remoto.sha,
      branch: BRANCH,
    }),
  });
  if (r.status === 401 || r.status === 403) {
    throw new Error(`GitHub: permessi insufficienti (${r.status}). Il token deve avere "Contents: Read and write" su ${REPO}`);
  }
  if (!r.ok) throw new Error(`GitHub PUT ${r.status}: ${await r.text()}`);
  console.log('Menu caricato su GitHub.');
}
