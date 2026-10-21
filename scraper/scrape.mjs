// Scarica il menu della mensa da Menu Chiaro (CIRFOOD) e lo salva in data/menu.json.
// Il sito è un'app Blazor Server: i piatti arrivano via websocket, non c'è un'API,
// quindi apriamo la pagina in un Chromium headless e clicchiamo i giorni del calendario.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const CONFIG = {
  url: process.env.MENU_URL ||
    'https://www.menuchiaro.it/cinisellobalsamo/it#/MenuDettaglio/MTA2ODA2X01JQ0lJTg==/Utenza/SU5G',
  customerCode: process.env.MENU_CUSTOMER || '5f81c021-30aa-4df0-9462-899f17ba289d', // Comune di Cinisello Balsamo
  menuId: process.env.MENU_ID || '1006',            // id interno del menu INFANZIA
  menuName: process.env.MENU_NAME || 'INFANZIA',     // nome mostrato sul sito, usato come controllo
  out: process.env.OUT || 'data/menu.json',
  keepDays: 30,                                      // giorni passati da conservare nel file
};

// Valore che il sito salva quando il tour iniziale è già stato visto (JSON in esadecimale)
const ONBOARDING_DONE = Buffer.from(JSON.stringify({
  Version: 1,
  ViewedSteps: ['Welcome', 'DatePicker', 'MenuSelection', 'MenuSwitch', 'DishTransparency', 'SideMenu'],
})).toString('hex').toUpperCase();

function todayRome() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()); // YYYY-MM-DD
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Il calendario mostra giorni consecutivi: la data di ogni pulsante si ricava dalla
// distanza dal pulsante "Oggi". Se il giorno del mese non torna, si usa la data più vicina.
export function labelsToDates(labels, today) {
  const iToday = labels.findIndex(l => /^oggi\b/i.test(l.trim()));
  return labels.map((label, i) => {
    const dom = parseInt(label.replace(/\D+/g, ' ').trim().split(' ').pop(), 10);
    if (iToday >= 0) {
      const guess = addDays(today, i - iToday);
      if (parseInt(guess.slice(8), 10) === dom) return guess;
    }
    for (let k = 0; k <= 31; k++) {
      for (const s of [k, -k]) {
        const c = addDays(today, s);
        if (parseInt(c.slice(8), 10) === dom) return c;
      }
    }
    throw new Error(`Impossibile datare il pulsante "${label}"`);
  });
}

// Eseguito dentro la pagina: clicca ogni giorno del calendario e legge i piatti.
// È lo stesso ciclo verificato a mano sul sito il 21/10/2026.
async function readAllDaysInPage() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const buttons = () => [...document.querySelectorAll('.btn-calendar-day')];
  const read = () => [...document.querySelectorAll('.card-menu-item')].map(c => ({
    category: norm(c.querySelector('.menu-item-category')?.textContent),
    dish: norm(c.querySelector('.card-title')?.textContent),
  }));
  const labels = buttons().map(b => norm(b.innerText));
  const result = [];
  for (let i = 0; i < labels.length; i++) {
    const b = buttons()[i];
    if (!b) { result.push({ label: labels[i], error: 'pulsante sparito' }); continue; }
    if (b.disabled) { result.push({ label: labels[i], closed: true, items: [] }); continue; }
    const before = JSON.stringify(read());
    b.click();
    let last = '', stable = 0, cur = '';
    for (let t = 0; t < 75; t++) {               // fino a ~15 secondi per giorno
      await sleep(200);
      cur = JSON.stringify(read());
      if (cur === last) stable++; else { stable = 0; last = cur; }
      const active = buttons()[i]?.classList.contains('active');
      const loaded = cur !== '[]' || t > 40;     // lista vuota = ancora in caricamento (o giorno senza piatti)
      if (stable >= 3 && active && loaded && (cur !== before || t > 15)) break;
    }
    result.push({ label: labels[i], closed: false, items: read() });
  }
  return { labels, result };
}

async function main() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome' });
  await context.addInitScript(({ cc, id, onb }) => {
    try {
      localStorage.setItem(`menuchiaro:onboarding:${cc}`, onb);
      localStorage.setItem(`menuchiaro:selected-menu:${cc}`, id);
      localStorage.setItem(`menuchiaro:visible-menus:${cc}`, id);
    } catch (e) { /* ignora */ }
  }, { cc: CONFIG.customerCode, id: CONFIG.menuId, onb: ONBOARDING_DONE });

  const page = await context.newPage();
  await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.btn-calendar-day', { timeout: 60000 });

  // Se compare comunque la scelta dei menu, seleziona quello giusto e conferma
  const chooser = page.getByText('Scegli i menù da visualizzare');
  if (await chooser.isVisible().catch(() => false)) {
    await page.getByText(CONFIG.menuName, { exact: true }).first().click();
    await page.getByRole('button', { name: /conferma/i }).click();
  }

  await page.waitForSelector('.card-menu-item', { timeout: 60000 });

  // Controllo: il menu attivo deve essere quello giusto, altrimenti non si pubblica nulla
  const activeMenu = (await page.locator('.toolbar .btn-outline-primary.active').first().innerText()).trim();
  if (activeMenu.toUpperCase() !== CONFIG.menuName.toUpperCase()) {
    throw new Error(`Menu attivo "${activeMenu}" invece di "${CONFIG.menuName}": non aggiorno il file`);
  }

  const { labels, result } = await page.evaluate(readAllDaysInPage);
  await browser.close();

  const today = todayRome();
  const dates = labelsToDates(labels, today);

  const fresh = {};
  result.forEach((r, i) => {
    if (r.error) return;
    fresh[dates[i]] = r.closed ? { closed: true, items: [] } : { closed: false, items: r.items };
  });

  const openWithFood = Object.values(fresh).filter(d => !d.closed && d.items.length).length;
  if (openWithFood < 3) {
    throw new Error(`Solo ${openWithFood} giorni con piatti: probabile errore di lettura, non aggiorno il file`);
  }

  // Unisce con i giorni già salvati (tiene lo storico recente) e scarta quelli vecchi
  let previous = { days: {} };
  try { previous = JSON.parse(await fs.readFile(CONFIG.out, 'utf8')); } catch { /* primo giro */ }
  const oldest = addDays(today, -CONFIG.keepDays);
  const days = { ...(previous.days || {}), ...fresh };
  const sorted = Object.fromEntries(Object.keys(days).filter(d => d >= oldest).sort().map(d => [d, days[d]]));

  const output = {
    menu: CONFIG.menuName,
    source: CONFIG.url,
    updated_at: new Date().toISOString(),
    days: sorted,
  };
  await fs.mkdir(path.dirname(CONFIG.out), { recursive: true });
  await fs.writeFile(CONFIG.out, JSON.stringify(output, null, 2) + '\n');
  console.log(`OK: ${Object.keys(fresh).length} giorni letti (${openWithFood} con piatti), file ${CONFIG.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
