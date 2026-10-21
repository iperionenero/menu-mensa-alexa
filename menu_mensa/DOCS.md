# Menu mensa

Legge il menu della mensa da Menu Chiaro (CIRFOOD, Comune di Cinisello Balsamo, menu INFANZIA) e pubblica `data/menu.json` sul repository GitHub. La skill Alexa «Menu della mensa» legge quel file.

## Configurazione

- **Token GitHub**: token fine-grained limitato al repository `menu-mensa-alexa`, con permesso *Contents: Read and write*.
- **Orari di aggiornamento**: in ora italiana. Di default 06:40 e 13:10. L'add-on aggiorna anche ogni volta che parte.
- **Repository GitHub**: lascia `iperionenero/menu-mensa-alexa`.

## Cosa succede

A ogni aggiornamento l'add-on apre il sito in un Chromium senza finestra, legge circa 10 giorni indietro e 10 avanti e carica il file su GitHub solo se il menu è cambiato.

Se qualcosa va storto compare una notifica in Home Assistant e il dettaglio è nel registro dell'add-on. Il file su GitHub non viene toccato, quindi Alexa continua a leggere gli ultimi dati validi. La notifica sparisce da sola al primo aggiornamento riuscito.

Per forzare un aggiornamento basta riavviare l'add-on.
