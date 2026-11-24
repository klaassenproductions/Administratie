(function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var s = String(v).trim(); if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? 0 : n; }
  var F = Fact, eur = F.eur, r2 = F.r2;
  function vandaag() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  var app = $('#app');
  var backend = null, data = null, view = 'dashboard', jaar = new Date().getFullYear();
  var status = { t: '', k: '' }, queue = Promise.resolve(), melding = null, demo = false;

  /* ---------- opslaan ---------- */
  function bewaar() {
    status = { t: 'Opslaan…', k: 'warn' }; paintStatus();
    queue = queue.then(function () { return backend.bewaar(data); }).then(function () {
      status = { t: demo ? 'Demo: niet opgeslagen' : 'Opgeslagen in Drive', k: demo ? 'warn' : 'ok' }; paintStatus();
    }).catch(function (e) {
      status = { t: 'Opslaan mislukt', k: 'bad' }; paintStatus(); toon('Opslaan mislukt: ' + e.message, 'err');
    });
    return queue;
  }
  function paintStatus() { var el = $('#status'); if (el) { el.textContent = status.t; el.className = 'pill ' + status.k; } }
  function toon(t, k) { melding = { t: t, k: k || '' }; var el = $('#melding'); if (el) el.innerHTML = meldingHtml(); }
  function meldingHtml() { return melding ? '<div class="notice ' + melding.k + '">' + esc(melding.t) + '</div>' : ''; }

  /* ---------- start ---------- */
  function welkom(fout) {
    var cid = '';
    try { cid = localStorage.getItem('gcid') || ''; } catch (e) {}
    app.innerHTML = '<div class="wrap"><div class="welcome"><h1>Administratie</h1>' +
      '<p class="hint">Facturen, bonnetjes, btw en belasting. Je gegevens gaan alleen tussen deze pagina en jouw eigen Google Drive.</p>' +
      (fout ? '<div class="notice err">' + esc(fout) + '</div>' : '') +
      '<div class="card"><div class="f"><label for="cid">Google Client-ID</label><input id="cid" placeholder="123456-abc.apps.googleusercontent.com" value="' + esc(cid) + '"></div>' +
      '<div class="row"><button class="b" id="go">Verbinden met Google Drive</button><button class="b sec" id="demo">Demo bekijken</button></div>' +
      '<p class="hint">De Client-ID is een eenmalige koppeling die jij aanmaakt in Google Cloud (zie handleiding). Hij is geen wachtwoord.</p></div></div></div>';
    $('#go').onclick = async function () {
      var id = $('#cid').value.trim();
      if (!id) return welkom('Vul eerst je Google Client-ID in.');
      try { localStorage.setItem('gcid', id); } catch (e) {}
      this.disabled = true; this.textContent = 'Verbinden…';
      try {
        backend = new Opslag.GoogleBackend(id); demo = false;
        await backend.verbind(); data = await backend.laad();
        status = { t: 'Verbonden met Drive', k: 'ok' };
        if (!data.instellingen.kvk) view = 'instellingen';
        render();
      } catch (e) { welkom('Verbinden mislukt: ' + e.message); }
    };
    $('#demo').onclick = async function () {
      backend = new Opslag.DemoBackend(); demo = true; data = await backend.laad();
      status = { t: 'Demo: niet opgeslagen', k: 'warn' }; render();
    };
  }

  /* ---------- schil ---------- */
  var TABS = [['dashboard', 'Dashboard'], ['facturen', 'Facturen'], ['bonnetjes', 'Bonnetjes'], ['instellingen', 'Instellingen']];
  function render() {
    var v = VIEWS[view === 'nieuw' ? 'nieuw' : view]();
    app.innerHTML = '<header class="top"><div class="wrap"><div class="brand">' + esc(data.instellingen.naam || 'Administratie') +
      '<small>Administratie</small></div><span id="status" class="pill ' + status.k + '">' + esc(status.t) + '</span><nav>' +
      TABS.map(function (t) { return '<button data-v="' + t[0] + '" class="' + ((view === t[0] || (view === 'nieuw' && t[0] === 'facturen')) ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') +
      '</nav></div></header><main><div class="wrap"><div id="melding">' + meldingHtml() + '</div>' + v.html + '</div></main>';
    $$('nav button').forEach(function (b) { b.onclick = function () { view = b.dataset.v; melding = null; render(); window.scrollTo(0, 0); }; });
    if (v.after) v.after();
  }
  function ga(v) { view = v; render(); window.scrollTo(0, 0); }

  /* ---------- berekeningen ---------- */
  function jaarVan(iso) { return parseInt((iso || '').slice(0, 4), 10); }
  function jaren() {
    var s = {}; s[new Date().getFullYear()] = 1;
    data.facturen.forEach(function (f) { s[jaarVan(f.datum)] = 1; });
    data.bonnetjes.forEach(function (b) { s[jaarVan(b.datum)] = 1; });
    return Object.keys(s).map(Number).sort(function (a, b) { return b - a; });
  }
  function bereken(j) {
    var i = data.instellingen;
    var facs = data.facturen.filter(function (f) { return jaarVan(f.datum) === j; });
    var bons = data.bonnetjes.filter(function (b) { return jaarVan(b.datum) === j; });
    var omzet = 0, btwOnt = 0, open = 0, betaald = 0;
    var kw = [0, 1, 2, 3].map(function () { return { ont: 0, voor: 0 }; });
    facs.forEach(function (f) {
      var t = F.totalen(f); omzet += t.sub; btwOnt += t.btw;
      if (f.status === 'betaald') betaald += t.totaal; else open += t.totaal;
      kw[Math.floor((parseInt(f.datum.slice(5, 7), 10) - 1) / 3)].ont += t.btw;
    });
    var kosten = 0, voorb = 0;
    bons.forEach(function (b) {
      kosten += r2(b.bedragIncl - b.btwBedrag); voorb += +b.btwBedrag;
      kw[Math.floor((parseInt(b.datum.slice(5, 7), 10) - 1) / 3)].voor += +b.btwBedrag;
    });
    omzet = r2(omzet); kosten = r2(kosten); btwOnt = r2(btwOnt); voorb = r2(voorb);
    var winst = r2(omzet - kosten);
    var loon = +i.loon || 0, starter = !!i.starter;
    var nee = Tax.schatting({ winst: winst, loon: loon, urencriterium: false, starter: starter });
    var ja = Tax.schatting({ winst: winst, loon: loon, urencriterium: true, starter: starter });
    var hoofd = i.urencriterium === 'ja' ? ja : nee;
    var btwAf = r2(btwOnt - voorb);
    var opzij = r2(Math.max(0, btwAf) + hoofd.totaal);
    var omzetIncl = r2(omzet + btwOnt);
    return { facs: facs, bons: bons, omzet: omzet, kosten: kosten, winst: winst, btwOnt: btwOnt, voorb: voorb, btwAf: btwAf,
      nee: nee, ja: ja, hoofd: hoofd, opzij: opzij, netto: r2(winst - hoofd.totaal), omzetIncl: omzetIncl,
      pct: omzetIncl > 0 ? opzij / omzetIncl * 100 : 0, open: r2(open), betaald: r2(betaald), kw: kw };
  }
  function achterstallig(f) { return f.status !== 'betaald' && F.plusDagen(f.datum, +f.termijn || 30) < vandaag(); }
  function dagenTot(iso) { return Math.round((new Date(iso + 'T12:00:00') - new Date(vandaag() + 'T12:00:00')) / 86400000); }

  function tips(c, j) {
    var t = [], i = data.instellingen, nu = new Date();
    var late = data.facturen.filter(achterstallig);
    if (late.length) t.push('<b>Betaling herinneren:</b> ' + late.length + ' factuur' + (late.length > 1 ? 'en zijn' : ' is') + ' over de vervaldatum (' +
      late.map(function (f) { return esc(f.nummer); }).join(', ') + '). Stuur een vriendelijke herinnering.');
    if (i.urencriterium === 'onzeker') {
      t.push('<b>Urencriterium:</b> de schatting rekent voorzichtig zonder zelfstandigen- en startersaftrek. Je hebt daar recht op als je minimaal 1.225 uur per jaar aan je bedrijf werkt én meer dan de helft van je totale werktijd; met een baan ernaast haal je dat vaak niet. Haal je het wel, dan scheelt dat ongeveer ' + eur(r2(c.nee.totaal - c.ja.totaal)) + ' belasting. Houd een urenregistratie bij.');
    }
    var q = Math.floor(nu.getMonth() / 3);
    if (j === nu.getFullYear()) {
      var vorigQ = q === 0 ? { jr: j - 1, q: 3 } : { jr: j, q: q - 1 };
      var eind = new Date(vorigQ.jr, vorigQ.q * 3 + 4, 0);
      var dn = dagenTot(eind.getFullYear() + '-' + String(eind.getMonth() + 1).padStart(2, '0') + '-' + String(eind.getDate()).padStart(2, '0'));
      if (dn >= 0 && dn <= 31) t.push('<b>Btw-aangifte:</b> de aangifte over Q' + (vorigQ.q + 1) + ' ' + vorigQ.jr + ' moet uiterlijk binnen ' + dn + ' dagen binnen zijn (einde van de maand na het kwartaal).');
    }
    if (c.facs.length && !c.bons.length) t.push('<b>Kosten vergeten?</b> Je hebt omzet maar nog geen bonnetjes dit jaar. Zakelijke kosten verlagen je winst en je btw. Voeg ze toe bij Bonnetjes.');
    if (c.winst > 0 && (+i.loon || 0) === 0 && i.urencriterium !== 'ja') t.push('<b>Baan ernaast?</b> Vul bij Instellingen je bruto jaarloon in, want je winst wordt bij je loon opgeteld. Dat maakt de schatting veel nauwkeuriger.');
    if (c.winst > 0 && !t.length) t.push('Alles ziet er in orde uit. Zet het bedrag bij "opzij zetten" op een aparte spaarrekening, dan kom je niet voor verrassingen te staan.');
    if (c.pct > 0) t.push('<b>Vuistregel:</b> zet van elke factuur (incl. btw) ongeveer ' + c.pct.toFixed(0) + '% opzij voor btw en belasting.');
    return t;
  }

  /* ---------- weergaven ---------- */
  var VIEWS = {};

  VIEWS.dashboard = function () {
    var c = bereken(jaar), i = data.instellingen;
    var opties = jaren().map(function (y) { return '<option ' + (y === jaar ? 'selected' : '') + '>' + y + '</option>'; }).join('');
    var tot = Math.max(c.omzet, 0.01);
    var segKosten = c.kosten / tot * 100, segBel = Math.min(100, c.hoofd.totaal / tot * 100), segNetto = Math.max(0, 100 - segKosten - segBel);
    var open = data.facturen.filter(function (f) { return f.status !== 'betaald'; }).sort(function (a, b) { return a.datum < b.datum ? -1 : 1; });
    var tl = tips(c, jaar);
    var html = '<div class="row sp" style="margin-bottom:16px"><h1>Dashboard</h1><div class="row"><label style="margin:0">Jaar</label><select id="jaar" style="width:auto">' + opties + '</select></div></div>' +
      (jaar !== 2026 ? '<div class="notice">De belastingschatting rekent met de tarieven en aftrekposten van 2026.</div>' : '') +
      '<div class="grid g3" style="margin-bottom:14px">' +
      tile('Omzet (excl. btw)', eur(c.omzet), c.facs.length + ' facturen') +
      tile('Kosten (excl. btw)', eur(c.kosten), c.bons.length + ' bonnetjes') +
      tile('Winst voor belasting', eur(c.winst), '') + '</div>' +
      '<div class="grid g3" style="margin-bottom:18px">' +
      tile('Btw opzij zetten', eur(Math.max(0, c.btwAf)), 'ontvangen ' + eur(c.btwOnt) + ' min voorbelasting ' + eur(c.voorb), 'tx') +
      tile('Inkomstenbelasting + Zvw opzij', eur(c.hoofd.totaal), 'schatting, zie berekening hieronder', 'tx') +
      tile('Naar schatting over', eur(c.netto), 'winst min belasting en Zvw (btw telt niet mee)', 'hl') + '</div>' +

      '<div class="card"><h2>Waar gaat je omzet heen?</h2><p class="hint">Over ' + eur(c.omzet) + ' omzet excl. btw</p>' +
      '<div class="bar"><div data-w="' + segKosten + '" style="background:#9db3c4">' + (segKosten > 9 ? 'Kosten' : '') + '</div><div data-w="' + segBel + '" style="background:#d9822b">' + (segBel > 9 ? 'Belasting' : '') + '</div><div data-w="' + segNetto + '" style="background:#38a9e6">' + (segNetto > 9 ? 'Over' : '') + '</div></div>' +
      '<div class="legend"><span><i style="background:#9db3c4"></i>Kosten ' + eur(c.kosten) + '</span><span><i style="background:#d9822b"></i>Inkomstenbelasting + Zvw ' + eur(c.hoofd.totaal) + '</span><span><i style="background:#38a9e6"></i>Over ' + eur(c.netto) + '</span></div></div>' +

      '<div class="grid g2"><div class="card"><h2>Zo is het berekend</h2><table><tbody>' +
      rij('Omzet excl. btw', eur(c.omzet)) + rij('Kosten excl. btw', '- ' + eur(c.kosten)) + rij('<b>Winst</b>', '<b>' + eur(c.winst) + '</b>') +
      rij('Zelfstandigen- en startersaftrek' + (i.urencriterium === 'ja' ? '' : ' (niet meegerekend)'), '- ' + eur(c.hoofd.ondernemersaftrek)) +
      rij('MKB-winstvrijstelling 12,7%', '- ' + eur(c.hoofd.mkbVrijstelling)) +
      rij('Belastbare winst', eur(c.hoofd.belastbaarInkomen)) +
      rij('Inkomstenbelasting (bovenop je loon van ' + eur(+i.loon || 0) + ')', eur(c.hoofd.inkomstenbelasting)) +
      rij('Zvw-bijdrage 4,85%', eur(c.hoofd.zvw)) +
      '</tbody><tfoot><tr><td>Opzij zetten (btw + belasting)</td><td class="r num">' + eur(c.opzij) + '</td></tr></tfoot></table>' +
      '<p class="hint" style="margin-top:10px">Indicatie, geen belastingadvies. Heffingskortingen zitten al in je loonstrook en zijn niet meegerekend. Het urencriterium staat op "' + esc(i.urencriterium) + '"' +
      (i.urencriterium !== 'ja' ? '; haal je het wel, dan is het ' + eur(c.ja.totaal) + ' i.p.v. ' + eur(c.nee.totaal) + '.' : '.') + '</p></div>' +

      '<div class="card"><h2>Btw per kwartaal</h2><table><thead><tr><th>Kwartaal</th><th class="r">Ontvangen</th><th class="r">Voorbelasting</th><th class="r">Afdragen</th></tr></thead><tbody>' +
      c.kw.map(function (k, n) { return '<tr><td>Q' + (n + 1) + '</td><td class="r num">' + eur(r2(k.ont)) + '</td><td class="r num">' + eur(r2(k.voor)) + '</td><td class="r num"><b>' + eur(r2(k.ont - k.voor)) + '</b></td></tr>'; }).join('') +
      '</tbody></table><p class="hint" style="margin-top:10px">Aangifte uiterlijk aan het einde van de maand na het kwartaal. Btw rekent op factuurdatum.</p></div></div>' +

      '<div class="grid g2"><div class="card"><h2>Openstaande facturen</h2>' + (open.length ? '<table><tbody>' + open.map(function (f) {
        var t = F.totalen(f), vd = F.plusDagen(f.datum, +f.termijn || 30), late = achterstallig(f);
        return '<tr><td>' + esc(f.nummer) + '<div class="hint">' + esc(f.klant.naam) + '</div></td><td class="r num">' + eur(t.totaal) + '<div class="hint">' +
          (late ? '<span class="pill bad">' + Math.abs(dagenTot(vd)) + ' dgn te laat</span>' : 'vervalt ' + F.datum(vd)) + '</div></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="hint">Geen openstaande facturen.</p>') + '</div>' +
      '<div class="card"><h2>Tips</h2>' + (tl.length ? tl.map(function (x) { return '<div class="tip"><div>' + x + '</div></div>'; }).join('') : '<p class="hint">Nog geen tips.</p>') +
      '<p class="hint" style="margin-top:8px">Tips komen uit vaste regels in deze app, niet uit een AI.</p></div></div>';
    return { html: html, after: function () {
      $('#jaar').onchange = function () { jaar = +this.value; render(); };
      $$('.bar div').forEach(function (d) { d.style.width = d.dataset.w + '%'; });
    } };
  };
  function tile(l, v, s, k) { return '<div class="tile ' + (k || '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div><div class="s">' + esc(s) + '</div></div>'; }
  function rij(a, b) { return '<tr><td>' + a + '</td><td class="r num">' + b + '</td></tr>'; }

  /* --- facturen --- */
  VIEWS.facturen = function () {
    var lijst = data.facturen.slice().sort(function (a, b) { return a.nummer < b.nummer ? 1 : -1; });
    var html = '<div class="row sp" style="margin-bottom:16px"><h1>Facturen</h1><button class="b" id="nieuw">+ Nieuwe factuur</button></div><div class="card" style="padding:0;overflow:auto">' +
      (lijst.length ? '<table><thead><tr><th>Nummer</th><th>Datum</th><th>Klant</th><th class="r">Bedrag</th><th>Status</th><th></th></tr></thead><tbody>' +
        lijst.map(function (f) {
          var t = F.totalen(f), late = achterstallig(f);
          return '<tr><td><b>' + esc(f.nummer) + '</b></td><td class="num">' + F.datum(f.datum) + '</td><td>' + esc(f.klant.naam) + '<div class="hint">' + esc(f.betreft || '') + '</div></td>' +
            '<td class="r num">' + eur(t.totaal) + '<div class="hint">excl. ' + eur(t.sub) + '</div></td>' +
            '<td>' + (f.status === 'betaald' ? '<span class="pill ok">Betaald ' + esc(F.datum(f.betaaldatum)) + '</span>' : late ? '<span class="pill bad">Te laat</span>' : '<span class="pill warn">Open</span>') + '</td>' +
            '<td class="r" style="white-space:nowrap">' + (f.pdfId ? '<button class="b sm sec" data-a="pdf" data-id="' + f.id + '">PDF</button> ' : '') +
            (f.status !== 'betaald' ? '<button class="b sm sec" data-a="betaald" data-id="' + f.id + '">Betaald</button> ' : '<button class="b sm sec" data-a="open" data-id="' + f.id + '">Heropen</button> ') +
            '<button class="b sm del" data-a="del" data-id="' + f.id + '">Verwijder</button></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="hint" style="padding:20px">Nog geen facturen. Maak je eerste factuur aan.</p>') + '</div>' +
      '<p class="hint">Een gemaakte factuur pas je niet meer aan (fiscaal hoort dat zo). Klopt er iets niet, verwijder hem en maak een nieuwe aan.</p>';
    return { html: html, after: function () {
      $('#nieuw').onclick = function () { melding = null; ga('nieuw'); };
      $$('[data-a]').forEach(function (b) { b.onclick = function () { factuurActie(b.dataset.a, b.dataset.id); }; });
    } };
  };

  async function openBestand(id, naam) {
    var w = window.open('', '_blank');
    try {
      var blob = await backend.download(id);
      var url = URL.createObjectURL(blob);
      if (w) w.location = url; else { var a = document.createElement('a'); a.href = url; a.download = naam || 'bestand'; a.click(); }
    } catch (e) { if (w) w.close(); toon('Openen mislukt: ' + e.message, 'err'); }
  }

  async function factuurActie(a, id) {
    var f = data.facturen.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    if (a === 'pdf') return openBestand(f.pdfId, 'Factuur ' + f.nummer + '.pdf');
    if (a === 'betaald') { var d = prompt('Betaald op (jjjj-mm-dd):', vandaag()); if (!d) return; f.status = 'betaald'; f.betaaldatum = d; }
    if (a === 'open') { f.status = 'open'; f.betaaldatum = ''; }
    if (a === 'del') {
      if (!confirm('Factuur ' + f.nummer + ' verwijderen? Het PDF-bestand gaat naar de prullenbak van je Drive.')) return;
      if (f.pdfId) { try { await backend.verwijder(f.pdfId); } catch (e) { toon('PDF verwijderen mislukt: ' + e.message, 'err'); } }
      data.facturen = data.facturen.filter(function (x) { return x.id !== id; });
    }
    render(); bewaar();
  }

  function volgendNummer(j) {
    var max = 0;
    data.facturen.forEach(function (f) { var m = /^(\d{4})-(\d+)$/.exec(f.nummer); if (m && +m[1] === j) max = Math.max(max, +m[2]); });
    return j + '-' + String(max + 1).padStart(3, '0');
  }

  VIEWS.nieuw = function () {
    var i = data.instellingen, nu = vandaag();
    var html = '<div class="row sp" style="margin-bottom:16px"><h1>Nieuwe factuur</h1><button class="b sec" id="terug">Annuleren</button></div>' +
      (!i.kvk || !i.iban ? '<div class="notice err">Je bedrijfsgegevens zijn nog niet compleet (KvK, IBAN). Vul ze eerst in bij Instellingen, anders staan ze niet op de factuur.</div>' : '') +
      '<form id="ff"><div class="grid g2"><div class="card"><h2>Klant</h2><div class="f" style="margin-top:12px"><label>Naam</label><input id="k_naam" list="klanten" required autocomplete="off"><datalist id="klanten">' +
      data.klanten.map(function (k) { return '<option value="' + esc(k.naam) + '">'; }).join('') + '</datalist></div>' +
      '<div class="f"><label>Adres</label><input id="k_adres"></div><div class="f"><label>Postcode en plaats</label><input id="k_pp"></div>' +
      '<div class="grid g2"><div class="f"><label>KvK-nummer</label><input id="k_kvk"></div><div class="f"><label>BTW-nummer</label><input id="k_btw"></div></div>' +
      '<div class="grid g2"><div class="f"><label>E-mail</label><input id="k_mail"></div><div class="f"><label>Telefoon</label><input id="k_tel"></div></div></div>' +
      '<div class="card"><h2>Factuur</h2><div class="grid g2" style="margin-top:12px"><div class="f"><label>Factuurnummer</label><input id="nr" value="' + volgendNummer(+nu.slice(0, 4)) + '" required></div>' +
      '<div class="f"><label>Factuurdatum</label><input id="dat" type="date" value="' + nu + '" required></div>' +
      '<div class="f"><label>Betalingstermijn (dagen)</label><input id="term" value="' + (i.termijn || 30) + '"></div>' +
      '<div class="f"><label>Btw-tarief</label><select id="pct"><option value="21">21% (hoog)</option><option value="9">9% (laag)</option><option value="0">0%</option></select></div></div>' +
      '<div class="f"><label>Betreft</label><input id="betreft" placeholder="Bijv. Headervideo De Basis"></div></div></div>' +
      '<div class="card"><h2>Werkzaamheden</h2><table class="lines" style="margin-top:8px"><thead><tr><th>Omschrijving</th><th style="width:90px">Aantal</th><th style="width:130px">Prijs excl. btw</th><th class="r" style="width:120px">Bedrag</th><th style="width:40px"></th></tr></thead><tbody id="regels"></tbody></table>' +
      '<button type="button" class="b sec sm" id="addr" style="margin:10px 0 16px">+ Regel</button>' +
      '<div class="tot"><div><span>Totaal excl. btw</span><b id="t_sub"></b></div><div><span id="t_pl">BTW</span><b id="t_btw"></b></div><div class="big"><span>Totaal te betalen</span><span id="t_tot"></span></div></div></div>' +
      '<div class="row"><button class="b" id="maak" type="submit">Factuur maken en opslaan in Drive</button></div></form>';
    return { html: html, after: function () {
      var body = $('#regels');
      function addRegel(o) {
        o = o || { omschrijving: '', aantal: 1, prijs: '' };
        var tr = document.createElement('tr');
        tr.innerHTML = '<td><input class="o" value="' + esc(o.omschrijving) + '"></td><td><input class="a" inputmode="decimal" value="' + esc(o.aantal) + '"></td><td><input class="p" inputmode="decimal" value="' + esc(o.prijs) + '"></td><td class="r num b2"></td><td><button type="button" class="b sm del x">×</button></td>';
        body.appendChild(tr);
        tr.oninput = herreken; tr.querySelector('.x').onclick = function () { if (body.children.length > 1) { tr.remove(); herreken(); } };
      }
      function lees() {
        return $$('tr', body).map(function (tr) { return { omschrijving: $('.o', tr).value.trim(), aantal: num($('.a', tr).value), prijs: num($('.p', tr).value) }; });
      }
      function herreken() {
        $$('tr', body).forEach(function (tr) { $('.b2', tr).textContent = eur(r2(num($('.a', tr).value) * num($('.p', tr).value))); });
        var t = F.totalen({ regels: lees(), btwPct: +$('#pct').value });
        $('#t_sub').textContent = eur(t.sub); $('#t_btw').textContent = eur(t.btw); $('#t_tot').textContent = eur(t.totaal);
        $('#t_pl').textContent = 'BTW ' + $('#pct').value + '%';
      }
      $('#pct').value = String(i.btwPct != null ? i.btwPct : 21);
      $('#pct').onchange = herreken; addRegel(); herreken();
      $('#addr').onclick = function () { addRegel(); };
      $('#terug').onclick = function () { ga('facturen'); };
      $('#k_naam').onchange = function () {
        var k = data.klanten.filter(function (x) { return x.naam === $('#k_naam').value; })[0]; if (!k) return;
        $('#k_adres').value = k.adres || ''; $('#k_pp').value = k.postcodePlaats || ''; $('#k_kvk').value = k.kvk || '';
        $('#k_btw').value = k.btw || ''; $('#k_mail').value = k.email || ''; $('#k_tel').value = k.tel || '';
      };
      $('#ff').onsubmit = async function (e) {
        e.preventDefault();
        var regels = lees().filter(function (r) { return r.omschrijving || r.prijs; });
        if (!regels.length) return toon('Voeg minimaal één regel toe.', 'err');
        var nr = $('#nr').value.trim();
        if (data.facturen.some(function (f) { return f.nummer === nr; })) return toon('Factuurnummer ' + nr + ' bestaat al.', 'err');
        var klant = { naam: $('#k_naam').value.trim(), adres: $('#k_adres').value.trim(), postcodePlaats: $('#k_pp').value.trim(), kvk: $('#k_kvk').value.trim(), btw: $('#k_btw').value.trim(), email: $('#k_mail').value.trim(), tel: $('#k_tel').value.trim() };
        var f = { id: Opslag.uid(), nummer: nr, datum: $('#dat').value, termijn: Math.max(0, parseInt($('#term').value, 10) || 30), klant: klant,
          betreft: $('#betreft').value.trim(), regels: regels, btwPct: +$('#pct').value, status: 'open', betaaldatum: '' };
        var btn = $('#maak'); btn.disabled = true; btn.textContent = 'Bezig…';
        try {
          var blob = F.maak(f, data.instellingen);
          var naam = 'Factuur ' + f.nummer + ' - ' + klant.naam.replace(/[\\/:*?"<>|]/g, '') + '.pdf';
          var up = await backend.upload('Facturen', naam, blob);
          f.pdfId = up.id; f.pdfLink = up.link;
          data.facturen.push(f);
          var bk = data.klanten.filter(function (x) { return x.naam === klant.naam; })[0];
          if (bk) Object.assign(bk, klant); else data.klanten.push(klant);
          toon('Factuur ' + f.nummer + ' is gemaakt en opgeslagen. Open hem met de knop PDF.', 'ok');
          view = 'facturen'; render(); bewaar();
        } catch (er) { btn.disabled = false; btn.textContent = 'Factuur maken en opslaan in Drive'; toon('Factuur maken mislukt: ' + er.message, 'err'); }
      };
    } };
  };

  /* --- bonnetjes --- */
  var CATS = ['Apparatuur', 'Software', 'Reiskosten', 'Verzekering', 'Marketing', 'Kantoor', 'Opleiding', 'Overig'];
  VIEWS.bonnetjes = function () {
    var lijst = data.bonnetjes.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
    var html = '<h1 style="margin-bottom:16px">Bonnetjes</h1><div class="card"><h2>Bonnetje toevoegen</h2><form id="bf" style="margin-top:12px"><div class="grid g4">' +
      '<div class="f"><label>Datum</label><input id="b_dat" type="date" value="' + vandaag() + '" required></div>' +
      '<div class="f"><label>Leverancier</label><input id="b_lev" required></div>' +
      '<div class="f"><label>Omschrijving</label><input id="b_oms"></div>' +
      '<div class="f"><label>Categorie</label><select id="b_cat">' + CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Totaal incl. btw</label><input id="b_inc" inputmode="decimal" required></div>' +
      '<div class="f"><label>Btw-tarief</label><select id="b_pct"><option value="21">21%</option><option value="9">9%</option><option value="0">0%</option></select></div>' +
      '<div class="f"><label>Btw-bedrag</label><input id="b_btw" inputmode="decimal"></div>' +
      '<div class="f"><label>Foto of PDF van bonnetje</label><input id="b_file" type="file" accept="image/*,application/pdf"></div></div>' +
      '<button class="b" id="b_ok" type="submit">Opslaan</button></form></div>' +
      '<div class="card" style="padding:0;overflow:auto">' + (lijst.length ? '<table><thead><tr><th>Datum</th><th>Leverancier</th><th>Categorie</th><th class="r">Incl. btw</th><th class="r">Btw</th><th></th></tr></thead><tbody>' +
        lijst.map(function (b) {
          return '<tr><td class="num">' + F.datum(b.datum) + '</td><td>' + esc(b.leverancier) + '<div class="hint">' + esc(b.omschrijving || '') + '</div></td><td>' + esc(b.categorie) + '</td><td class="r num">' + eur(+b.bedragIncl) + '</td><td class="r num">' + eur(+b.btwBedrag) + '</td>' +
            '<td class="r" style="white-space:nowrap">' + (b.fileId ? '<button class="b sm sec" data-a="open" data-id="' + b.id + '">Bekijk</button> ' : '') + '<button class="b sm del" data-a="del" data-id="' + b.id + '">Verwijder</button></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="hint" style="padding:20px">Nog geen bonnetjes.</p>') + '</div>';
    return { html: html, after: function () {
      function auto() { var inc = num($('#b_inc').value), p = +$('#b_pct').value; $('#b_btw').value = inc ? String(r2(inc - inc / (1 + p / 100))).replace('.', ',') : ''; }
      $('#b_inc').oninput = auto; $('#b_pct').onchange = auto;
      $$('[data-a]').forEach(function (b) {
        b.onclick = async function () {
          var x = data.bonnetjes.filter(function (y) { return y.id === b.dataset.id; })[0]; if (!x) return;
          if (b.dataset.a === 'open') return openBestand(x.fileId, x.fileName);
          if (!confirm('Bonnetje van ' + x.leverancier + ' verwijderen?')) return;
          if (x.fileId) { try { await backend.verwijder(x.fileId); } catch (e) { toon('Bestand verwijderen mislukt: ' + e.message, 'err'); } }
          data.bonnetjes = data.bonnetjes.filter(function (y) { return y.id !== x.id; }); render(); bewaar();
        };
      });
      $('#bf').onsubmit = async function (e) {
        e.preventDefault();
        var inc = num($('#b_inc').value), btw = $('#b_btw').value === '' ? 0 : num($('#b_btw').value);
        if (!inc) return toon('Vul het bedrag incl. btw in.', 'err');
        var b = { id: Opslag.uid(), datum: $('#b_dat').value, leverancier: $('#b_lev').value.trim(), omschrijving: $('#b_oms').value.trim(), categorie: $('#b_cat').value, bedragIncl: r2(inc), btwBedrag: r2(btw), fileId: '', fileName: '' };
        var fl = $('#b_file').files[0], btn = $('#b_ok'); btn.disabled = true; btn.textContent = 'Bezig…';
        try {
          if (fl) {
            var ext = (fl.name.split('.').pop() || 'bin').toLowerCase();
            b.fileName = b.datum + ' ' + b.leverancier.replace(/[\\/:*?"<>|]/g, '') + '.' + ext;
            var up = await backend.upload('Bonnetjes', b.fileName, fl); b.fileId = up.id;
          }
          data.bonnetjes.push(b); toon('Bonnetje opgeslagen.', 'ok'); render(); bewaar();
        } catch (er) { btn.disabled = false; btn.textContent = 'Opslaan'; toon('Opslaan mislukt: ' + er.message, 'err'); }
      };
    } };
  };

  /* --- instellingen --- */
  function logoHtml(src) { return src ? '<img src="' + esc(src) + '" alt="Logo" style="max-width:220px;max-height:80px">' : 'Nog geen logo. De factuur toont dan je bedrijfsnaam als tekst.'; }
  function verkleinLogo(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('Bestand lezen mislukt')); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { rej(new Error('Geen geldige afbeelding')); };
        im.onload = function () {
          var w = Math.min(900, im.naturalWidth), h = Math.round(im.naturalHeight * w / im.naturalWidth);
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(im, 0, 0, w, h);
          res({ logo: cv.toDataURL('image/png'), logoRatio: h / w });
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  VIEWS.instellingen = function () {
    var i = data.instellingen, nieuwLogo = null;
    function fld(id, label, val, extra) { return '<div class="f"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(val) + '" ' + (extra || '') + '></div>'; }
    var html = '<h1 style="margin-bottom:16px">Instellingen</h1><form id="sf"><div class="grid g2"><div class="card"><h2>Jouw bedrijfsgegevens</h2><div style="margin-top:12px">' +
      fld('s_naam', 'Bedrijfsnaam', i.naam) + fld('s_contact', 'Naam op factuur', i.contact) + fld('s_adres', 'Adres', i.adres) + fld('s_pp', 'Postcode en plaats', i.postcodePlaats) +
      fld('s_email', 'E-mail', i.email) + '<div class="grid g2">' + fld('s_kvk', 'KvK-nummer', i.kvk) + fld('s_btw', 'BTW-nummer', i.btw) + '</div>' +
      fld('s_iban', 'IBAN', i.iban) + '<div class="grid g2">' + fld('s_tnv', 'Ten name van', i.tnv) + fld('s_bank', 'Bank', i.bank) + '</div>' +
      '<div class="grid g2">' + fld('s_term', 'Standaard betalingstermijn (dagen)', i.termijn) + '<div class="f"><label>Standaard btw-tarief</label><select id="s_pct"><option value="21">21%</option><option value="9">9%</option><option value="0">0%</option></select></div></div></div></div>' +
      '<div><div class="card"><h2>Belastingschatting</h2><div style="margin-top:12px">' + fld('s_loon', 'Bruto jaarloon uit je baan (0 als je geen baan hebt)', i.loon, 'inputmode="decimal"') +
      '<div class="f"><label>Haal je het urencriterium (1.225 uur én meer dan 50% van je werktijd)?</label><select id="s_uren"><option value="onzeker">Weet ik nog niet (voorzichtig rekenen)</option><option value="nee">Nee</option><option value="ja">Ja</option></select></div>' +
      '<div class="f"><label><input type="checkbox" id="s_start" style="width:auto;margin-right:6px" ' + (i.starter ? 'checked' : '') + '>Ik ben starter (startersaftrek, alleen bij urencriterium)</label></div>' +
      '<p class="hint">Zonder urencriterium krijg je geen zelfstandigen- en startersaftrek. De MKB-winstvrijstelling krijg je altijd.</p></div></div>' +
      '<div class="card"><h2>Logo op de factuur</h2><div style="margin-top:12px"><div id="logoPrev" class="hint">' + logoHtml(i.logo) + '</div>' +
      '<div class="row" style="margin-top:10px"><input id="s_logo" type="file" accept="image/png,image/jpeg" style="width:auto"><button type="button" class="b sm del" id="logoDel">Logo verwijderen</button></div>' +
      '<p class="hint" style="margin-top:8px">Liefst een PNG met transparante achtergrond. Het logo wordt opgeslagen in je eigen Drive.</p></div></div></div></div>' +
      '<div class="row"><button class="b" type="submit">Opslaan</button><button type="button" class="b sec" id="export">Back-up downloaden (JSON)</button>' + (backend.mapLink() ? '<a class="b sec" target="_blank" rel="noopener" href="' + esc(backend.mapLink()) + '">Open Drive-map</a>' : '') + '</div></form>';
    return { html: html, after: function () {
      $('#s_pct').value = String(i.btwPct != null ? i.btwPct : 21); $('#s_uren').value = i.urencriterium || 'onzeker';
      $('#s_logo').onchange = async function () {
        var f = this.files[0]; if (!f) return;
        try { nieuwLogo = await verkleinLogo(f); $('#logoPrev').innerHTML = logoHtml(nieuwLogo.logo); }
        catch (e) { toon(e.message, 'err'); }
      };
      $('#logoDel').onclick = function () { nieuwLogo = { logo: '', logoRatio: 0 }; $('#logoPrev').innerHTML = logoHtml(''); };
      $('#export').onclick = function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
        a.download = 'administratie-backup-' + vandaag() + '.json'; a.click();
      };
      $('#sf').onsubmit = function (e) {
        e.preventDefault();
        Object.assign(data.instellingen, { naam: $('#s_naam').value.trim(), contact: $('#s_contact').value.trim(), adres: $('#s_adres').value.trim(), postcodePlaats: $('#s_pp').value.trim(),
          email: $('#s_email').value.trim(), kvk: $('#s_kvk').value.trim(), btw: $('#s_btw').value.trim(), iban: $('#s_iban').value.trim(), tnv: $('#s_tnv').value.trim(), bank: $('#s_bank').value.trim(),
          termijn: parseInt($('#s_term').value, 10) || 30, btwPct: +$('#s_pct').value, loon: num($('#s_loon').value), urencriterium: $('#s_uren').value, starter: $('#s_start').checked });
        if (nieuwLogo) Object.assign(data.instellingen, nieuwLogo);
        toon('Instellingen opgeslagen.', 'ok'); render(); bewaar();
      };
    } };
  };

  window.addEventListener('load', function () { welkom(); });
})();
