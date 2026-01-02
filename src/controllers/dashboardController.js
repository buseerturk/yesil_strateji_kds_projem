const { pool } = require('../db/pool');

async function getKpis(req, res, next) {
  try {
    const [[{ total_production }]] = await pool.query(
      'SELECT COALESCE(SUM(uretim_mwh),0) AS total_production FROM gerceklesen_veriler'
    );

    const [[{ total_revenue }]] = await pool.query(
      `SELECT COALESCE(SUM(gv.uretim_mwh * ef.birim_fiyat_tl),0) AS total_revenue
       FROM gerceklesen_veriler gv
       JOIN enerji_fiyatlari ef ON gv.donem = ef.donem`
    );

    const [[{ total_cost }]] = await pool.query(
      `SELECT COALESCE(SUM(gv.uretim_mwh * (tg.uretim_maliyeti_tl_mwh + tg.bakim_maliyeti_tl_mwh + tg.diger_maliyetler_tl_mwh)),0) AS total_cost
       FROM gerceklesen_veriler gv
       JOIN tesis_giderleri tg ON gv.tesis_id = tg.tesis_id AND gv.donem = tg.donem`
    );

    const profit = Number(total_revenue) - Number(total_cost);
    const margin = Number(total_revenue) > 0 ? (profit / Number(total_revenue)) * 100 : 0;

    const [riskRows] = await pool.query(
      `SELECT t.tesis_id
       FROM gerceklesen_veriler gv
       JOIN tesisler t ON gv.tesis_id = t.tesis_id
       JOIN enerji_turu_karbon_referanslari r ON t.enerji_turu = r.enerji_turu
       GROUP BY t.tesis_id
       HAVING (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0)) > MAX(r.kabul_edilebilir_karbon_ton_mwh)`
    );
    const risk_count = riskRows.length;

    res.json({
      toplamUretimMWh: Number(total_production),
      toplamGelirTL: Number(total_revenue),
      toplamGiderTL: Number(total_cost),
      toplamKarTL: profit,
      karMarjiYuzde: margin,
      riskliTesisSayisi: Number(risk_count),
    });
  } catch (err) {
    console.error('KPIs alınırken hata:', err?.message);
    res.json({
      toplamUretimMWh: 0,
      toplamGelirTL: 0,
      toplamGiderTL: 0,
      toplamKarTL: 0,
      karMarjiYuzde: 0,
      riskliTesisSayisi: 0,
      uyarı: 'Veritabanına bağlanılamadı veya sorgu hatası. Ortam değişkenlerini kontrol edin.'
    });
  }
}

