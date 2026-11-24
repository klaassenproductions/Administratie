/* Belastingschatting eenmanszaak 2026. Indicatief, geen advies.
 * Bronnen: Belastingdienst (box 1 tarieven 2026, Zvw 2026), KvK/Rabobank (aftrekposten 2026).
 * Bewust weggelaten: heffingskortingen (zitten al in je loonstrook), investeringsaftrek,
 * fiscale oudedagsreserve, voorlopige aanslag-effecten. */
(function (root) {
  var P2026 = {
    jaar: 2026,
    schijven: [
      { tot: 38883, t: 0.3575 },
      { tot: 78426, t: 0.3756 },
      { tot: Infinity, t: 0.495 }
    ],
    zelfstandigenaftrek: 1200,
    startersaftrek: 2123,
    mkb: 0.127,
    zvw: 0.0485,
    zvwMax: 79409,
    aftrekTariefCap: 0.3756 // aftrekposten tellen max. tegen dit tarief mee
  };

  function r2(x) { return Math.round(x * 100) / 100; }

  function belasting(inkomen, p) {
    p = p || P2026;
    var inc = Math.max(0, inkomen), onder = 0, totaal = 0;
    for (var i = 0; i < p.schijven.length; i++) {
      var s = p.schijven[i];
      var deel = Math.max(0, Math.min(inc, s.tot) - onder);
      totaal += deel * s.t;
      onder = s.tot;
    }
    return totaal;
  }

  /* winst: winst uit onderneming vóór ondernemersaftrek
   * loon: bruto jaarloon uit baan (0 als geen baan)
   * urencriterium: true/false -> recht op zelfstandigenaftrek (+startersaftrek) */
  function schatting(o, p) {
    p = p || P2026;
    var winst = Math.max(0, o.winst || 0);
    var loon = Math.max(0, o.loon || 0);
    var aftrekOnd = 0;
    if (o.urencriterium) {
      aftrekOnd = p.zelfstandigenaftrek + (o.starter ? p.startersaftrek : 0);
    }
    aftrekOnd = Math.min(aftrekOnd, winst);
    var naAftrek = winst - aftrekOnd;
    var mkb = naAftrek * p.mkb;
    var belastbaar = naAftrek - mkb;
    var totaleAftrek = winst - belastbaar;

    var ib = belasting(loon + belastbaar, p) - belasting(loon, p);
    // aftrekposten tellen niet tegen meer dan het tarief van schijf 2 mee
    var grens3 = p.schijven[1].tot;
    var deelInSchijf3 = Math.max(0, Math.min(totaleAftrek, loon + winst - grens3));
    ib += deelInSchijf3 * (p.schijven[2].t - p.aftrekTariefCap);

    var zvwRuimte = Math.max(0, p.zvwMax - loon);
    var zvw = Math.min(belastbaar, zvwRuimte) * p.zvw;

    return {
      winst: r2(winst),
      ondernemersaftrek: r2(aftrekOnd),
      mkbVrijstelling: r2(mkb),
      belastbaarInkomen: r2(belastbaar),
      inkomstenbelasting: r2(ib),
      zvw: r2(zvw),
      totaal: r2(ib + zvw)
    };
  }

  var api = { P2026: P2026, belasting: belasting, schatting: schatting };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tax = api;
})(typeof self !== 'undefined' ? self : this);
