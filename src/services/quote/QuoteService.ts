import db from '../../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { pricingEngine } from '../pricing/PricingEngine.js';
import { hubspotService } from '../hubspot/HubSpotService.js';
import type {
  Quote,
  QuoteWithDetails,
  QuoteItem,
  CreateQuoteInput,
  QuoteItemInput,
  Customer,
  Product,
  QuoteStatus,
} from '../../types/index.js';

export class QuoteService {
  /**
   * Generate a unique quote number
   */
  private generateQuoteNumber(): string {
    const year = new Date().getFullYear();
    const count = db
      .prepare("SELECT COUNT(*) as count FROM quotes WHERE quote_number LIKE ?")
      .get(`Q-${year}-%`) as { count: number };
    const sequence = String(count.count + 1).padStart(5, '0');
    return `Q-${year}-${sequence}`;
  }

  /**
   * Create a new quote
   */
  createQuote(input: CreateQuoteInput, userId: string): Quote {
    const id = uuidv4();
    const quoteNumber = this.generateQuoteNumber();

    const validUntil = input.valid_until || this.getDefaultValidUntil();

    const stmt = db.prepare(`
      INSERT INTO quotes (id, quote_number, customer_id, created_by, title, notes, tax_rate, valid_until, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `);

    stmt.run(
      id,
      quoteNumber,
      input.customer_id,
      userId,
      input.title || null,
      input.notes || null,
      input.tax_rate || 0,
      validUntil
    );

    return this.getQuote(id)!;
  }

  private getDefaultValidUntil(): string {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  }

  /**
   * Get a quote by ID
   */
  getQuote(id: string): Quote | null {
    return db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Quote | null;
  }

  /**
   * Get a quote with all details
   */
  getQuoteWithDetails(id: string): QuoteWithDetails | null {
    const quote = this.getQuote(id);
    if (!quote) return null;

    const customer = db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(quote.customer_id) as Customer | null;

    const items = db
      .prepare(`
        SELECT qi.*, p.name as product_name, p.sku, p.category, p.unit
        FROM quote_items qi
        JOIN products p ON qi.product_id = p.id
        WHERE qi.quote_id = ?
        ORDER BY qi.sort_order
      `)
      .all(id) as (QuoteItem & { product_name: string; sku: string; category: string; unit: string })[];

    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(quote.created_by);

    return {
      ...quote,
      customer: customer || undefined,
      items: items.map((item) => ({
        ...item,
        product: {
          id: item.product_id,
          name: item.product_name,
          sku: item.sku,
          category: item.category,
          unit: item.unit,
        } as any,
      })),
      created_by_user: user as any,
    };
  }

