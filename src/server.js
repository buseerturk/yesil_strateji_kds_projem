const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
require('dotenv').config({ override: true });

const { router: dashboardRouter } = require('./routes/dashboardRoute');
const { router: senaryoRouter } = require('./routes/senaryoRoute');
const { router: apiRouter } = require('./routes/apiRoute');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use('/public', express.static(path.join(__dirname, '../public')));

app.use('/', dashboardRouter);
app.use('/', senaryoRouter);
app.use('/api', apiRouter);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Sunucu hatası' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KDS sunucusu port ${PORT} üzerinde çalışıyor`);
});
