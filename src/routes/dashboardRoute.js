const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  res.render('dashboard', { title: 'KDS Dashboard' });
});

module.exports = { router };
