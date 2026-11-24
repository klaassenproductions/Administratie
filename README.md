# Administratie (Klaassen Productions)

Facturen maken, bonnetjes bewaren, btw en belasting in beeld. Alles wordt opgeslagen in **jouw eigen Google Drive**.
Er is geen server en geen account bij deze app: de pagina praat alleen met Google. Op de website zelf staat alleen de code, nooit jouw data.

## Wat komt waar terecht
In je Drive maakt de app de map **Klaassen Productions Administratie** met daarin:
- `Facturen/` met de factuur-PDF's
- `Offertes/` met de offerte-PDF's
- `Bonnetjes/` met je geüploade bonnetjes
- `administratie-data.json` met klanten, facturen, bonnetjes en instellingen (dit is de bron voor het dashboard)

De app heeft alleen toegang tot bestanden die hij zelf heeft aangemaakt (Google-scope `drive.file`). Je andere Drive-bestanden kan hij niet zien. Bonnetjes die al in je Drive staan, zie je dus niet in de app: upload ze via het tabblad Bonnetjes.

## Eenmalig instellen (ongeveer 15 minuten)

### 1. Google-koppeling aanmaken (gratis)
1. Ga naar https://console.cloud.google.com en log in met je eigen Google-account. Maak een nieuw project, bijvoorbeeld "Administratie".
2. Zoek bij **APIs & Services > Library** naar **Google Drive API** en klik **Enable**.
3. Ga naar **Google Auth Platform** (of "OAuth consent screen") en kies:
   - Gebruikerstype: **Extern**
   - Appnaam: "Administratie", e-mail: die van jou
   - Onder **Doelgroep/Audience**: laat de status op **Testen** staan en voeg je eigen Gmail-adres toe als **testgebruiker**
   - Onder **Gegevenstoegang/Data access**: voeg de scope `https://www.googleapis.com/auth/drive.file` toe
4. Ga naar **Clients > Client maken**. Type: **Webtoepassing**. Bij **Geautoriseerde JavaScript-bronnen** vul je het adres van je website in (stap 2), zonder pad, bijvoorbeeld `https://jouwnaam.github.io`.
5. Kopieer de **Client-ID** (eindigt op `.apps.googleusercontent.com`). Dit is geen wachtwoord.

### 2. De app online zetten (GitHub Pages, gratis)
1. Maak op https://github.com een account en een nieuwe **publieke** repository, bijvoorbeeld `administratie`. Er staat geen data of geheim in de code.
2. Kies **Add file > Upload files** en sleep alle bestanden en mappen uit deze map erin (`index.html`, `app.js`, `drive.js`, `pdf.js`, `tax.js`, `style.css`, mappen `vendor` en `fonts`). Klik **Commit changes**.
3. Ga naar **Settings > Pages**. Kies bij Source **Deploy from a branch**, branch `main`, map `/ (root)`. Na een minuut staat de app op `https://jouwnaam.github.io/administratie/`.
4. Staat jouw adres anders dan in stap 1.4? Pas de JavaScript-bron daar aan.

### 3. Voor het eerst gebruiken
1. Open de site, plak je Client-ID en klik **Verbinden met Google Drive**.
2. Google toont "Google heeft deze app niet geverifieerd". Dat klopt: het is jouw eigen app. Kies **Geavanceerd > Doorgaan** en geef toegang.
3. Vul bij **Instellingen** je bedrijfsgegevens, bruto jaarloon en het urencriterium in. Daarna kun je facturen maken.

Je moet na een tijdje opnieuw op "Verbinden" klikken. Google laat testapps na ongeveer een week opnieuw inloggen. Je gegevens blijven gewoon in Drive staan.

## Hoe de schatting werkt (indicatie, geen advies)
- **Btw opzij**: btw op je facturen min de btw op je bonnetjes (voorbelasting), op factuur- en bondatum.
- **Inkomstenbelasting**: winst (omzet min kosten, beide excl. btw) wordt opgeteld bij je loon en belast met de box 1-schijven van 2026 (35,75% / 37,56% / 49,50%), na aftrek van de MKB-winstvrijstelling (12,7%). Zelfstandigenaftrek (€ 1.200) en startersaftrek (€ 2.123) tellen alleen mee als je bij Instellingen "Ja" kiest bij het urencriterium. Bij "Weet ik nog niet" rekent de app zonder aftrek, en laat hij zien wat het scheelt als je het wel haalt.
- **Zvw**: 4,85% over de winst, tot het gezamenlijke maximum van € 79.409 (je loon telt mee).
- **Niet meegerekend**: heffingskortingen, investeringsaftrek, fiscale oudedagsreserve, verliesverrekening. Voor je echte aangifte blijft de Belastingdienst of je boekhouder leidend.
- De bedragen staan bovenin `tax.js`. Pas ze aan als de regels in 2027 veranderen (de zelfstandigenaftrek daalt dan naar € 900 en de startersaftrek vervalt).

## Veiligheid
- De pagina mag alleen verbinden met Google (Content-Security-Policy in `index.html`).
- Het Google-token blijft in het geheugen van je browser. Alleen je Client-ID wordt in je browser onthouden.
- Alle bibliotheken (PDF-maker, lettertype) staan lokaal in de map `vendor` en `fonts`. Alleen het Google-inlogscript komt van Google zelf.
- Maak af en toe een back-up via **Instellingen > Back-up downloaden**.
