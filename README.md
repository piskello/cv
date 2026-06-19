# CV — Matteo Maria Moretti

Repository pubblico del curriculum vitae in due lingue:

- [`EN.md`](EN.md) — versione inglese
- [`IT.md`](IT.md) — versione italiana

Il resto del CV (bio, posizioni, ricerca, teaching, ecc.) si modifica a mano. Le sezioni **publications** e **events** possono essere aggiornate in locale con uno script di sync che combina due sorgenti dati.

## Cosa fa lo sync

Lo script legge:

1. **Export IRIS** (`IRIS-export.csv`) — produzione scientifica da [IRIS](https://iris.uniss.it); integra metadati mancanti e aggiunge voci nuove (es. pubblicazioni recenti non ancora nel foglio).
2. **Google Spreadsheet** — fonte curata per pubblicazioni ed eventi; ha priorità su IRIS in caso di conflitto.

Poi rigenera solo i blocchi delimitati da marker HTML in `EN.md` e `IT.md`:

- `<!-- sync:publications:start -->` … `<!-- sync:publications:end -->`
- `<!-- sync:events:start -->` … `<!-- sync:events:end -->`

Le voci già presenti nel markdown restano formattate come nel CV (stile APA adottato nel repo). IRIS e foglio arricchiscono o aggiungono record; non modificano le altre sezioni.

## Workflow locale

```bash
npm install
npm run sync:dry   # anteprima in terminale, non scrive i file
npm run sync       # aggiorna EN.md e IT.md
```

Dopo la revisione, committa e pusha i file `.md` sul repo remoto:

```bash
git add EN.md IT.md
git commit -m "Update publications and events"
git push
```

## File solo in locale (non nel repo)

| File | Ruolo |
|------|--------|
| `IRIS-export.csv` | Export CSV da IRIS |
| `credentials.json` | Chiave service account Google (sola lettura) |
| `node_modules/` | Dipendenze npm |

Sono elencati in [`.gitignore`](.gitignore). **Non committare** credenziali né export IRIS: il repo è pubblico.

## Google Sheets (read-only)

1. Crea un service account in [Google Cloud Console](https://console.cloud.google.com/) e abilita **Google Sheets API**.
2. Scarica la chiave JSON e salvala come `credentials.json` nella root del progetto.
3. Condividi il foglio con l’email del service account come **Visualizzatore**.
4. Imposta gli ID tab (`gid`) in [`scripts/config.json`](scripts/config.json) sotto `tabs.publications` e `tabs.events`.

Lo script usa lo scope `spreadsheets.readonly`: non può modificare il foglio.

## Configurazione

- [`scripts/config.json`](scripts/config.json) — ID spreadsheet, mapping colonne, tipi IRIS, soglia anno per nuove voci da IRIS (`irisAddFromYear`).
- [`scripts/sync.mjs`](scripts/sync.mjs) — entry point del sync.

## Priorità delle sorgenti

| Sorgente | Ruolo |
|----------|--------|
| CV esistente (`EN.md` / `IT.md`) | Testo già curato conservato |
| Google Sheet | Fonte principale per elenco e override |
| IRIS | Integrazione metadati + voci mancanti (da anno configurato) |

In caso di dubbio su autori, titoli o sezione, correggi nello spreadsheet o direttamente nel markdown prima del push.
