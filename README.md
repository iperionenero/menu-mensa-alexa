# Menu della mensa su Alexa

Skill Alexa che legge il menu della mensa (Menu Chiaro CIRFOOD, Comune di Cinisello Balsamo, menu **INFANZIA**).

> «Alexa, apri menu della mensa» → *«Oggi [nome] mangia crema di carote con riso, poi polpette di manzo al forno, con contorno di patate al forno. Per finire, frutta estiva.»*

Costo: **zero**, niente abbonamenti (il menu si aggiorna da un Mac di casa, GitHub ospita il file gratis, la skill Alexa-hosted rientra nel piano gratuito di Amazon).

## Come funziona

```
menuchiaro.it ──(ogni giorno, Mac con Chromium headless)──▶ data/menu.json su GitHub
                                                                          │
Echo ◀── skill Alexa-hosted (legge il JSON, fuso orario Europe/Rome) ◀────┘
```

Il sito Menu Chiaro è un'app Blazor Server: i piatti arrivano via websocket e non c'è un'API da interrogare. Per questo lo scraper apre la pagina in un browser vero, clicca i giorni del calendario (il sito mostra circa 10 giorni indietro e 10 avanti) e salva tutto in `data/menu.json`. Alexa legge solo quel file, quindi risponde in fretta e funziona anche se il sito è lento.

Perché sul Mac e non su GitHub Actions: Menu Chiaro risponde **403 Forbidden** agli IP dei datacenter (verificato il 21/10/2026 con i server di GitHub), mentre da una connessione normale funziona.

## Contenuto

| Percorso | A cosa serve |
|---|---|
| `scraper/scrape.mjs` | Legge il menu dal sito e scrive `data/menu.json` |
| `locale/` | Aggiornamento automatico sul Mac: `installa.sh`, `aggiorna.sh` (lanciato da macOS), `pubblica.mjs` (carica il file su GitHub), `disinstalla.sh` |
| `.github/workflows/aggiorna-menu.yml` | Versione GitHub Actions: solo manuale, perché il sito blocca i server di GitHub |
| `data/menu.json` | Il menu: già popolato con i dati reali dall'11 al 31 ottobre 2026 |
| `alexa/interaction-model-it-IT.json` | Modello vocale da incollare nella console Alexa (solo nella copia locale, non su GitHub) |
| `alexa/lambda/index.js`, `package.json` | Codice della skill da incollare nella console Alexa (solo nella copia locale, non su GitHub) |

## Installazione (circa 20 minuti)

### 1. Repository GitHub (fatto)

Repository pubblico `iperionenero/menu-mensa-alexa` (pubblico perché Alexa possa leggere il JSON senza credenziali). Il file letto da Alexa è:
`https://raw.githubusercontent.com/iperionenero/menu-mensa-alexa/main/data/menu.json`

### 1b. Aggiornamento automatico sul Mac

1. **Token GitHub** (solo per questo repository): <https://github.com/settings/personal-access-tokens/new> con l'account `iperionenero`
   - *Token name*: `menu-mensa-mac` — *Expiration*: la più lunga disponibile
   - *Repository access*: **Only select repositories** → `menu-mensa-alexa`
   - *Permissions* → *Repository permissions* → **Contents: Read and write** (il resto lascialo com'è)
   - *Generate token* e copialo.
2. Apri il **Terminale** e lancia:
   ```
   bash ~/Progetti/menu-mensa-alexa/locale/installa.sh
   ```
   Installa Playwright e Chromium, chiede il token (lo salva nel Portachiavi di macOS, non in un file), pianifica l'aggiornamento alle **6:40 e 13:10** e fa subito un giro di prova.

Se il Mac è spento o in stop all'orario previsto, macOS lancia l'aggiornamento al risveglio. Il sito mostra circa 10 giorni in avanti, quindi basta che il Mac sia acceso qualche volta a settimana.

### 2. Skill Alexa

1. Vai su <https://developer.amazon.com/alexa/console/ask> con **lo stesso account Amazon degli Echo**.
2. **Create Skill** → nome *Menu della mensa* → lingua **Italiano (IT)** → tipo **Custom** → hosting **Alexa-hosted (Node.js)**, regione **EU (Ireland)** → template *Start from scratch*.
3. **Build → Interaction Model → JSON Editor**: incolla `alexa/interaction-model-it-IT.json` → *Save* → *Build skill*.
4. **Code**: sostituisci `lambda/index.js` e `lambda/package.json` con quelli di `alexa/lambda/`. In cima a `index.js`:
   - `MENU_JSON_URL` punta già a questo repository;
   - `NOME_BAMBINO` controlla le frasi («[nome] mangia…»); con `''` diventano neutre.
   
   Poi **Save** → **Deploy**.
5. **Test** → abilita *Development* → scrivi «apri menu della mensa» per provarla.

Non serve pubblicarla: le skill in sviluppo funzionano già su tutti gli Echo collegati allo stesso account.

## Cosa puoi chiedere

- «Alexa, apri menu della mensa» → menu di oggi (se è sabato o domenica, del prossimo giorno di scuola)
- «Alexa, chiedi a menu della mensa cosa c'è domani»
- «Alexa, chiedi a menu della mensa cosa si mangia venerdì»
- «Alexa, chiedi a menu della mensa il menu della settimana»

**Comodo:** nell'app Alexa crea una *Routine* → Quando: «Alexa, cosa mangia [nome]» (o un orario, es. 7:30 nei giorni feriali) → Azione: *Skill* → *Le tue skill* → *Menu della mensa*.

## Manutenzione

- **Se l'aggiornamento fallisce** (es. CIRFOOD cambia il sito o il token scade) compare una notifica sul Mac e il dettaglio è in `logs/aggiorna.log`. Il file su GitHub non viene sovrascritto: Alexa continua a leggere gli ultimi dati validi (fino a ~10 giorni avanti). Lo scraper si ferma anche se il menu attivo non è INFANZIA o se legge meno di 3 giorni con piatti, per non pubblicare dati sbagliati.
- **Cambio menu** (es. passaggio alla primaria): in `scraper/scrape.mjs` modifica `menuId` e `menuName`. L'id si trova scegliendo il menu sul sito e guardando, negli strumenti sviluppatore del browser, il valore di `menuchiaro:selected-menu:…` in *Local Storage* (INFANZIA = `1006`). Per la primaria cambia anche l'URL (`Utenza`).
- **Token scaduto**: crea un token nuovo come al punto 1b e lancia `bash ~/Progetti/menu-mensa-alexa/locale/installa.sh --nuovo-token`.
- **Togliere tutto dal Mac**: `bash ~/Progetti/menu-mensa-alexa/locale/disinstalla.sh` (rimuove la pianificazione e il token dal Portachiavi).

## Note sui dati

- L'asterisco nei nomi dei piatti (es. `PISELLI*`) indica un prodotto surgelato: Alexa non lo legge.
- Nei giorni di piatto unico il sito mette `ACQUA` come secondo: la skill lo salta e dice «un piatto unico».
- I testi sono quelli del sito così come sono (es. a ottobre la frutta risulta ancora «frutta estiva»).
