import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { hubspotService } from '../services/hubspot/HubSpotService.js';
import type { Customer, CreateCustomerInput } from '../types/index.js';

const router = Router();

/**
 * GET /api/customers
 * List all customers
 */
router.get('/', authenticate, (req: Request, res: Response) => {
  const { search, tier, page = '1', limit = '50' } = req.query;

  let whereClause = '1=1';
  const params: any[] = [];

  if (tier) {
    whereClause += ' AND customer_tier = ?';
    params.push(tier);
  }

  if (search) {
    whereClause += ' AND (company_name LIKE ? OR contact_name LIKE ? OR email LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const offset = (pageNum - 1) * limitNum;

  const countResult = db
    .prepare(`SELECT COUNT(*) as count FROM customers WHERE ${whereClause}`)
    .get(...params) as { count: number };

  const customers = db
    .prepare(`SELECT * FROM customers WHERE ${whereClause} ORDER BY company_name LIMIT ? OFFSET ?`)
    .all(...params, limitNum, offset) as Customer[];

  res.json({
    success: true,
    data: customers,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: countResult.count,
      totalPages: Math.ceil(countResult.count / limitNum),
    },
  });
});

/**
 * GET /api/customers/:id
 * Get a single customer
 */
router.get('/:id', authenticate, (req: Request, res: Response) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer | null;

  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }

  // Get quote summary
  const quoteSummary = db
    .prepare(`
      SELECT
        COUNT(*) as total_quotes,
        SUM(CASE WHEN status = 'accepted' THEN total ELSE 0 END) as total_revenue,
        MAX(created_at) as last_quote_date
      FROM quotes WHERE customer_id = ?
    `)
    .get(req.params.id) as any;

  res.json({
    success: true,
    data: {
      ...customer,
      quote_summary: quoteSummary,
    },
  });
});

/**
 * POST /api/customers
 * Create a new customer
 */
router.post('/', authenticate, (req: Request, res: Response) => {
  const input: CreateCustomerInput = req.body;

  if (!input.company_name) {
    res.status(400).json({ success: false, error: 'Company name is required' });
    return;
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO customers (id, company_name, contact_name, email, phone, address, city, state, zip_code, country, customer_tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.company_name,
    input.contact_name || null,
    input.email || null,
    input.phone || null,
    input.address || null,
    input.city || null,
    input.state || null,
    input.zip_code || null,
    input.country || 'USA',
    input.customer_tier || 'standard'
  );

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer;

  res.status(201).json({ success: true, data: customer });
});

/**
 * PUT /api/customers/:id
 * Update a customer
 */
router.put('/:id', authenticate, (req: Request, res: Response) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer | null;

  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }

  const { company_name, contact_name, email, phone, address, city, state, zip_code, country, customer_tier } = req.body;

  db.prepare(`
    UPDATE customers SET
      company_name = COALESCE(?, company_name),
      contact_name = COALESCE(?, contact_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      state = COALESCE(?, state),
      zip_code = COALESCE(?, zip_code),
      country = COALESCE(?, country),
      customer_tier = COALESCE(?, customer_tier),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    company_name || null,
    contact_name,
    email,
    phone,
    address,
    city,
    state,
    zip_code,
    country || null,
    customer_tier || null,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer;

  res.json({ success: true, data: updated });
});

/**
 * DELETE /api/customers/:id
 * Delete a customer (only if no quotes)
 */
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer | null;

  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }

  const quoteCount = db
    .prepare('SELECT COUNT(*) as count FROM quotes WHERE customer_id = ?')
    .get(req.params.id) as { count: number };

  if (quoteCount.count > 0) {
    res.status(400).json({ success: false, error: 'Cannot delete customer with existing quotes' });
    return;
  }

  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);

  res.json({ success: true, message: 'Customer deleted' });
});

/**
 * POST /api/customers/:id/sync-to-hubspot
 * Push customer to HubSpot
 */
router.post('/:id/sync-to-hubspot', authenticate, async (req: Request, res: Response) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer | null;

  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }

  if (!hubspotService.isEnabled()) {
    res.status(400).json({ success: false, error: 'HubSpot integration not configured' });
    return;
  }

  const hubspotId = await hubspotService.pushCustomer(customer);

  if (hubspotId) {
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer;
    res.json({ success: true, data: updated, hubspot_id: hubspotId });
  } else {
    res.status(500).json({ success: false, error: 'Failed to sync to HubSpot' });
  }
});

export default router;
