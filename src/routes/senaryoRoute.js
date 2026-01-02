const express = require('express');
const router = express.Router();
const controller = require('../controllers/senaryoController');

router.get('/senaryolar', controller.getSenaryolarPage);
router.get('/api/senaryo/tesisler', controller.getTesisler);
router.get('/api/senaryo/analiz', controller.getSenaryoAnaliz);

module.exports = { router };
