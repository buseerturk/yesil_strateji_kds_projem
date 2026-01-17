const senaryoService = require('../services/senaryoService');



async function getSenaryolarPage(req, res, next) {
  try {
    res.render('senaryolar', { title: 'KDS - Senaryo Analizi' });
  } catch (err) {
    next(err);
  }
}
async function getTesisler(req, res, next) {
  try {
    const tesisler = await senaryoService.getTesisler();
    res.json(tesisler);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


async function getSenaryoAnaliz(req, res, next) {
  try {
    const result = await senaryoService.getSenaryoAnaliz(req.query);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function createSenaryo(req, res) {
  try {
    const result = await senaryoService.createSenaryo(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function updateSenaryo(req, res) {
  try {
    const result = await senaryoService.updateSenaryo(
      req.params.id,
      req.body
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deleteSenaryo(req, res) {
  try {
    const result = await senaryoService.deleteSenaryo(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getSenaryolar(req, res) {
  try {
    const { tesis_id } = req.query;
    const senaryolar = await senaryoService.getSenaryolarByTesis(tesis_id);
    res.json(senaryolar);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}


module.exports = {
  getSenaryolarPage,
  getTesisler,
  getSenaryoAnaliz,
  createSenaryo,
  updateSenaryo,
  deleteSenaryo,
  getSenaryolar
};

