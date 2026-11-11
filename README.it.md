# Ambilight

Un plugin per [Vencord](https://vencord.dev) che riempie le bande nere attorno alle live di Discord con un bagliore morbido preso dai bordi del video, come una TV Ambilight.

Se guardi una live 16:9 su un monitor ultrawide, o una live ultrawide su uno schermo 16:9, le bande vuote si accendono con i colori del gioco invece di restare nere.

[![Plugin Vencord](https://img.shields.io/badge/Vencord-plugin-f9a8d4)](https://vencord.dev)
![Piattaforma: Windows](https://img.shields.io/badge/piattaforma-Windows-f9a8d4)
[![Licenza: GPL-3.0](https://img.shields.io/badge/licenza-GPL--3.0-f9a8d4)](LICENSE)

**English:** [read the guide in English](README.md)

## Installazione veloce

Su Windows apri **PowerShell**, incolla questo e premi Invio:

```powershell
irm https://raw.githubusercontent.com/arakirae/Ambilight/main/install.ps1 | iex
```

Segui la finestra, poi chiudi Discord del tutto, riaprilo e attiva **Ambilight** in **Impostazioni utente → Vencord → Plugin**. Guida passo passo e altri modi per installarlo: [Installazione](#installazione).

## Cosa fa

- **Qualsiasi formato.** Bande ai lati (una live 16:9 su uno schermo ultrawide) o sopra e sotto (una live ultrawide su uno schermo 16:9): il bagliore si adatta da solo.
- **Si colora tutta l'area nera.** Quando guardi una live a grandezza piena, il bagliore riempie anche la fascia in alto col nome del server e la fila di avatar in basso. Non finisce mai sulla barra dei canali né sulla chat.
- **Live affiancate.** Se guardi due live una accanto all'altra, ognuna colora la sua metà, con una sfumatura morbida in mezzo.
- **Bordi morbidi.** Il bordo del video sfuma nel bagliore invece di finire con una linea netta.
- **Le live continuano dietro al menu Start.** Di solito, quando qualcosa copre la finestra di Discord, Windows la considera nascosta e Discord smette di disegnare la live. Ambilight la fa continuare. Se Discord è minimizzato, la live va in pausa come sempre, per risparmiare risorse.
- **Non tocca le griglie.** Nella vista a griglia con più persone non cambia niente.
- **Leggero.** Il bagliore si calcola da una copia del video di appena 160 px, 30 volte al secondo di base, e solo quando ci sono bande da riempire.

## Cosa non fa

- **Finestre separate delle live.** Le live aperte in una finestra a parte restano come sono.
- **Griglie con più riquadri.** Se la griglia mescola live e persone, le bande restano nere.
- **Modificare la live.** Colora solo lo spazio vuoto attorno al video: quello che vedi dentro al video, e quello che vedono gli altri, non cambia.

## Prima di iniziare

- **Windows** con l'**app desktop di Discord** (non il browser).
- **Vencord compilato dal codice sorgente.** I plugin come questo funzionano solo con un Vencord compilato da te. L'installer lo fa al posto tuo e mantiene le tue impostazioni di Vencord.

Il team di Vencord non dà supporto ai plugin personalizzati: per aiuto con Ambilight scrivi [qui](../../issues), non nel server di Vencord.

## Installazione

### Con un comando (il modo più veloce)

1. Apri **PowerShell**: premi Start, scrivi `powershell` e premi Invio.
2. Incolla questo e premi Invio:

   ```powershell
   irm https://raw.githubusercontent.com/arakirae/Ambilight/main/install.ps1 | iex
   ```

3. Segui la finestra. Installa quello che manca, scarica Ambilight e compila Vencord (può volerci qualche minuto). Quando chiede se installare Vencord in Discord, la prima volta rispondi **Y**, poi scegli il tuo Discord con le frecce e premi Invio.
4. Chiudi Discord del tutto: clic destro sulla sua icona vicino all'orologio → **Esci da Discord**. Poi riaprilo.
5. Vai in **Impostazioni utente → Vencord → Plugin**, cerca **Ambilight** e attivalo.
6. La prima volta, chiudi e riapri Discord del tutto ancora una volta. Serve ad attivare la parte che fa continuare le live dietro al menu Start.

Il comando scarica [install.ps1](install.ps1) da questo repository e lo esegue. È lo stesso installer che avvia Install.bat, e puoi leggerlo prima di eseguirlo.

### Automatica, con lo ZIP

1. Scarica **[Ambilight.zip](https://github.com/arakirae/Ambilight/releases/latest/download/Ambilight.zip)** dall'ultima release. Contiene solo quello che serve per installare.
2. Clic destro sullo ZIP → **Estrai tutto**.
3. Apri la cartella estratta e fai doppio clic su **Install.bat**.
   Se Windows mostra un avviso, clicca **Ulteriori informazioni → Esegui comunque** (o **Esegui**).
4. Segui la finestra. L'installer:
   - installa Git e Node.js se mancano (Windows potrebbe chiedere il permesso)
   - installa pnpm
   - aggiorna la tua cartella di Vencord se già lo compili dal codice sorgente (nella cartella utente o in Documenti), altrimenti scarica Vencord in `C:\Users\<tu>\Vencord`
   - aggiunge Ambilight e compila Vencord
   - chiede se installare Vencord in Discord: la prima volta rispondi **Y**, poi scegli il tuo Discord con le frecce e premi Invio
5. Chiudi Discord del tutto: clic destro sulla sua icona vicino all'orologio → **Esci da Discord**. Poi riaprilo.
6. Vai in **Impostazioni utente → Vencord → Plugin**, cerca **Ambilight** e attivalo, poi riavvia Discord del tutto ancora una volta.

### A mano (se già compili Vencord dal codice sorgente)

1. Nella cartella di Vencord crea `src\userplugins\ambilight`.
2. Mettici dentro `index.ts`, `ambilight.ts` e `native.ts` di questo repository.
3. Esegui `pnpm build` nella cartella di Vencord.
4. Riavvia Discord del tutto, attiva Ambilight, poi riavvia Discord del tutto ancora una volta.

Guida ufficiale di Vencord: [installare plugin personalizzati](https://docs.vencord.dev/installing/custom-plugins/).

## Impostazioni

Le impostazioni del plugin sono in inglese.

| Impostazione | Predefinito | Cosa fa |
|---|---|---|
| Streams and cameras | Attivo | Aggiunge il bagliore alle live e alle webcam nelle chiamate vocali |
| Videos in chat | Spento | Aggiunge il bagliore anche ai video allegati o incorporati nei messaggi |
| Side-by-side streams | Attivo | Quando guardi più live una accanto all'altra, ognuna colora la sua parte di schermo. Se spento, in questa situazione non c'è bagliore |
| Advanced settings | Spento | Mostra le regolazioni fini qui sotto |

Impostazioni avanzate:

| Impostazione | Predefinito | Cosa fa |
|---|---|---|
| Blur | 60 | Morbidezza del bagliore, in pixel |
| Saturation | 140% | Intensità dei colori del bagliore. Con 100% i colori restano invariati |
| Brightness | 110% | Luminosità del bagliore. Con 100% resta invariata |
| Video edge blending | 35 | Ampiezza, in pixel, della sfumatura tra il bordo del video e il bagliore. Con 0 il bordo resta netto |
| Sampling area | 12% | Quanta parte del bordo del video dà i colori delle bande. Valori più alti danno colori più stabili e morbidi |
| Fade to black | 20% | Quanto il bagliore si scurisce verso i bordi esterni dello schermo |
| Transition smoothness | 60% | Quanto lentamente il bagliore segue i cambi di colore. Valori più alti evitano lo sfarfallio |
| Updates per second | 30 | Ogni quanto si aggiorna il bagliore. Valori più bassi usano meno CPU e GPU |

Le modifiche si applicano subito, mentre guardi.

## Aggiornare

Incolla di nuovo il comando di installazione, oppure scarica di nuovo [Ambilight.zip](https://github.com/arakirae/Ambilight/releases/latest/download/Ambilight.zip) ed esegui **Install.bat**. Le impostazioni restano.

## Disinstallare

- Per spegnerlo, disattiva Ambilight in **Vencord → Plugin**, poi riavvia Discord del tutto.
- Per toglierlo, cancella la cartella `src\userplugins\ambilight` dentro la cartella di Vencord (di solito `C:\Users\<tu>\Vencord`), esegui `pnpm build` nella cartella di Vencord, poi riavvia Discord del tutto.

## Domande frequenti

**Ambilight si collega a internet?**
No. Fa tutto sul tuo PC, a partire dal video che Discord ti sta già mostrando. Solo l'installer scarica file: Vencord e questo plugin da GitHub.

**Chi trasmette vede il bagliore?**
No, è solo sul tuo schermo. Gli altri non hanno bisogno del plugin e per loro non cambia niente.

**Rallenta il PC?**
Pochissimo. I colori vengono da una copia del video di 160 px. Se lo vuoi ancora più leggero, abbassa **Updates per second** nelle impostazioni avanzate.

**Perché la prima volta bisogna riavviare Discord due volte?**
La parte che fa continuare le live dietro al menu Start va impostata prima che Discord apra la sua finestra, e solo se Ambilight è attivo. Il primo riavvio carica il plugin, il secondo attiva quella parte. Da lì in poi basta un avvio normale.

**Posso essere bannato?**
Le mod del client come Vencord vanno contro i Termini di servizio di Discord. Vencord dice che non si conoscono casi di utenti bannati per l'uso di mod del client, ma le usi a tuo rischio.

**Funziona nel browser, su Vesktop, macOS o Linux?**
È stato fatto e provato su Windows con l'app desktop di Discord. Il browser non è supportato e il resto non è stato provato.

**L'installer dice che qualcosa è andato storto.**
Il messaggio rosso dice cosa non ha funzionato. Il caso più comune è che Git o Node.js siano appena stati installati e Windows non li veda ancora: chiudi la finestra, apri una nuova finestra di PowerShell e incolla di nuovo il comando (o riesegui Install.bat). Se non va ancora, [apri una segnalazione](../../issues) con uno screenshot.

## Crediti

- Fatto da ARA.
- Basato su [Vencord](https://github.com/Vendicated/Vencord).
- Ispirato da [Ambient light for YouTube](https://github.com/WesselKroos/youtube-ambilight) di Wessel Kroos.

## Supporto

Ambilight è gratis. Se ti piace, puoi [offrirmi un caffè su Ko-fi](https://ko-fi.com/arakirae). Hai trovato un bug o hai un'idea? [Apri una segnalazione](../../issues).

## Licenza

[GPL-3.0-or-later](LICENSE). Puoi usare, modificare e condividere Ambilight liberamente, purché quello che condividi resti con la stessa licenza.

Ambilight non è affiliato a Discord, Vencord o Philips. Ambilight è un marchio di Philips: questo plugin ne prende solo l'idea.
