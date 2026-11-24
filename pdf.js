/* Factuur-PDF (jsPDF, volledig in de browser). */
(function (root) {
  var BLUE = [56, 169, 230], TINT = [232, 244, 252], INK = [18, 50, 74], GREY = [108, 122, 135];

  function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function fmt(x) {
    return (x < 0 ? '-' : '') + Math.abs(x).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function eur(x) { return '€ ' + fmt(x); }
  function datum(iso) {
    if (!iso) return '';
    var m = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' ' + m[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  function plusDagen(iso, n) {
    var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function totalen(f) {
    var sub = 0;
    (f.regels || []).forEach(function (r) { sub += r2((+r.aantal || 0) * (+r.prijs || 0)); });
    sub = r2(sub);
    var btw = r2(sub * (+f.btwPct || 0) / 100);
    return { sub: sub, btw: btw, totaal: r2(sub + btw) };
  }

  function maak(f, inst) {
    var jsPDF = root.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var W = 210, M = 20, y = 0;
    var t = totalen(f);
    var verval = plusDagen(f.datum, +f.termijn || 30);

    function kleur(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function lijnen(arr, x, y0, lh) {
      arr.filter(Boolean).forEach(function (s, i) { doc.text(String(s), x, y0 + i * lh); });
      return y0 + arr.filter(Boolean).length * lh;
    }

    // Kop
    doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]); doc.rect(0, 0, W, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); kleur(INK);
    doc.text(inst.naam || '', M, 24);
    doc.setFontSize(20); kleur(BLUE); doc.text('FACTUUR', W - M, 24, { align: 'right' });

    // Van / Aan
    y = 38;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); kleur(GREY);
    doc.text('VAN', M, y); doc.text('FACTUUR AAN', 110, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); kleur(INK);
    var k = f.klant || {};
    var yl = lijnen([inst.naam, inst.contact, inst.adres, inst.postcodePlaats,
      inst.kvk ? 'KvK: ' + inst.kvk : '', inst.btw ? 'BTW-nr.: ' + inst.btw : '', inst.email], M, y + 6, 5);
    var yr = lijnen([k.naam, k.adres, k.postcodePlaats, k.email, k.tel,
      k.kvk ? 'KvK: ' + k.kvk : '', k.btw ? 'BTW-nr.: ' + k.btw : ''], 110, y + 6, 5);
    y = Math.max(yl, yr) + 6;

    // Meta
    doc.setFillColor(TINT[0], TINT[1], TINT[2]); doc.roundedRect(M, y, W - 2 * M, 22, 2, 2, 'F');
    var meta = [['Factuurnummer', f.nummer], ['Factuurdatum', datum(f.datum)], ['Vervaldatum', datum(verval)], ['Betalingstermijn', (f.termijn || 30) + ' dagen']];
    meta.forEach(function (m, i) {
      var x = M + 5 + i * 41;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); kleur(GREY); doc.text(m[0].toUpperCase(), x, y + 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); kleur(INK); doc.text(String(m[1]), x, y + 15);
    });
    y += 32;

    if (f.betreft) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); kleur(INK); doc.text('Betreft:', M, y);
      doc.setFont('helvetica', 'normal');
      var bl = doc.splitTextToSize(f.betreft, W - 2 * M - 18);
      doc.text(bl, M + 18, y); y += bl.length * 5 + 5;
    }

    // Tabel
    var cx = { oms: M + 3, aant: 118, prijs: 150, bedrag: W - M - 3 };
    function tabelKop() {
      doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]); doc.rect(M, y, W - 2 * M, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.text('Omschrijving', cx.oms, y + 5.5); doc.text('Aantal', cx.aant, y + 5.5, { align: 'right' });
      doc.text('Prijs', cx.prijs, y + 5.5, { align: 'right' }); doc.text('Bedrag', cx.bedrag, y + 5.5, { align: 'right' });
      y += 8;
    }
    tabelKop();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    (f.regels || []).forEach(function (r, i) {
      var oms = doc.splitTextToSize(r.omschrijving || '', 85);
      var h = Math.max(8, oms.length * 5 + 3);
      if (y + h > 255) { doc.addPage(); y = 20; tabelKop(); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); }
      if (i % 2 === 1) { doc.setFillColor(246, 250, 253); doc.rect(M, y, W - 2 * M, h, 'F'); }
      kleur(INK);
      doc.text(oms, cx.oms, y + 5.5);
      doc.text(String(+r.aantal || 0).replace('.', ','), cx.aant, y + 5.5, { align: 'right' });
      doc.text(eur(+r.prijs || 0), cx.prijs, y + 5.5, { align: 'right' });
      doc.text(eur(r2((+r.aantal || 0) * (+r.prijs || 0))), cx.bedrag, y + 5.5, { align: 'right' });
      y += h;
    });
    doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2]); doc.setLineWidth(0.4); doc.line(M, y, W - M, y);

    // Totalen
    if (y > 235) { doc.addPage(); y = 20; }
    y += 7;
    var lx = 130;
    doc.setFont('helvetica', 'normal'); kleur(INK);
    doc.text('Totaal excl. btw', lx, y); doc.text(eur(t.sub), cx.bedrag, y, { align: 'right' }); y += 6;
    doc.text('BTW ' + String(+f.btwPct || 0).replace('.', ',') + '%', lx, y); doc.text(eur(t.btw), cx.bedrag, y, { align: 'right' }); y += 4;
    doc.setFillColor(TINT[0], TINT[1], TINT[2]); doc.roundedRect(lx - 4, y, W - M - lx + 4, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Totaal te betalen', lx, y + 6.8); doc.text(eur(t.totaal), cx.bedrag, y + 6.8, { align: 'right' });
    y += 22;

    // Betaling
    if (y > 245) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Betaling', M, y);
    doc.setFont('helvetica', 'normal'); y += 5.5;
    var intro = doc.splitTextToSize('Graag het totaalbedrag van ' + eur(t.totaal) + ' binnen ' + (f.termijn || 30) +
      ' dagen, uiterlijk ' + datum(verval) + ', overmaken naar:', W - 2 * M);
    doc.text(intro, M, y); y += intro.length * 5 + 1;
    y = lijnen(['IBAN: ' + (inst.iban || ''), 'T.n.v.: ' + (inst.tnv || ''), inst.bank ? 'Bank: ' + inst.bank : '',
      'Onder vermelding van: factuurnummer ' + f.nummer], M, y, 5);

    // Voet
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); kleur(GREY);
      doc.text([inst.naam, inst.kvk ? 'KvK ' + inst.kvk : '', inst.btw ? 'BTW ' + inst.btw : ''].filter(Boolean).join('  •  '), W / 2, 289, { align: 'center' });
    }
    return doc.output('blob');
  }

  root.Fact = { maak: maak, totalen: totalen, eur: eur, fmt: fmt, datum: datum, plusDagen: plusDagen, r2: r2 };
})(self);
