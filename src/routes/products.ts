import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import type { Product, CreateProductInput } from '../types/index.js';

const router = Router();

/**
 * GET /api/products
 * List all products
 */
router.get('/', authenticate, (req: Request, res: Response) => {
  const { category, active, search, page = '1', limit = '50' } = req.query;

  let whereClause = '1=1';
  const params: any[] = [];

  if (active !== undefined) {
    whereClause += ' AND is_active = ?';
    params.push(active === 'true' ? 1 : 0);
  }

  if (category) {
    whereClause += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    whereClause += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const offset = (pageNum - 1) * limitNum;

  const countResult = db
    .prepare(`SELECT COUNT(*) as count FROM products WHERE ${whereClause}`)
    .get(...params) as { count: number };

  const products = db
    .prepare(`SELECT * FROM products WHERE ${whereClause} ORDER BY category, name LIMIT ? OFFSET ?`)
    .all(...params, limitNum, offset) as Product[];

  res.json({
    success: true,
    data: products,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: countResult.count,
      totalPages: Math.ceil(countResult.count / limitNum),
    },
  });
});

/**
 * GET /api/products/categories
 * Get list of product categories
 */
router.get('/categories', authenticate, (req: Request, res: Response) => {
  const categories = db
    .prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category')
    .all() as { category: string }[];

  res.json({
    success: true,
    data: categories.map((c) => c.category),
  });
});

/**
 * GET /api/products/:id
 * Get a single product
 */
router.get('/:id', authenticate, (req: Request, res: Response) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as Product | null;

  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }

  res.json({ success: true, data: product });
});

/**
 * POST /api/products
 * Create a new product (admin/manager only)
 */
router.post('/', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const input: CreateProductInput = req.body;

  if (!input.sku || !input.name || input.base_price === undefined) {
    res.status(400).json({ success: false, error: 'SKU, name, and base_price are required' });
    return;
  }

  // Check for duplicate SKU
  const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(input.sku);
  if (existing) {
    res.status(400).json({ success: false, error: 'SKU already exists' });
    return;
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO products (id, sku, name, description, category, base_price, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.sku, input.name, input.description || null, input.category || null, input.base_price, input.unit || 'each');

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product;

  res.status(201).json({ success: true, data: product });
});

/**
 * PUT /api/products/:id
 * Update a product (admin/manager only)
 */
router.put('/:id', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as Product | null;

  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }

  const { sku, name, description, category, base_price, unit, is_active } = req.body;

  // Check for duplicate SKU if changing
  if (sku && sku !== product.sku) {
    const existing = db.prepare('SELECT id FROM products WHERE sku = ? AND id != ?').get(sku, req.params.id);
    if (existing) {
      res.status(400).json({ success: false, error: 'SKU already exists' });
      return;
    }
  }

  db.prepare(`
    UPDATE products SET
      sku = COALESCE(?, sku),
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      category = COALESCE(?, category),
      base_price = COALESCE(?, base_price),
      unit = COALESCE(?, unit),
      is_active = COALESCE(?, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    sku || null,
    name || null,
    description,
    category,
    base_price,
    unit || null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as Product;

  res.json({ success: true, data: updated });
});

/**
 * DELETE /api/products/:id
 * Deactivate a product (soft delete)
 */
router.delete('/:id', authenticate, requireRole('admin'), (req: Request, res: Response) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as Product | null;

  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }

  db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

  res.json({ success: true, message: 'Product deactivated' });
});

export default router;
