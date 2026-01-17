const { pool } = require('../db/pool');
const dashboardService = require('../services/dashboardService');


async function getKpis(req, res, next) {
  try {
    const data = await dashboardService.getKpis();
    res.json(data);
  } catch (err) {
    console.error('KPIs alınırken hata:', err?.message);
    res.json({
      toplamUretimMWh: 0,
      toplamGelirTL: 0,
      toplamGiderTL: 0,
      toplamKarTL: 0,
      karMarjiYuzde: 0,
      riskliTesisSayisi: 0,
      uyarı: err.message
    });
  }
}

async function getRiskliTesisler(req, res, next) {
  try {
    const details = await dashboardService.getRiskliTesisler();
    res.json(details);
  } catch (err) {
    console.error('Riskli tesisler alınırken hata:', err?.message);
    res.json([]);
  }
}


async function getRiskOzetByEnerjiTuru(req, res, next) {
  try {
    const enerjiTuru = req.query.enerji_turu || 'Doğalgaz';
    const data = await dashboardService.getRiskOzetByEnerjiTuru(enerjiTuru);
    res.json(data);
  } catch (err) {
    console.error('Enerji türü risk özeti alınırken hata:', err?.message);
    res.json({
      enerjiTuru: req.query.enerji_turu || 'Doğalgaz',
      gercekKarbonTonMwh: 0,
      referansKarbonTonMwh: 0,
      farkTonMwh: 0
    });
  }
}

async function getUretimTrend(req, res, next) {
  try {
    const data = await dashboardService.getUretimTrend(req.query.year);
    res.json(data);
  } catch (err) {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    res.json({
      year,
      labels: ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'],
      values: Array(12).fill(0)
    });
  }
}


async function getAvailableYears(req, res, next) {
  try {
    const years = await dashboardService.getAvailableYears();
    res.json(years);
  } catch (err) {
    res.json([]);
  }
}



async function getTesisVerimlilik(req, res, next) {
  try {
    const data = await dashboardService.getTesisVerimlilik(req.query.year);
    res.json(data);
  } catch (err) {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    res.json({
      year,
      labels: [],
      values: [],
      types: []
    });
  }
}


async function getVerimlilikBubble(req, res, next) {
  try {
    const data = await dashboardService.getVerimlilikBubble(req.query.year);
    res.json(data);
  } catch (err) {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    res.json({ year, points: [] });
  }
}


async function getMaliyetGelirKar(req, res, next) {
  try {
    const data = await dashboardService.getMaliyetGelirKar(req.query.year);
    res.json(data);
  } catch (err) {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    res.json({ year, labels: [], gelir: [], maliyet: [], kar: [] });
  }
}


async function getKarbonYogunlugu(req, res, next) {
  try {
    const data = await dashboardService.getKarbonYogunlugu(req.query.year);
    res.json(data);
  } catch (err) {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    res.json({ year, labels: [], values: [], refs: [] });
  }
}


async function getPerformansMatrisi(req, res, next) {
  try {
    const data = await dashboardService.getPerformansMatrisi(req.query.year);
    res.json(data);
  } catch (err) {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    res.json({ year, points: [] });
  }
}


module.exports = { getKpis, getRiskliTesisler, getRiskOzetByEnerjiTuru, getUretimTrend, getAvailableYears, getTesisVerimlilik, getVerimlilikBubble, getMaliyetGelirKar, getKarbonYogunlugu, getPerformansMatrisi };
