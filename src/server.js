// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDataStore } = require('./server/dataStore');
const { mountAuthRoutes } = require('./server/authRoutes');
const { mountPortfolioRoutes } = require('./server/portfolioRoutes');
const { mountQuotesRoutes } = require('./server/quotesRoutes');
const { mountCpiRoutes } = require('./server/cpiRoutes');
const { mountSnapshotRoutes } = require('./server/snapshotRoutes');
const { mountBenchmarkRoutes } = require('./server/benchmarkRoutes');
const { mountSectorRoutes } = require('./server/sectorRoutes');
const { mountAnalystRoutes } = require('./server/analystRoutes');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

mountQuotesRoutes(app);
mountCpiRoutes(app);
mountBenchmarkRoutes(app);
mountSectorRoutes(app);
mountAnalystRoutes(app);

const PORT = Number(process.env.PORT) || 5000;

initDataStore()
  .then((store) => {
    mountAuthRoutes(app, store);
    mountPortfolioRoutes(app, store);
    mountSnapshotRoutes(app, store);
    console.log(`DB: ${store.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'SQLite local file'}`);
    app.listen(PORT, () => {
      console.log(`StockView API http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to init database:', err);
    process.exit(1);
  });
