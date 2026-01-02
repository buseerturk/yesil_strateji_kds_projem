const { pool } = require('../db/pool');

async function getSenaryolarPage(req, res, next) {
  try {
    res.render('senaryolar', { title: 'KDS - Senaryo Analizi' });
  } catch (err) {
    next(err);
  }
}

async function getTesisler(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT tesis_id, tesis_adi FROM tesisler ORDER BY tesis_adi');
    res.json(rows);
  } catch (err) {
    console.error('Tesisler alınırken hata:', err.message);
    res.status(500).json({ error: 'Tesisler alınamadı' });
  }
}

async function getSenaryoAnaliz(req, res, next) {
  const { tesis_id } = req.query;
  if (!tesis_id) {
    return res.status(400).json({ error: 'tesis_id gerekli' });
  }

  try {
    
    const [[latestYearRow]] = await pool.query(
      'SELECT MAX(YEAR(donem)) as max_year FROM gerceklesen_veriler WHERE tesis_id = ?',
      [tesis_id]
    );
    const year = latestYearRow?.max_year || new Date().getFullYear();

    const [[baseData]] = await pool.query(
      `SELECT 
         COALESCE(SUM(gv.uretim_mwh), 0) AS baz_uretim,
         COALESCE(SUM(gv.karbon_ton), 0) AS baz_karbon,
         t.kurulu_guc_mw,
         ref.beklenen_kapasite_orani,
         COALESCE(SUM(gv.uretim_mwh * efy.price_tl_mwh), 0) AS baz_gelir,
         COALESCE(SUM(gv.uretim_mwh * (tg.uretim_maliyeti_tl_mwh + tg.bakim_maliyeti_tl_mwh + tg.diger_maliyetler_tl_mwh)), 0) AS baz_gider
       FROM tesisler t
       LEFT JOIN gerceklesen_veriler gv ON t.tesis_id = gv.tesis_id AND YEAR(gv.donem) = ?
       LEFT JOIN (
         SELECT YEAR(donem) AS y, AVG(birim_fiyat_tl) AS price_tl_mwh
         FROM enerji_fiyatlari
         GROUP BY YEAR(donem)
       ) efy ON efy.y = YEAR(gv.donem)
       LEFT JOIN tesis_giderleri tg ON gv.tesis_id = tg.tesis_id AND gv.donem = tg.donem
       LEFT JOIN enerji_turu_uretim_referanslari ref ON t.enerji_turu = ref.enerji_turu
       WHERE t.tesis_id = ?
       GROUP BY t.tesis_id, t.kurulu_guc_mw, ref.beklenen_kapasite_orani`,
      [year, tesis_id]
    );

    if (!baseData) {
      return res.status(404).json({ error: 'Tesis verisi bulunamadı' });
    }

    const { baz_uretim, baz_karbon, kurulu_guc_mw, beklenen_kapasite_orani, baz_gelir, baz_gider } = baseData;
    
    // Verimlilik = Toplam Üretim / (Kurulu Güç * 8760 * Kapasite Oranı)
    const capacityRatio = Number(beklenen_kapasite_orani); 
    
    const denominator = Number(kurulu_guc_mw) * 8760 * capacityRatio;
    const baz_verimlilik = denominator > 0 ? (Number(baz_uretim) / denominator) : 0;
    const baz_net_kar = Number(baz_gelir) - Number(baz_gider);
    const birim_fiyat_tl = Number(baz_uretim) > 0 ? Number(baz_gelir) / Number(baz_uretim) : 0;

    // 2. Get Scenarios
    const [scenarios] = await pool.query(
      'SELECT senaryo_id, senaryo_adi, yatirim_turu, beklenen_uretim_artisi_yuzde, beklenen_karbon_azaltim_yuzde, ek_maliyet_milyonTL FROM yatirim_senaryolari WHERE tesis_id = ?',
      [tesis_id]
    );

    // 3. Calculate Scenario Efficiencies & Carbon
    const results = scenarios.map(s => {
      // Efficiency Calc
      const increasePct = Number(s.beklenen_uretim_artisi_yuzde);
      const scenario_uretim = Number(baz_uretim) * (1 + increasePct / 100);
      const scenario_verimlilik = denominator > 0 ? (scenario_uretim / denominator) : 0;
      
      // Carbon Calc
      const decreasePct = Number(s.beklenen_karbon_azaltim_yuzde);
      const scenario_karbon = Number(baz_karbon) * (1 - decreasePct / 100);

      // Financials & ROI
      const ek_maliyet_tl = Number(s.ek_maliyet_milyonTL) * 1000000;
      const scenario_gelir = scenario_uretim * birim_fiyat_tl;
      const scenario_gider = Number(baz_gider) + ek_maliyet_tl;
      const scenario_net_kar = scenario_gelir - scenario_gider;
      const net_kar_degisim = scenario_net_kar - baz_net_kar;
      const roi_percent = ek_maliyet_tl > 0 ? (net_kar_degisim / ek_maliyet_tl) * 100 : 0;

      return {
        senaryo_adi: s.senaryo_adi,
        yatirim_turu: s.yatirim_turu,
        baz_verimlilik: baz_verimlilik, 
        senaryo_verimlilik: scenario_verimlilik,
        artis_yuzde: increasePct,
        baz_karbon: Number(baz_karbon),
        senaryo_karbon: scenario_karbon,
        azalis_yuzde: decreasePct,
        ek_maliyet_tl,
        baz_net_kar,
        scenario_net_kar,
        net_kar_degisim_tl: net_kar_degisim,
        roi_percent
      };
    });

    res.json({
      year,
      tesis_id,
      base_efficiency: baz_verimlilik,
      base_carbon: Number(baz_karbon),
      base_revenue_tl: Number(baz_gelir),
      base_cost_tl: Number(baz_gider),
      base_net_profit_tl: baz_net_kar,
      scenarios: results
    });

  } catch (err) {
    console.error('Senaryo analizi hatası:', err.message);
    res.status(500).json({ error: 'Analiz yapılamadı' });
  }
}

module.exports = {
  getSenaryolarPage,
  getTesisler,
  getSenaryoAnaliz
};
