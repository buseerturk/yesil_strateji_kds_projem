const express = require('express');
const { getKpis, getRiskliTesisler, getRiskOzetByEnerjiTuru, getUretimTrend, getAvailableYears, getTesisVerimlilik, getVerimlilikBubble, getMaliyetGelirKar, getKarbonYogunlugu, getPerformansMatrisi } = require('../controllers/dashboardController');
const router = express.Router();

router.get('/kpi', getKpis);
router.get('/riskli-tesisler', getRiskliTesisler);
router.get('/risk-ozet', getRiskOzetByEnerjiTuru);
router.get('/trend/uretim', getUretimTrend);
router.get('/trend/years', getAvailableYears);
router.get('/verimlilik', getTesisVerimlilik);
router.get('/verimlilik-bubble', getVerimlilikBubble);
router.get('/maliyet-gelir-kar', getMaliyetGelirKar);
router.get('/karbon-yogunluk', getKarbonYogunlugu);
router.get('/performans-matrisi', getPerformansMatrisi);

router.get('/health/db', async (req, res) => {
  try {
    const { pool, dbConfig } = require('../db/pool');
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    res.json({ ok: true, using: dbConfig });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = { router };
