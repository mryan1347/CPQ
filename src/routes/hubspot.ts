import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { hubspotService } from '../services/hubspot/HubSpotService.js';

const router = Router();

/**
 * GET /api/hubspot/status
 * Check HubSpot integration status
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  const enabled = hubspotService.isEnabled();

  if (!enabled) {
    res.json({
      success: true,
      data: {
        enabled: false,
        connected: false,
        message: 'HubSpot integration not configured',
      },
    });
    return;
  }

  const connectionTest = await hubspotService.testConnection();

  res.json({
    success: true,
    data: {
      enabled: true,
      connected: connectionTest.success,
      error: connectionTest.error,
    },
  });
});

/**
 * POST /api/hubspot/sync/companies
 * Sync companies from HubSpot
 */
router.post('/sync/companies', authenticate, requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  if (!hubspotService.isEnabled()) {
    res.status(400).json({ success: false, error: 'HubSpot integration not configured' });
    return;
  }

  const result = await hubspotService.syncCompanies();

  res.json({
    success: true,
    data: result,
    message: `Synced ${result.synced} companies with ${result.errors} errors`,
  });
});

/**
 * POST /api/hubspot/sync/products
 * Sync products to HubSpot
 */
router.post('/sync/products', authenticate, requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  if (!hubspotService.isEnabled()) {
    res.status(400).json({ success: false, error: 'HubSpot integration not configured' });
    return;
  }

  const result = await hubspotService.syncProductsToHubSpot();

  res.json({
    success: true,
    data: result,
    message: `Synced ${result.synced} products with ${result.errors} errors`,
  });
});

/**
 * GET /api/hubspot/companies
 * Get companies from HubSpot
 */
router.get('/companies', authenticate, async (req: Request, res: Response) => {
  if (!hubspotService.isEnabled()) {
    res.status(400).json({ success: false, error: 'HubSpot integration not configured' });
    return;
  }

  const limit = parseInt(req.query.limit as string, 10) || 100;
  const companies = await hubspotService.getCompanies(limit);

  res.json({
    success: true,
    data: companies,
  });
});

/**
 * GET /api/hubspot/contacts
 * Get contacts from HubSpot
 */
router.get('/contacts', authenticate, async (req: Request, res: Response) => {
  if (!hubspotService.isEnabled()) {
    res.status(400).json({ success: false, error: 'HubSpot integration not configured' });
    return;
  }

  const limit = parseInt(req.query.limit as string, 10) || 100;
  const contacts = await hubspotService.getContacts(limit);

  res.json({
    success: true,
    data: contacts,
  });
});

/**
 * GET /api/hubspot/sync-history
 * Get sync history
 */
router.get('/sync-history', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const history = hubspotService.getSyncHistory(limit);

  res.json({
    success: true,
    data: history,
  });
});

export default router;