async function getRiskliTesisler(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT t.tesis_id, t.tesis_adi, t.enerji_turu,
              MAX(r.kabul_edilebilir_karbon_ton_mwh) AS ref_karbon_ton_mwh,
              SUM(gv.karbon_ton) AS toplam_karbon_ton,
              SUM(gv.uretim_mwh) AS toplam_uretim_mwh,
              (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0)) AS karbon_ton_mwh
       FROM gerceklesen_veriler gv
       JOIN tesisler t ON gv.tesis_id = t.tesis_id
       JOIN enerji_turu_karbon_referanslari r ON t.enerji_turu = r.enerji_turu
       GROUP BY t.tesis_id, t.tesis_adi, t.enerji_turu
       HAVING (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0)) > MAX(r.kabul_edilebilir_karbon_ton_mwh)
       ORDER BY (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0)) - MAX(r.kabul_edilebilir_karbon_ton_mwh) DESC`
    );

    const details = rows.map((r) => ({
      tesisId: r.tesis_id,
      tesisAdi: r.tesis_adi,
      enerjiTuru: r.enerji_turu,
      karbonTonMwh: Number(r.karbon_ton_mwh),
      referansKarbonTonMwh: Number(r.ref_karbon_ton_mwh),
      farkTonMwh: Number(r.karbon_ton_mwh) - Number(r.ref_karbon_ton_mwh),
    }));

    res.json(details);
  } catch (err) {
    console.error('Riskli tesisler alınırken hata:', err?.message);
    res.json([]);
  }
}

async function getRiskOzetByEnerjiTuru(req, res, next) {
  try {
    const enerjiTuru = req.query.enerji_turu || 'Doğalgaz';
    const [[row]] = await pool.query(
      `SELECT t.enerji_turu,
              SUM(gv.karbon_ton) AS toplam_karbon_ton,
              SUM(gv.uretim_mwh) AS toplam_uretim_mwh,
              (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0)) AS gercek_karbon_ton_mwh,
              r.kabul_edilebilir_karbon_ton_mwh AS referans_karbon_ton_mwh
       FROM gerceklesen_veriler gv
       JOIN tesisler t ON gv.tesis_id = t.tesis_id
       JOIN enerji_turu_karbon_referanslari r ON t.enerji_turu = r.enerji_turu
       WHERE t.enerji_turu = ?
       GROUP BY t.enerji_turu, r.kabul_edilebilir_karbon_ton_mwh`,
      [enerjiTuru]
    );

    if (!row) return res.json({ enerjiTuru, gercekKarbonTonMwh: 0, referansKarbonTonMwh: 0, farkTonMwh: 0 });

    const gercek = Number(row.gercek_karbon_ton_mwh);
    const ref = Number(row.referans_karbon_ton_mwh);
    res.json({
      enerjiTuru,
      gercekKarbonTonMwh: gercek,
      referansKarbonTonMwh: ref,
      farkTonMwh: gercek - ref,
    });
  } catch (err) {
    console.error('Enerji türü risk özeti alınırken hata:', err?.message);
    res.json({ enerjiTuru: req.query.enerji_turu || 'Doğalgaz', gercekKarbonTonMwh: 0, referansKarbonTonMwh: 0, farkTonMwh: 0 });
  }
}

async function getUretimTrend(req, res, next) {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    const [rows] = await pool.query(
      `SELECT MONTH(donem) AS m, COALESCE(SUM(uretim_mwh),0) AS total
       FROM gerceklesen_veriler
       WHERE YEAR(donem) = ?
       GROUP BY m
       ORDER BY m ASC`,
      [year]
    );
    const monthMap = new Map(rows.map(r => [Number(r.m), Number(r.total)]));
    const trMonths = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    const labels = trMonths;
    const values = Array.from({length:12}, (_,i) => monthMap.get(i+1) || 0);
    res.json({ year, labels, values });
  } catch (err) {
    res.json({ year: parseInt(req.query.year || new Date().getFullYear(), 10), labels: ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'], values: Array(12).fill(0) });
  }
}

async function getAvailableYears(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT YEAR(donem) AS y
       FROM gerceklesen_veriler
       ORDER BY y DESC`
    );
    res.json(rows.map(r => Number(r.y)));
  } catch (err) {
    res.json([]);
  }
}

async function getTesisVerimlilik(req, res, next) {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    const [rows] = await pool.query(
      `SELECT t.tesis_id,
              t.tesis_adi,
              t.enerji_turu,
              t.kurulu_guc_mw,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh END),0) AS gercek_uretim_mwh,
              COALESCE(ur.beklenen_kapasite_orani, 1) AS beklenen_kapasite_orani
       FROM tesisler t
       LEFT JOIN gerceklesen_veriler gv ON gv.tesis_id = t.tesis_id
       LEFT JOIN enerji_turu_uretim_referanslari ur ON ur.enerji_turu = t.enerji_turu
       GROUP BY t.tesis_id, t.tesis_adi, t.enerji_turu, t.kurulu_guc_mw, ur.beklenen_kapasite_orani
       ORDER BY t.tesis_adi ASC`,
      [year]
    );

    const labels = [];
    const values = [];
    const types = [];
    rows.forEach(r => {
      const kapasite = Number(r.beklenen_kapasite_orani);
      const oran = kapasite > 1 ? kapasite / 100 : kapasite;
      const denom = Number(r.kurulu_guc_mw) * 8760 * oran;
      const verim = denom > 0 ? Number(r.gercek_uretim_mwh) / denom : 0;
      labels.push(r.tesis_adi);
      values.push(Number((verim * 100).toFixed(2)));
      types.push(r.enerji_turu);
    });

    res.json({ year, labels, values, types });
  } catch (err) {
    res.json({ year: parseInt(req.query.year || new Date().getFullYear(), 10), labels: [], values: [], types: [] });
  }
}

