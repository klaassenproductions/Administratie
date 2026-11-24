/* Opslaglaag: Google Drive (echt) of in-memory (demo). De data gaat alleen tussen
 * jouw browser en Google; deze app heeft geen eigen server. */
(function (root) {
  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var ROOT_NAME = 'Klaassen Productions Administratie';
  var DATA_NAME = 'administratie-data.json';
  var FOLDERS = ['Facturen', 'Offertes', 'Bonnetjes'];

  function emptyData() {
    return {
      versie: 1,
      instellingen: {
        naam: 'Klaassen Productions', contact: 'M. Klaassen', adres: '', postcodePlaats: '',
        kvk: '', btw: '', iban: '', tnv: '', bank: '', email: '',
        termijn: 30, btwPct: 21, loon: 0, urencriterium: 'onzeker', starter: true
      },
      klanten: [], facturen: [], bonnetjes: [], offertes: [], afgerond: {}
    };
  }

  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- Google Drive ---------- */
  function GoogleBackend(clientId) {
    var token = null, tokenExp = 0, tc = null;
    var ids = { root: null, Facturen: null, Offertes: null, Bonnetjes: null, data: null };
    var self = this;
    this.naam = 'Google Drive';

    function initClient() {
      if (tc) return;
      if (!root.google || !google.accounts || !google.accounts.oauth2) {
        throw new Error('Google-inlogscript niet geladen. Controleer je internetverbinding.');
      }
      tc = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE, callback: function () {}
      });
    }

    function getToken(prompt) {
      initClient();
      return new Promise(function (resolve, reject) {
        tc.callback = function (r) {
          if (r.error) return reject(new Error(r.error_description || r.error));
          token = r.access_token; tokenExp = Date.now() + (r.expires_in - 60) * 1000;
          resolve(token);
        };
        tc.error_callback = function (e) { reject(new Error((e && e.type) || 'Inloggen geannuleerd')); };
        tc.requestAccessToken({ prompt: prompt });
      });
    }

    async function auth() {
      if (token && Date.now() < tokenExp) return token;
      return getToken(token ? '' : 'consent');
    }

    async function api(url, opt, retry) {
      var t = await auth();
      opt = opt || {};
      opt.headers = Object.assign({ Authorization: 'Bearer ' + t }, opt.headers || {});
      var res = await fetch(url, opt);
      if (res.status === 401 && !retry) { token = null; return api(url, opt, true); }
      if (!res.ok) {
        var msg = '';
        try { msg = (await res.json()).error.message; } catch (e) {}
        throw new Error('Google Drive fout ' + res.status + (msg ? ': ' + msg : ''));
      }
      return res;
    }

    function q(s) { return encodeURIComponent(s); }
    function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

    async function findOne(name, parent, mime) {
      var query = "name='" + esc(name) + "' and trashed=false";
      if (parent) query += " and '" + parent + "' in parents";
      if (mime) query += " and mimeType='" + mime + "'";
      var r = await api('https://www.googleapis.com/drive/v3/files?q=' + q(query) +
        '&fields=files(id,name)&pageSize=5&spaces=drive');
      var j = await r.json();
      return j.files && j.files[0] ? j.files[0].id : null;
    }

    async function ensureFolder(name, parent) {
      var mime = 'application/vnd.google-apps.folder';
      var id = await findOne(name, parent, mime);
      if (id) return id;
      var body = { name: name, mimeType: mime };
      if (parent) body.parents = [parent];
      var r = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return (await r.json()).id;
    }

    async function multipart(meta, blob) {
      var b = 'b' + uid();
      var head = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: ' + (blob.type || 'application/octet-stream') + '\r\n\r\n';
      var body = new Blob([head, blob, '\r\n--' + b + '--']);
      var r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body
      });
      return r.json();
    }

    this.verbind = async function () {
      await auth();
      ids.root = await ensureFolder(ROOT_NAME, null);
      for (var i = 0; i < FOLDERS.length; i++) ids[FOLDERS[i]] = await ensureFolder(FOLDERS[i], ids.root);
      ids.data = await findOne(DATA_NAME, ids.root, null);
    };

    this.laad = async function () {
      if (!ids.data) return emptyData();
      var r = await api('https://www.googleapis.com/drive/v3/files/' + ids.data + '?alt=media');
      var d = await r.json();
      var e = emptyData();
      d.instellingen = Object.assign(e.instellingen, d.instellingen || {});
      d.klanten = d.klanten || []; d.facturen = d.facturen || []; d.bonnetjes = d.bonnetjes || []; d.afgerond = d.afgerond || {}; d.offertes = d.offertes || [];
      return d;
    };

    this.bewaar = async function (data) {
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      if (!ids.data) {
        var j = await multipart({ name: DATA_NAME, parents: [ids.root] }, blob);
        ids.data = j.id;
      } else {
        await api('https://www.googleapis.com/upload/drive/v3/files/' + ids.data + '?uploadType=media', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: blob
        });
      }
    };

    this.upload = async function (map, naam, blob) {
      var j = await multipart({ name: naam, parents: [ids[map]] }, blob);
      return { id: j.id, link: j.webViewLink };
    };

    this.download = async function (id) {
      var r = await api('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
      return r.blob();
    };

    this.verwijder = async function (id) {
      await api('https://www.googleapis.com/drive/v3/files/' + id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true })
      });
    };

    this.mapLink = function () { return ids.root ? 'https://drive.google.com/drive/folders/' + ids.root : null; };
  }

  /* ---------- Demo (alleen in geheugen, verdwijnt bij herladen) ---------- */
  function DemoBackend() {
    var files = {}, data = null;
    this.naam = 'Demo (alleen in geheugen)';
    this.verbind = async function () {};
    this.laad = async function () {
      if (data) return JSON.parse(JSON.stringify(data));
      var d = emptyData();
      d.instellingen.adres = 'Voorbeeldstraat 1'; d.instellingen.postcodePlaats = '1234 AB Voorbeeldstad';
      d.instellingen.kvk = '12345678'; d.instellingen.btw = 'NL000000000B01'; d.instellingen.iban = 'NL00 BANK 0000 0000 00';
      d.instellingen.tnv = 'M. Voorbeeld'; d.instellingen.bank = 'Voorbeeldbank'; d.instellingen.loon = 32000;
      var y = new Date().getFullYear();
      var klant = { naam: 'Voorbeeld Klant BV', adres: 'Klantstraat 5', postcodePlaats: '6511 AA Nijmegen', kvk: '87654321', btw: 'NL000000001B01', email: 'info@voorbeeld.nl', tel: '' };
      d.klanten.push(klant);
      d.facturen.push(
        { id: uid(), nummer: y + '-001', datum: y + '-10-28', termijn: 30, klant: klant, betreft: 'Aftermovie (demo)',
          regels: [{ omschrijving: 'Draaidag', aantal: 1, prijs: 415.5 }, { omschrijving: 'Montagedag', aantal: 1, prijs: 415.5 }],
          btwPct: 21, status: 'betaald', betaaldatum: y + '-11-10' },
        { id: uid(), nummer: y + '-002', datum: y + '-11-05', termijn: 30, klant: klant, betreft: 'Interviewvideo\'s (demo)',
          regels: [{ omschrijving: 'Montage 6 video\'s', aantal: 6, prijs: 90 }],
          btwPct: 21, status: 'open', betaaldatum: '' },
        { id: uid(), nummer: y + '-003', datum: y + '-09-02', termijn: 14, klant: klant, betreft: 'Fotoshoot (demo)',
          regels: [{ omschrijving: 'Fotoshoot incl. nabewerking', aantal: 1, prijs: 600 }],
          btwPct: 21, status: 'open', betaaldatum: '' });
      d.offertes.push({ id: uid(), nummer: 'O-' + y + '-001', datum: y + '-11-15', termijn: 30, klant: klant, betreft: 'Videoserie (demo)',
        regels: [{ omschrijving: 'Montage 6 video\'s', aantal: 6, prijs: 90 }, { omschrijving: 'Eindscherm ontwerpen', aantal: 1, prijs: 120 }], btwPct: 21, status: 'open', factuurNr: '' });
      d.bonnetjes.push(
        { id: uid(), datum: y + '-10-30', leverancier: 'Voorbeeld Camerashop', omschrijving: 'SD-kaarten', categorie: 'Apparatuur', bedragIncl: 121, btwBedrag: 21, fileId: '', fileName: '' },
        { id: uid(), datum: y + '-11-12', leverancier: 'Voorbeeld Software', omschrijving: 'Abonnement montage', categorie: 'Software', bedragIncl: 30.25, btwBedrag: 5.25, fileId: '', fileName: '' });
      data = d;
      return JSON.parse(JSON.stringify(d));
    };
    this.bewaar = async function (d) { data = JSON.parse(JSON.stringify(d)); };
    this.upload = async function (map, naam, blob) {
      var id = uid(); files[id] = blob; return { id: id, link: null };
    };
    this.download = async function (id) { return files[id]; };
    this.verwijder = async function (id) { delete files[id]; };
    this.mapLink = function () { return null; };
  }

  root.Opslag = { GoogleBackend: GoogleBackend, DemoBackend: DemoBackend, emptyData: emptyData, uid: uid };
})(self);
