// Servizio dell'add-on Home Assistant: aggiorna il menu all'avvio e poi agli orari scelti
// (ora italiana). Ogni aggiornamento lancia locale/pubblica.mjs, che legge il menu da
// Menu Chiaro e, se è cambiato, lo carica su GitHub. Se fallisce compare una notifica in Home Assistant.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OPTIONS_PATH = process.env.OPTIONS_PATH || '/data/options.json';
const TZ = 'Europe/Rome';
const NOTIFICA_ID = 'menu_mensa_errore';
const TIMEOUT_MS = 10 * 60 * 1000;
// Errori passeggeri (es. rete del container non ancora pronta all'avvio): riprova prima di arrendersi
const TENTATIVI = Number(process.env.TENTATIVI || 3);
const PAUSA_TENTATIVI_MS = Number(process.env.PAUSA_TENTATIVI_MS || 60 * 1000);

const log = (...a) => console.log(`[${adesso().giorno} ${adesso().ora}]`, ...a);

function adesso() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { giorno: `${p.year}-${p.month}-${p.day}`, ora: `${p.hour}:${p.minute}` };
}

function leggiOpzioni() {
  const o = JSON.parse(fs.readFileSync(OPTIONS_PATH, 'utf8'));
  const orari = [...new Set((o.orari || []).map(s => String(s).trim()))].sort();
  return { token: (o.github_token || '').trim(), orari, repository: o.repository };
}

// ─── Notifiche in Home Assistant (solo dentro l'add-on, dove c'è SUPERVISOR_TOKEN) ───
async function servizioHA(servizio, dati) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return;
  try {
    const r = await fetch(`http://supervisor/core/api/services/persistent_notification/${servizio}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dati),
    });
    if (!r.ok) log(`Notifica Home Assistant non riuscita (${r.status})`);
  } catch (e) {
    log('Notifica Home Assistant non riuscita:', e.message);
  }
}

// ─── Un aggiornamento ─────────────────────────────────────────────────────────
let inCorso = false;
let ultimoErrore = false;

function eseguiPubblica(opzioni) {
  return new Promise(resolve => {
    const figlio = spawn(process.execPath, [path.join(ROOT, 'locale/pubblica.mjs')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, GITHUB_TOKEN: opzioni.token, REPO: opzioni.repository },
    });
    const timer = setTimeout(() => { log('Tempo scaduto: interrompo.'); figlio.kill('SIGKILL'); }, TIMEOUT_MS);
    figlio.on('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
    figlio.on('error', e => { clearTimeout(timer); log(e.message); resolve(1); });
  });
}

async function aggiorna(opzioni, motivo) {
  if (inCorso) { log(`Aggiornamento già in corso, salto (${motivo}).`); return; }
  inCorso = true;
  log(`Aggiornamento (${motivo})...`);
  try {
    let rc = 1;
    for (let tentativo = 1; tentativo <= TENTATIVI; tentativo++) {
      rc = await eseguiPubblica(opzioni);
      if (rc === 0 || tentativo === TENTATIVI) break;
      log(`Tentativo ${tentativo} di ${TENTATIVI} non riuscito: riprovo tra un minuto.`);
      await new Promise(r => setTimeout(r, PAUSA_TENTATIVI_MS));
    }
    if (rc === 0) {
      log('Aggiornamento riuscito.');
      // sempre, anche dopo un riavvio: l'errore può essere di un'esecuzione precedente
      await servizioHA('dismiss', { notification_id: NOTIFICA_ID });
      ultimoErrore = false;
    } else {
      log(`ERRORE: aggiornamento non riuscito (codice ${rc}).`);
      ultimoErrore = true;
      await servizioHA('create', {
        notification_id: NOTIFICA_ID,
        title: 'Menu mensa',
        message: 'Aggiornamento del menu non riuscito. Alexa continua a leggere gli ultimi dati validi. '
          + 'Dettagli nel registro dell\'add-on «Menu mensa».',
      });
    }
  } finally {
    inCorso = false;
  }
}

// ─── Avvio e pianificazione ───────────────────────────────────────────────────
async function main() {
  const opzioni = leggiOpzioni();
  if (!opzioni.token) {
    log('Manca il token GitHub: inseriscilo nella scheda Configurazione dell\'add-on e riavvialo.');
    await servizioHA('create', {
      notification_id: NOTIFICA_ID, title: 'Menu mensa',
      message: 'Manca il token GitHub nella configurazione dell\'add-on «Menu mensa».',
    });
    process.exit(1);
  }
  log(`Orari di aggiornamento (ora italiana): ${opzioni.orari.join(', ') || 'nessuno'}. Repository: ${opzioni.repository}.`);

  if (process.argv.includes('--una-volta')) {
    await aggiorna(opzioni, 'manuale');
    process.exit(ultimoErrore ? 1 : 0);
  }

  const fatti = new Set();
  await aggiorna(opzioni, 'avvio');
  setInterval(() => {
    const { giorno, ora } = adesso();
    const chiave = `${giorno} ${ora}`;
    if (opzioni.orari.includes(ora) && !fatti.has(chiave)) {
      fatti.add(chiave);
      aggiorna(opzioni, `orario ${ora}`);
    }
  }, 20 * 1000);
}

for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { log('Arresto.'); process.exit(0); });

main().catch(e => { log('Errore imprevisto:', e.stack || e.message); process.exit(1); });
