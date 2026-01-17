const { pool } = require('../db/pool');

async function getAvailableYears() {
  const [rows] = await pool.query(
    `SELECT DISTINCT YEAR(donem) AS y
     FROM gerceklesen_veriler
     ORDER BY y DESC`
  );

  // iş kuralı (1): Hiç yıl yoksa uyar
  if (!rows || rows.length === 0) {
    throw new Error("Sistemde raporlanabilir yıl bulunamadı");
  }

  return rows.map(r => Number(r.y));
}

async function getKpis() {
  const [[{ total_production }]] = await pool.query(
    'SELECT COALESCE(SUM(uretim_mwh),0) AS total_production FROM gerceklesen_veriler'
  );

  // iş kuralı (2): Üretim yoksa KPI hesaplanamaz
  if (Number(total_production) === 0) {
    throw new Error("Üretim verisi yok, KPI hesaplanamaz");
  }

  const [[{ total_revenue }]] = await pool.query(
    `SELECT COALESCE(SUM(gv.uretim_mwh * ef.birim_fiyat_tl),0) AS total_revenue
     FROM gerceklesen_veriler gv
     JOIN enerji_fiyatlari ef ON gv.donem = ef.donem`
  );

  const [[{ total_cost }]] = await pool.query(
    `SELECT COALESCE(SUM(gv.uretim_mwh * (
      tg.uretim_maliyeti_tl_mwh +
      tg.bakim_maliyeti_tl_mwh +
      tg.diger_maliyetler_tl_mwh
    )),0) AS total_cost
     FROM gerceklesen_veriler gv
     JOIN tesis_giderleri tg
       ON gv.tesis_id = tg.tesis_id
      AND gv.donem = tg.donem`
  );

  const profit = Number(total_revenue) - Number(total_cost);
  const margin = Number(total_revenue) > 0
    ? (profit / Number(total_revenue)) * 100
    : 0;

  const [riskRows] = await pool.query(
    `SELECT t.tesis_id
     FROM gerceklesen_veriler gv
     JOIN tesisler t ON gv.tesis_id = t.tesis_id
     JOIN enerji_turu_karbon_referanslari r ON t.enerji_turu = r.enerji_turu
     GROUP BY t.tesis_id
     HAVING (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0))
            > MAX(r.kabul_edilebilir_karbon_ton_mwh)`
  );

  return {
    toplamUretimMWh: Number(total_production),
    toplamGelirTL: Number(total_revenue),
    toplamGiderTL: Number(total_cost),
    toplamKarTL: profit,
    karMarjiYuzde: margin,
    riskliTesisSayisi: riskRows.length
  };
}