async function getVerimlilikBubble(req, res, next) {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    const [rows] = await pool.query(
      `SELECT t.tesis_id, t.tesis_adi, t.enerji_turu, t.kurulu_guc_mw,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh END),0) AS uretim_mwh,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.karbon_ton END),0) AS karbon_ton,
              COALESCE(ur.beklenen_kapasite_orani, 1) AS beklenen_kapasite_orani
       FROM tesisler t
       LEFT JOIN gerceklesen_veriler gv ON gv.tesis_id = t.tesis_id
       LEFT JOIN enerji_turu_uretim_referanslari ur ON ur.enerji_turu = t.enerji_turu
       GROUP BY t.tesis_id, t.tesis_adi, t.enerji_turu, t.kurulu_guc_mw, ur.beklenen_kapasite_orani
       ORDER BY t.tesis_adi ASC`,
      [year, year]
    );

    const points = rows.map(r => {
      const kapasite = Number(r.beklenen_kapasite_orani);
      const oran = kapasite > 1 ? kapasite / 100 : kapasite;
      const denom = Number(r.kurulu_guc_mw) * 8760 * oran;
      const eff = denom > 0 ? Number(r.uretim_mwh) / denom : 0;
      const ci = Number(r.uretim_mwh) > 0 ? Number(r.karbon_ton) / Number(r.uretim_mwh) : 0;
      return {
        name: r.tesis_adi,
        enerjiTuru: r.enerji_turu,
        x: Number(r.kurulu_guc_mw),
        y: eff,
        ci,
      };
    });

    const maxCi = Math.max(0, ...points.map(p => p.ci));
    const sized = points.map(p => ({
      ...p,
      ciNorm: maxCi > 0 ? p.ci / maxCi : 0,
    }));

    res.json({ year, points: sized });
  } catch (err) {
    res.json({ year: parseInt(req.query.year || new Date().getFullYear(), 10), points: [] });
  }
}

async function getMaliyetGelirKar(req, res, next) {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    const [rows] = await pool.query(
      `SELECT t.tesis_id,
              t.tesis_adi,
              SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh * COALESCE(efy.price_tl_mwh,0) END) AS gelir_tl,
              SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh * COALESCE((tg.uretim_maliyeti_tl_mwh + tg.bakim_maliyeti_tl_mwh + tg.diger_maliyetler_tl_mwh),0) END) AS maliyet_tl
       FROM tesisler t
       LEFT JOIN gerceklesen_veriler gv ON gv.tesis_id = t.tesis_id
       LEFT JOIN (
         SELECT YEAR(donem) AS y, AVG(birim_fiyat_tl) AS price_tl_mwh
         FROM enerji_fiyatlari
         GROUP BY YEAR(donem)
       ) efy ON efy.y = YEAR(gv.donem)
       LEFT JOIN tesis_giderleri tg ON gv.tesis_id = tg.tesis_id AND gv.donem = tg.donem
       GROUP BY t.tesis_id, t.tesis_adi
       ORDER BY t.tesis_adi ASC`,
      [year, year]
    );
    const labels = rows.map(r => r.tesis_adi);
    const gelir = rows.map(r => Number(r.gelir_tl || 0));
    const maliyet = rows.map(r => Number(r.maliyet_tl || 0));
    const kar = gelir.map((g,i) => Number(g) - Number(maliyet[i] || 0));
    res.json({ year, labels, gelir, maliyet, kar });
  } catch (err) {
    res.json({ year: parseInt(req.query.year || new Date().getFullYear(), 10), labels: [], gelir: [], maliyet: [], kar: [] });
  }
}

