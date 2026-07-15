const db = require('../db');

function evaluate(formulaJson, costs) {
  let f;
  try { f = JSON.parse(formulaJson); } catch { return { ok:false, error:'Formula JSON invalid' }; }

  if (f.mode === 'weighted_avg') {
    const result = { kain:0, aksesoris:0, jahit:0, lain:0, total:0 };
    const sumBiaya = {};
    costs.filter(c => c.status_validasi === 'validated').forEach(c => {
      if (!sumBiaya[c.tipe_biaya]) sumBiaya[c.tipe_biaya] = 0;
      sumBiaya[c.tipe_biaya] += c.biaya;
    });
    Object.assign(result, sumBiaya);
    result.total = Object.values(sumBiaya).reduce((s,v)=>s+v, 0);
    return { ok:true, result, formulaUsed: 'weighted_avg' };
  }
  if (f.mode === 'custom') {
    const out = {};
    ['kain','aksesoris','jahit','lain'].forEach(k => {
      const mult = (f.multipliers || {})[k] || 0;
      out[k] = costs.filter(c => c.tipe_biaya === k && c.status_validasi === 'validated').reduce((s,c)=>s+c.biaya,0) * mult;
    });
    out.total = Object.values(out).reduce((s,v)=>s+v,0);
    return { ok:true, result: out, formulaUsed: 'custom' };
  }
  return { ok:false, error:'Mode formula tidak dikenal: ' + f.mode };
}

module.exports = { evaluate };