async function getRiskliTesisler() {
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
     HAVING (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0))
            > MAX(r.kabul_edilebilir_karbon_ton_mwh)
     ORDER BY (SUM(gv.karbon_ton) / NULLIF(SUM(gv.uretim_mwh),0))
              - MAX(r.kabul_edilebilir_karbon_ton_mwh) DESC`
  );

  // iş kuralı (3):
  // riskli tesis yoksa boş liste dön
  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map(r => ({
    tesisId: r.tesis_id,
    tesisAdi: r.tesis_adi,
    enerjiTuru: r.enerji_turu,
    karbonTonMwh: Number(r.karbon_ton_mwh),
    referansKarbonTonMwh: Number(r.ref_karbon_ton_mwh),
    farkTonMwh: Number(r.karbon_ton_mwh) - Number(r.ref_karbon_ton_mwh),
  }));
}

async function getRiskOzetByEnerjiTuru(enerjiTuru = 'Doğalgaz') {
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

  // iş kuralı (4):
  // seçilen enerji türü için veri yoksa sıfır dön
  if (!row) {
    return {
      enerjiTuru,
      gercekKarbonTonMwh: 0,
      referansKarbonTonMwh: 0,
      farkTonMwh: 0
    };
  }

  const gercek = Number(row.gercek_karbon_ton_mwh);
  const ref = Number(row.referans_karbon_ton_mwh);

  return {
    enerjiTuru,
    gercekKarbonTonMwh: gercek,
    referansKarbonTonMwh: ref,
    farkTonMwh: gercek - ref
  };
}

async function getUretimTrend(year) {
  const selectedYear = parseInt(year || new Date().getFullYear(), 10);

  const [rows] = await pool.query(
    `SELECT MONTH(donem) AS m, COALESCE(SUM(uretim_mwh),0) AS total
     FROM gerceklesen_veriler
     WHERE YEAR(donem) = ?
     GROUP BY m
     ORDER BY m ASC`,
    [selectedYear]
  );

  const monthMap = new Map(rows.map(r => [Number(r.m), Number(r.total)]));
  const labels = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const values = Array.from({ length: 12 }, (_, i) => monthMap.get(i + 1) || 0);

  // iş kuralı (5):
  // seçilen yılda hiç üretim yoksa yine de 12 aylık boş grafik dön
  return {
    year: selectedYear,
    labels,
    values
  };
}

async function getTesisVerimlilik(year) {
  const selectedYear = parseInt(year || new Date().getFullYear(), 10);

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
    [selectedYear]
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

  // iş kuralı (6):
  // Tesis olsa bile üretim yoksa verim 0 kabul edilir
  return {
    year: selectedYear,
    labels,
    values,
    types
  };
}

async function getVerimlilikBubble(year) {
  const selectedYear = parseInt(year || new Date().getFullYear(), 10);

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
    [selectedYear, selectedYear]
  );

  const points = rows.map(r => {
    const kapasite = Number(r.beklenen_kapasite_orani);
    const oran = kapasite > 1 ? kapasite / 100 : kapasite;
    const denom = Number(r.kurulu_guc_mw) * 8760 * oran;
    const eff = denom > 0 ? Number(r.uretim_mwh) / denom : 0;
    const ci = Number(r.uretim_mwh) > 0
      ? Number(r.karbon_ton) / Number(r.uretim_mwh)
      : 0;

    return {
      name: r.tesis_adi,
      enerjiTuru: r.enerji_turu,
      x: Number(r.kurulu_guc_mw),
      y: eff,
      ci
    };
  });

  const maxCi = Math.max(0, ...points.map(p => p.ci));
  const sized = points.map(p => ({
    ...p,
    ciNorm: maxCi > 0 ? p.ci / maxCi : 0
  }));

  // iş kuralı (7): Veri yoksa boş bubble dön
  return {
    year: selectedYear,
    points: sized
  };
}

async function getMaliyetGelirKar(year) {
  const selectedYear = parseInt(year || new Date().getFullYear(), 10);

  const [rows] = await pool.query(
    `SELECT t.tesis_id,
            t.tesis_adi,
            SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh * COALESCE(efy.price_tl_mwh,0) END) AS gelir_tl,
            SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh *
              COALESCE((tg.uretim_maliyeti_tl_mwh +
                        tg.bakim_maliyeti_tl_mwh +
                        tg.diger_maliyetler_tl_mwh),0)
            END) AS maliyet_tl
     FROM tesisler t
     LEFT JOIN gerceklesen_veriler gv ON gv.tesis_id = t.tesis_id
     LEFT JOIN (
       SELECT YEAR(donem) AS y, AVG(birim_fiyat_tl) AS price_tl_mwh
       FROM enerji_fiyatlari
       GROUP BY YEAR(donem)
     ) efy ON efy.y = YEAR(gv.donem)
     LEFT JOIN tesis_giderleri tg
       ON gv.tesis_id = tg.tesis_id
      AND gv.donem = tg.donem
     GROUP BY t.tesis_id, t.tesis_adi
     ORDER BY t.tesis_adi ASC`,
    [selectedYear, selectedYear]
  );

  const labels = rows.map(r => r.tesis_adi);
  const gelir = rows.map(r => Number(r.gelir_tl || 0));
  const maliyet = rows.map(r => Number(r.maliyet_tl || 0));
  const kar = gelir.map((g, i) => g - (maliyet[i] || 0));

  // iş kuralı (8): Gelir–maliyet yoksa 0 kabul edilir
  return {
    year: selectedYear,
    labels,
    gelir,
    maliyet,
    kar
  };
}

async function getKarbonYogunlugu(year) {
  const selectedYear = parseInt(year || new Date().getFullYear(), 10);

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
    [selectedYear, selectedYear]
  );

  const labels = [];
  const values = [];
  const refs = [];

  rows.forEach(r => {
    const ci = Number(r.uretim_mwh) > 0
      ? Number(r.karbon_ton) / Number(r.uretim_mwh)
      : 0;

    labels.push(r.tesis_adi);
    values.push(Number(ci));
    refs.push(Number(r.ref_ton_mwh || 0));
  });

  // iş kuralı (9):
  // Üretim yoksa karbon yoğunluğu 0 kabul edilir
  return {
    year: selectedYear,
    labels,
    values,
    refs
  };
}

async function getPerformansMatrisi(year) {
  const selectedYear = parseInt(year || new Date().getFullYear(), 10);

  const [rows] = await pool.query(
    `SELECT t.tesis_id, t.tesis_adi, t.enerji_turu, t.kurulu_guc_mw,
            COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh END),0) AS uretim_mwh,
            COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.karbon_ton END),0) AS karbon_ton,
            COALESCE(ur.beklenen_kapasite_orani, 1) AS beklenen_kapasite_orani,
            COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh * efy.price_tl_mwh END),0) AS gelir_tl,
            COALESCE(SUM(CASE WHEN YEAR(gv.donem)=? THEN gv.uretim_mwh *
              (tg.uretim_maliyeti_tl_mwh + tg.bakim_maliyeti_tl_mwh + tg.diger_maliyetler_tl_mwh)
            END),0) AS maliyet_tl
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
    [selectedYear, selectedYear, selectedYear, selectedYear]
  );

  const points = rows.map(r => {
    const prod = Number(r.uretim_mwh);
    const kapasite = Number(r.beklenen_kapasite_orani);
    const oran = kapasite > 1 ? kapasite / 100 : kapasite;
    const denom = Number(r.kurulu_guc_mw) * 8760 * oran;

    const efficiency = denom > 0 ? prod / denom : 0;
    const carbonIntensity = prod > 0 ? Number(r.karbon_ton) / prod : 0;

    const netProfit = Number(r.gelir_tl) - Number(r.maliyet_tl);
    const profitPerMwh = prod > 0 ? netProfit / prod : 0;

    return {
      name: r.tesis_adi,
      enerjiTuru: r.enerji_turu,
      efficiency,
      carbonIntensity,
      profitPerMwh
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
    ci: p.carbonIntensity
  }));

 
  return {
    year: selectedYear,
    points: normalized
  };
}


module.exports = {
  getAvailableYears,
  getKpis,
  getRiskliTesisler,
  getRiskOzetByEnerjiTuru,
  getUretimTrend,
  getTesisVerimlilik,
  getVerimlilikBubble,
  getMaliyetGelirKar,
  getKarbonYogunlugu,
  getPerformansMatrisi
};



