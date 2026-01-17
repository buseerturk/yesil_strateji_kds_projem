const express = require('express');
const router = express.Router();
const controller = require('../controllers/senaryoController');

router.get('/senaryolar', controller.getSenaryolarPage);
router.get('/api/senaryo/tesisler', controller.getTesisler);
router.get('/api/senaryo/analiz', controller.getSenaryoAnaliz);

router.post('/api/senaryo', controller.createSenaryo);
router.put('/api/senaryo/:id', controller.updateSenaryo);
router.delete('/api/senaryo/:id', controller.deleteSenaryo);
router.get('/api/senaryolar/:tesis_id', controller.getSenaryolar);

module.exports = { router };