  /**
   * List quotes with filters
   */
  listQuotes(options: {
    status?: QuoteStatus;
    customer_id?: string;
    created_by?: string;
    page?: number;
    limit?: number;
  }): { quotes: QuoteWithDetails[]; total: number } {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params: any[] = [];

    if (options.status) {
      whereClause += ' AND q.status = ?';
      params.push(options.status);
    }
    if (options.customer_id) {
      whereClause += ' AND q.customer_id = ?';
      params.push(options.customer_id);
    }
    if (options.created_by) {
      whereClause += ' AND q.created_by = ?';
      params.push(options.created_by);
    }

    const countResult = db
      .prepare(`SELECT COUNT(*) as count FROM quotes q WHERE ${whereClause}`)
      .get(...params) as { count: number };

    const quotes = db
      .prepare(`
        SELECT q.*, c.company_name, c.contact_name, u.name as created_by_name
        FROM quotes q
        LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN users u ON q.created_by = u.id
        WHERE ${whereClause}
        ORDER BY q.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    return {
      quotes: quotes.map((q) => ({
        ...q,
        customer: q.company_name
          ? {
              id: q.customer_id,
              company_name: q.company_name,
              contact_name: q.contact_name,
            }
          : undefined,
        items: [],
      })),
      total: countResult.count,
    };
  }

  /**
   * Add item to quote
   */
  addItem(quoteId: string, input: QuoteItemInput): QuoteItem {
    const quote = this.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found');
    if (quote.status !== 'draft') throw new Error('Cannot modify a non-draft quote');

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(input.product_id) as Product | null;
    if (!product) throw new Error('Product not found');

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(quote.customer_id) as Customer;

    // Calculate pricing
    const unitPrice = input.unit_price ?? product.base_price;
    const calculation = pricingEngine.calculateLineItem(
      { ...product, base_price: unitPrice },
      input.quantity,
      customer,
      input.discount_percent || 0
    );

    const id = uuidv4();
    const sortOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM quote_items WHERE quote_id = ?')
      .get(quoteId) as { next: number };

    db.prepare(`
      INSERT INTO quote_items (id, quote_id, product_id, quantity, unit_price, discount_percent, discount_amount, line_total, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      quoteId,
      input.product_id,
      input.quantity,
      unitPrice,
      calculation.discount_percent,
      calculation.discount_amount,
      calculation.line_total,
      input.notes || null,
      sortOrder.next
    );

    this.recalculateTotals(quoteId);

    return db.prepare('SELECT * FROM quote_items WHERE id = ?').get(id) as QuoteItem;
  }

  /**
   * Update quote item
   */
  updateItem(quoteId: string, itemId: string, input: Partial<QuoteItemInput>): QuoteItem {
    const quote = this.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found');
    if (quote.status !== 'draft') throw new Error('Cannot modify a non-draft quote');

    const item = db.prepare('SELECT * FROM quote_items WHERE id = ? AND quote_id = ?').get(itemId, quoteId) as QuoteItem | null;
    if (!item) throw new Error('Item not found');

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as Product;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(quote.customer_id) as Customer;

    const quantity = input.quantity ?? item.quantity;
    const unitPrice = input.unit_price ?? item.unit_price;

    const calculation = pricingEngine.calculateLineItem(
      { ...product, base_price: unitPrice },
      quantity,
      customer,
      input.discount_percent ?? item.discount_percent
    );

    db.prepare(`
      UPDATE quote_items SET
        quantity = ?,
        unit_price = ?,
        discount_percent = ?,
        discount_amount = ?,
        line_total = ?,
        notes = ?
      WHERE id = ?
    `).run(
      quantity,
      unitPrice,
      calculation.discount_percent,
      calculation.discount_amount,
      calculation.line_total,
      input.notes ?? item.notes,
      itemId
    );

    this.recalculateTotals(quoteId);

    return db.prepare('SELECT * FROM quote_items WHERE id = ?').get(itemId) as QuoteItem;
  }

  /**
   * Remove item from quote
   */
  removeItem(quoteId: string, itemId: string): void {
    const quote = this.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found');
    if (quote.status !== 'draft') throw new Error('Cannot modify a non-draft quote');

    db.prepare('DELETE FROM quote_items WHERE id = ? AND quote_id = ?').run(itemId, quoteId);
    this.recalculateTotals(quoteId);
  }

  /**
   * Recalculate quote totals
   */
  private recalculateTotals(quoteId: string): void {
    const quote = this.getQuote(quoteId);
    if (!quote) return;

    const items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(quoteId) as QuoteItem[];

    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const discountTotal = items.reduce((sum, item) => sum + item.discount_amount, 0);
    const afterDiscount = subtotal - discountTotal;
    const taxAmount = afterDiscount * (quote.tax_rate / 100);
    const total = afterDiscount + taxAmount;

    db.prepare(`
      UPDATE quotes SET
        subtotal = ?,
        discount_total = ?,
        tax_amount = ?,
        total = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(subtotal, discountTotal, taxAmount, total, quoteId);
  }

  /**
   * Update quote status
   */
  updateStatus(quoteId: string, status: QuoteStatus, userId?: string): Quote {
    const quote = this.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found');

    const updates: string[] = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [status];

    if (status === 'approved' && userId) {
      updates.push('approved_by = ?', 'approved_at = CURRENT_TIMESTAMP');
      params.push(userId);
    } else if (status === 'sent') {
      updates.push('sent_at = CURRENT_TIMESTAMP');
    } else if (status === 'accepted') {
      updates.push('accepted_at = CURRENT_TIMESTAMP');
    }

    params.push(quoteId);

    db.prepare(`UPDATE quotes SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Sync to HubSpot if enabled
    const updatedQuote = this.getQuoteWithDetails(quoteId)!;
    if (hubspotService.isEnabled()) {
      if (updatedQuote.hubspot_deal_id) {
        hubspotService.updateDeal(updatedQuote.hubspot_deal_id, updatedQuote);
      } else if (status === 'sent' || status === 'approved') {
        hubspotService.createDealFromQuote(updatedQuote);
      }
    }

    return updatedQuote;
  }

  /**
   * Update quote details
   */
  updateQuote(
    quoteId: string,
    updates: { title?: string; notes?: string; tax_rate?: number; valid_until?: string }
  ): Quote {
    const quote = this.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found');

    const setClause: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (updates.title !== undefined) {
      setClause.push('title = ?');
      params.push(updates.title);
    }
    if (updates.notes !== undefined) {
      setClause.push('notes = ?');
      params.push(updates.notes);
    }
    if (updates.tax_rate !== undefined) {
      setClause.push('tax_rate = ?');
      params.push(updates.tax_rate);
    }
    if (updates.valid_until !== undefined) {
      setClause.push('valid_until = ?');
      params.push(updates.valid_until);
    }

    params.push(quoteId);

    db.prepare(`UPDATE quotes SET ${setClause.join(', ')} WHERE id = ?`).run(...params);
    this.recalculateTotals(quoteId);

    return this.getQuote(quoteId)!;
  }

  /**
   * Clone a quote
   */
  cloneQuote(quoteId: string, userId: string): Quote {
    const original = this.getQuoteWithDetails(quoteId);
    if (!original) throw new Error('Quote not found');

    const newQuote = this.createQuote(
      {
        customer_id: original.customer_id,
        title: `Copy of ${original.title || original.quote_number}`,
        notes: original.notes,
        tax_rate: original.tax_rate,
      },
      userId
    );

    for (const item of original.items) {
      this.addItem(newQuote.id, {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_percent: item.discount_percent,
        notes: item.notes,
      });
    }

    return this.getQuote(newQuote.id)!;
  }

  /**
   * Delete a quote
   */
  deleteQuote(quoteId: string): void {
    const quote = this.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found');
    if (quote.status !== 'draft') throw new Error('Can only delete draft quotes');

    db.prepare('DELETE FROM quotes WHERE id = ?').run(quoteId);
  }
}

export const quoteService = new QuoteService();