async function getKarbonYogunlugu(req, res, next) {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    const [rows] = await pool.query(
      `SELECT t.tesis_id, t.tesis_adi, t.enerji_turu,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.karbon_ton END),0) AS karbon_ton,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh END),0) AS uretim_mwh,
              MAX(r.kabul_edilebilir_karbon_ton_mwh) AS ref_ton_mwh
       FROM gerceklesen_veriler gv
       JOIN tesisler t ON gv.tesis_id = t.tesis_id
       LEFT JOIN enerji_turu_karbon_referanslari r ON t.enerji_turu = r.enerji_turu
       GROUP BY t.tesis_id, t.tesis_adi, t.enerji_turu
       ORDER BY t.tesis_adi ASC`,
      [year, year]
    );
    const labels = [];
    const values = [];
    const refs = [];
    rows.forEach(r => {
      const ci = Number(r.uretim_mwh) > 0 ? Number(r.karbon_ton) / Number(r.uretim_mwh) : 0;
      labels.push(r.tesis_adi);
      values.push(Number(ci));
      refs.push(Number(r.ref_ton_mwh || 0));
    });
    res.json({ year, labels, values, refs });
  } catch (err) {
    res.json({ year: parseInt(req.query.year || new Date().getFullYear(), 10), labels: [], values: [], refs: [] });
  }
}

async function getPerformansMatrisi(req, res, next) {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    const [rows] = await pool.query(
      `SELECT t.tesis_id, t.tesis_adi, t.enerji_turu, t.kurulu_guc_mw,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh END),0) AS uretim_mwh,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.karbon_ton END),0) AS karbon_ton,
              COALESCE(ur.beklenen_kapasite_orani, 1) AS beklenen_kapasite_orani,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh * efy.price_tl_mwh END),0) AS gelir_tl,
              COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh * (tg.uretim_maliyeti_tl_mwh + tg.bakim_maliyeti_tl_mwh + tg.diger_maliyetler_tl_mwh) END),0) AS maliyet_tl
       FROM tesisler t
       LEFT JOIN gerceklesen_veriler gv ON gv.tesis_id = t.tesis_id
       LEFT JOIN (
         SELECT YEAR(donem) AS y, AVG(birim_fiyat_tl) AS price_tl_mwh
         FROM enerji_fiyatlari
         GROUP BY YEAR(donem)
       ) efy ON efy.y = YEAR(gv.donem)
       LEFT JOIN tesis_giderleri tg ON gv.tesis_id = tg.tesis_id AND gv.donem = tg.donem
       LEFT JOIN enerji_turu_uretim_referanslari ur ON ur.enerji_turu = t.enerji_turu
       GROUP BY t.tesis_id, t.tesis_adi, t.enerji_turu, t.kurulu_guc_mw, ur.beklenen_kapasite_orani
       ORDER BY t.tesis_adi ASC`,
      [year, year, year, year]
    );

    const points = rows.map(r => {
      const prod = Number(r.uretim_mwh);
      const kapasite = Number(r.beklenen_kapasite_orani);
      const oran = kapasite > 1 ? kapasite / 100 : kapasite;
      const denom = Number(r.kurulu_guc_mw) * 8760 * oran;
      const eff = denom > 0 ? prod / denom : 0;
      const ci = prod > 0 ? Number(r.karbon_ton) / prod : 0;
      const netProfit = Number(r.gelir_tl) - Number(r.maliyet_tl);
      const netPerMwh = prod > 0 ? netProfit / prod : 0;
      return {
        name: r.tesis_adi,
        enerjiTuru: r.enerji_turu,
        efficiency: eff,
        carbonIntensity: ci,
        profitPerMwh: netPerMwh,
      };
    });

    const maxEff = Math.max(0, ...points.map(p => p.efficiency));
    const maxCi = Math.max(0, ...points.map(p => p.carbonIntensity));
    const normalized = points.map(p => ({
      name: p.name,
      enerjiTuru: p.enerjiTuru,
      x: maxEff > 0 ? p.efficiency / maxEff : 0,
      y: p.profitPerMwh,
      ciNorm: maxCi > 0 ? p.carbonIntensity / maxCi : 0,
      ci: p.carbonIntensity,
    }));

    res.json({ year, points: normalized });
  } catch (err) {
    res.json({ year: parseInt(req.query.year || new Date().getFullYear(), 10), points: [] });
  }
}

module.exports = { getKpis, getRiskliTesisler, getRiskOzetByEnerjiTuru, getUretimTrend, getAvailableYears, getTesisVerimlilik, getVerimlilikBubble, getMaliyetGelirKar, getKarbonYogunlugu, getPerformansMatrisi };
