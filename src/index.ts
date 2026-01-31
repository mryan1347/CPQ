import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';

// Import routes
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import quoteRoutes from './routes/quotes.js';
import approvalRoutes from './routes/approvals.js';
import pricingRoutes from './routes/pricing.js';
import hubspotRoutes from './routes/hubspot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/hubspot', hubspotRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'CPQ API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Serve static files in production
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: config.nodeEnv === 'development' ? err.message : 'Internal server error',
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 CPQ Application Server                                   ║
║                                                               ║
║   Server running on: http://localhost:${config.port}                  ║
║   Environment: ${config.nodeEnv.padEnd(44)}║
║                                                               ║
║   API Endpoints:                                              ║
║   • POST   /api/auth/login          - User authentication     ║
║   • GET    /api/products            - List products           ║
║   • GET    /api/customers           - List customers          ║
║   • GET    /api/quotes              - List quotes             ║
║   • POST   /api/quotes              - Create quote            ║
║   • GET    /api/quotes/:id/pdf      - Download quote PDF      ║
║   • GET    /api/hubspot/status      - HubSpot status          ║
║   • GET    /api/health              - Health check            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
