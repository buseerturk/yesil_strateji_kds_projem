
const { pool } = require('../db/pool');

async function getTesisler() {
  const [rows] = await pool.query(
    'SELECT tesis_id, tesis_adi FROM tesisler ORDER BY tesis_adi'
  );

  // iş kuralı 1
  if (!rows || rows.length === 0) {
    throw new Error('Sistemde kayıtlı tesis bulunamadı');
  }

  return rows;
}

async function getSenaryoAnaliz({ tesis_id }) {

  // iş kuralı 2
  if (!tesis_id) {
    throw new Error('Tesis seçilmeden senaryo analizi yapılamaz');
  }

  // en güncel yıl
  const [[latestYearRow]] = await pool.query(
    'SELECT MAX(YEAR(donem)) as max_year FROM gerceklesen_veriler WHERE tesis_id = ?',
    [tesis_id]
  );
  const year = latestYearRow?.max_year || new Date().getFullYear();

  //  baz veriler
  const [[baseData]] = await pool.query(
    `SELECT 
       COALESCE(SUM(gv.uretim_mwh), 0) AS baz_uretim,
       COALESCE(SUM(gv.karbon_ton), 0) AS baz_karbon,
       t.kurulu_guc_mw,
       ref.beklenen_kapasite_orani,
       COALESCE(SUM(gv.uretim_mwh * efy.price_tl_mwh), 0) AS baz_gelir,
       COALESCE(SUM(gv.uretim_mwh * (
         tg.uretim_maliyeti_tl_mwh +
         tg.bakim_maliyeti_tl_mwh +
         tg.diger_maliyetler_tl_mwh
       )), 0) AS baz_gider
     FROM tesisler t
     LEFT JOIN gerceklesen_veriler gv 
       ON t.tesis_id = gv.tesis_id AND YEAR(gv.donem) = ?
     LEFT JOIN (
       SELECT YEAR(donem) AS y, AVG(birim_fiyat_tl) AS price_tl_mwh
       FROM enerji_fiyatlari
       GROUP BY YEAR(donem)
     ) efy ON efy.y = YEAR(gv.donem)
     LEFT JOIN tesis_giderleri tg 
       ON gv.tesis_id = tg.tesis_id AND gv.donem = tg.donem
     LEFT JOIN enerji_turu_uretim_referanslari ref 
       ON t.enerji_turu = ref.enerji_turu
     WHERE t.tesis_id = ?
     GROUP BY t.tesis_id, t.kurulu_guc_mw, ref.beklenen_kapasite_orani`,
    [year, tesis_id]
  );

  if (!baseData) {
    throw new Error('Tesis verisi bulunamadı');
  }

  const {
    baz_uretim,
    baz_karbon,
    kurulu_guc_mw,
    beklenen_kapasite_orani,
    baz_gelir,
    baz_gider
  } = baseData;

  const denominator =
    Number(kurulu_guc_mw) * 8760 * Number(beklenen_kapasite_orani);

  const baz_verimlilik =
    denominator > 0 ? Number(baz_uretim) / denominator : 0;

  const baz_net_kar = Number(baz_gelir) - Number(baz_gider);
  const birim_fiyat_tl =
    Number(baz_uretim) > 0 ? Number(baz_gelir) / Number(baz_uretim) : 0;

  // Senaryolar
  const [scenarios] = await pool.query(
    `SELECT senaryo_adi, yatirim_turu,
            beklenen_uretim_artisi_yuzde,
            beklenen_karbon_azaltim_yuzde,
            ek_maliyet_milyonTL
     FROM yatirim_senaryolari
     WHERE tesis_id = ?`,
    [tesis_id]
  );

  const results = scenarios.map(s => {
    const scenario_uretim =
      Number(baz_uretim) * (1 + Number(s.beklenen_uretim_artisi_yuzde) / 100);

    const scenario_verimlilik =
      denominator > 0 ? scenario_uretim / denominator : 0;

    const scenario_karbon =
      Number(baz_karbon) *
      (1 - Number(s.beklenen_karbon_azaltim_yuzde) / 100);

    const ek_maliyet_tl = Number(s.ek_maliyet_milyonTL) * 1_000_000;
    const scenario_gelir = scenario_uretim * birim_fiyat_tl;
    const scenario_gider = Number(baz_gider) + ek_maliyet_tl;
    const scenario_net_kar = scenario_gelir - scenario_gider;

    return {
      senaryo_adi: s.senaryo_adi,
      yatirim_turu: s.yatirim_turu,
      baz_verimlilik,
      senaryo_verimlilik,
      baz_karbon: Number(baz_karbon),
      senaryo_karbon,
      baz_net_kar,
      scenario_net_kar,
      roi_percent:
        ek_maliyet_tl > 0
          ? ((scenario_net_kar - baz_net_kar) / ek_maliyet_tl) * 100
          : 0
    };
  });

  return {
    year,
    tesis_id,
    base_net_profit_tl: baz_net_kar,
    scenarios: results
  };
}
async function createSenaryo(data) {
  const {
    tesis_id,
    senaryo_adi,
    yatirim_turu,
    beklenen_uretim_artisi_yuzde,
    beklenen_karbon_azaltim_yuzde,
    ek_maliyet_milyonTL
  } = data;

  // İş kuralı
  if (beklenen_uretim_artisi_yuzde > 100) {
    throw new Error('Üretim artışı %100’den fazla olamaz');
  }

  await pool.query(
    `INSERT INTO yatirim_senaryolari
     (tesis_id, senaryo_adi, yatirim_turu,
      beklenen_uretim_artisi_yuzde,
      beklenen_karbon_azaltim_yuzde,
      ek_maliyet_milyonTL)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      tesis_id,
      senaryo_adi,
      yatirim_turu,
      beklenen_uretim_artisi_yuzde,
      beklenen_karbon_azaltim_yuzde,
      ek_maliyet_milyonTL
    ]
  );

  return { message: 'Senaryo başarıyla oluşturuldu' };
}
 async function updateSenaryo(id, data) {
  if (!id) throw new Error('Senaryo ID gerekli');

  await pool.query(
    `UPDATE yatirim_senaryolari
     SET senaryo_adi = ?, yatirim_turu = ?,
         beklenen_uretim_artisi_yuzde = ?,
         beklenen_karbon_azaltim_yuzde = ?,
         ek_maliyet_milyonTL = ?
     WHERE senaryo_id = ?`,
    [
      data.senaryo_adi,
      data.yatirim_turu,
      data.beklenen_uretim_artisi_yuzde,
      data.beklenen_karbon_azaltim_yuzde,
      data.ek_maliyet_milyonTL,
      id
    ]
  );

  return { message: 'Senaryo güncellendi' };
}
 
async function deleteSenaryo(id) {
  const [[row]] = await pool.query(
    `SELECT ek_maliyet_milyonTL FROM yatirim_senaryolari WHERE senaryo_id = ?`,
    [id]
  );

  // iş kuralı
  if (!row) throw new Error('Senaryo bulunamadı');

  if (row.ek_maliyet_milyonTL < 0) {
    throw new Error('Negatif ROI içeren senaryo silinemez');
  }

  await pool.query(
    `DELETE FROM yatirim_senaryolari WHERE senaryo_id = ?`,
    [id]
  );

  return { message: 'Senaryo silindi' };
}


async function readSenaryolarByTesis(tesis_id) {
  if (!tesis_id) {
    throw new Error('tesis_id zorunludur');
  }

  const [rows] = await pool.query(
    `SELECT 
        senaryo_id,
        senaryo_adi,
        yatirim_turu,
        beklenen_uretim_artisi_yuzde,
        beklenen_karbon_azaltim_yuzde,
        ek_maliyet_milyonTL
     FROM yatirim_senaryolari
     WHERE tesis_id = ?
     ORDER BY senaryo_adi`,
    [tesis_id]
  );

  return rows;
}


module.exports = {
  getTesisler,
  getSenaryoAnaliz,
  createSenaryo,
  updateSenaryo,
  deleteSenaryo,
  readSenaryolarByTesis   
};

