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
const { mountMonthlySnapshotRoutes } = require('./server/monthlySnapshotRoutes');
const { mountBenchmarkRoutes } = require('./server/benchmarkRoutes');
const { mountSectorRoutes } = require('./server/sectorRoutes');
const { mountAnalystRoutes } = require('./server/analystRoutes');
const { mountRebalanceRoutes } = require('./server/rebalanceRoutes');
const { mountDividendRoutes } = require('./server/dividendRoutes');
const { mountStockSearchRoutes } = require('./server/stockSearchRoutes');
const { mountHistoricalPricesRoutes } = require('./server/historicalPricesRoutes');
const { mountTransactionRoutes } = require('./server/transactionRoutes');
const { initFeatureStore } = require('./server/featureStore');
const { createMarketData } = require('./server/alertEngine');
const { mountAlertRoutes } = require('./server/alertRoutes');
const { createJobRunner } = require('./server/jobRunner');
const { createJobHandlers } = require('./server/jobs');
const { mountInternalJobRoutes } = require('./server/internalJobRoutes');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

mountQuotesRoutes(app);
mountCpiRoutes(app);
mountBenchmarkRoutes(app);
mountSectorRoutes(app);
mountAnalystRoutes(app);
mountDividendRoutes(app);
mountStockSearchRoutes(app);
mountHistoricalPricesRoutes(app);

const PORT = Number(process.env.PORT) || 5000;

initDataStore()
  .then(async (store) => {
    const features = await initFeatureStore(store);
    const marketData = createMarketData();
    const runner = createJobRunner({
      features,
      handlers: createJobHandlers({ store, features, marketData })
    });
    mountAuthRoutes(app, store);
    mountPortfolioRoutes(app, store);
    mountSnapshotRoutes(app, store);
    mountMonthlySnapshotRoutes(app, store);
    mountRebalanceRoutes(app, store);
    mountTransactionRoutes(app, store);
    mountAlertRoutes(app, { store, features, marketData });
    mountInternalJobRoutes(app, { features, runner });
    // Drains due jobs while the process is up; the external scheduler covers
    // the time the host is asleep. JOBS_POLL=0 turns the poller off.
    if (process.env.JOBS_POLL !== '0') runner.start();
    console.log(`DB: ${store.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'SQLite local file'}`);
    app.listen(PORT, () => {
      console.log(`StockView API http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to init database:', err);
    process.exit(1);
  });
