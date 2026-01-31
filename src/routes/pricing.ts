import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { pricingEngine } from '../services/pricing/PricingEngine.js';
import type { PricingRule } from '../types/index.js';

const router = Router();

/**
 * GET /api/pricing/rules
 * List all pricing rules
 */
router.get('/rules', authenticate, (req: Request, res: Response) => {
  const { active } = req.query;

  let query = 'SELECT * FROM pricing_rules';
  const params: any[] = [];

  if (active !== undefined) {
    query += ' WHERE is_active = ?';
    params.push(active === 'true' ? 1 : 0);
  }

  query += ' ORDER BY priority DESC, name';

  const rules = db.prepare(query).all(...params) as PricingRule[];

  res.json({
    success: true,
    data: rules.map((rule) => ({
      ...rule,
      conditions: JSON.parse(rule.conditions),
    })),
  });
});

/**
 * GET /api/pricing/rules/:id
 * Get a single pricing rule
 */
router.get('/rules/:id', authenticate, (req: Request, res: Response) => {
  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id) as PricingRule | null;

  if (!rule) {
    res.status(404).json({ success: false, error: 'Pricing rule not found' });
    return;
  }

  res.json({
    success: true,
    data: {
      ...rule,
      conditions: JSON.parse(rule.conditions),
    },
  });
});

/**
 * POST /api/pricing/rules
 * Create a new pricing rule (admin/manager only)
 */
router.post('/rules', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const { name, description, rule_type, conditions, discount_type, discount_value, priority, start_date, end_date } =
    req.body;

  if (!name || !rule_type || !conditions || !discount_type || discount_value === undefined) {
    res.status(400).json({
      success: false,
      error: 'Name, rule_type, conditions, discount_type, and discount_value are required',
    });
    return;
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO pricing_rules (id, name, description, rule_type, conditions, discount_type, discount_value, priority, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    description || null,
    rule_type,
    JSON.stringify(conditions),
    discount_type,
    discount_value,
    priority || 0,
    start_date || null,
    end_date || null
  );

  // Reload pricing engine rules
  pricingEngine.loadRules();

  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(id) as PricingRule;

  res.status(201).json({
    success: true,
    data: {
      ...rule,
      conditions: JSON.parse(rule.conditions),
    },
  });
});

/**
 * PUT /api/pricing/rules/:id
 * Update a pricing rule (admin/manager only)
 */
router.put('/rules/:id', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id) as PricingRule | null;

  if (!rule) {
    res.status(404).json({ success: false, error: 'Pricing rule not found' });
    return;
  }

  const { name, description, rule_type, conditions, discount_type, discount_value, priority, is_active, start_date, end_date } =
    req.body;

  db.prepare(`
    UPDATE pricing_rules SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      rule_type = COALESCE(?, rule_type),
      conditions = COALESCE(?, conditions),
      discount_type = COALESCE(?, discount_type),
      discount_value = COALESCE(?, discount_value),
      priority = COALESCE(?, priority),
      is_active = COALESCE(?, is_active),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name || null,
    description,
    rule_type || null,
    conditions ? JSON.stringify(conditions) : null,
    discount_type || null,
    discount_value,
    priority,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    start_date,
    end_date,
    req.params.id
  );

  // Reload pricing engine rules
  pricingEngine.loadRules();

  const updated = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id) as PricingRule;

  res.json({
    success: true,
    data: {
      ...updated,
      conditions: JSON.parse(updated.conditions),
    },
  });
});

/**
 * DELETE /api/pricing/rules/:id
 * Delete a pricing rule (admin only)
 */
router.delete('/rules/:id', authenticate, requireRole('admin'), (req: Request, res: Response) => {
  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id) as PricingRule | null;

  if (!rule) {
    res.status(404).json({ success: false, error: 'Pricing rule not found' });
    return;
  }

  db.prepare('DELETE FROM pricing_rules WHERE id = ?').run(req.params.id);

  // Reload pricing engine rules
  pricingEngine.loadRules();

  res.json({ success: true, message: 'Pricing rule deleted' });
});

/**
 * POST /api/pricing/calculate
 * Calculate pricing for a product with given quantity and customer
 */
router.post('/calculate', authenticate, (req: Request, res: Response) => {
  const { product_id, quantity, customer_id } = req.body;

  if (!product_id || !quantity || !customer_id) {
    res.status(400).json({ success: false, error: 'Product ID, quantity, and customer ID are required' });
    return;
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);

  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }

  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }

  const calculation = pricingEngine.calculateLineItem(product as any, quantity, customer as any, 0, []);
  const applicableDiscounts = pricingEngine.getApplicableDiscounts(product as any, quantity, customer as any);

  res.json({
    success: true,
    data: {
      calculation,
      applicable_discounts: applicableDiscounts,
    },
  });
});

export default router;
