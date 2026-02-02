import { Router, Request, Response } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { quoteService } from '../services/quote/QuoteService.js';
import { pricingEngine } from '../services/pricing/PricingEngine.js';
import { approvalService } from '../services/approval/ApprovalService.js';
import { pdfGenerator } from '../services/pdf/PdfGenerator.js';
import { hubspotService } from '../services/hubspot/HubSpotService.js';
import type { CreateQuoteInput, QuoteItemInput, QuoteStatus } from '../types/index.js';

const router = Router();

/**
 * GET /api/quotes
 * List quotes with filters
 */
router.get('/', authenticate, (req: Request, res: Response) => {
  const { status, customer_id, page = '1', limit = '20' } = req.query;

  const result = quoteService.listQuotes({
    status: status as QuoteStatus | undefined,
    customer_id: customer_id as string | undefined,
    created_by: req.user!.role === 'sales_rep' ? req.user!.id : undefined,
    page: parseInt(page as string, 10),
    limit: parseInt(limit as string, 10),
  });

  res.json({
    success: true,
    data: result.quotes,
    pagination: {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      total: result.total,
      totalPages: Math.ceil(result.total / parseInt(limit as string, 10)),
    },
  });
});

/**
 * GET /api/quotes/:id
 * Get a single quote with details
 */
router.get('/:id', authenticate, (req: Request, res: Response) => {
  const quote = quoteService.getQuoteWithDetails(req.params.id);

  if (!quote) {
    res.status(404).json({ success: false, error: 'Quote not found' });
    return;
  }

  // Check approval requirements
  const approvalCheck = approvalService.checkApprovalRequired(req.params.id);

  res.json({
    success: true,
    data: {
      ...quote,
      requires_approval: approvalCheck.required,
      approval_reason: approvalCheck.reason,
    },
  });
});

/**
 * POST /api/quotes
 * Create a new quote
 */
router.post('/', authenticate, (req: Request, res: Response) => {
  const input: CreateQuoteInput = req.body;

  if (!input.customer_id) {
    res.status(400).json({ success: false, error: 'Customer ID is required' });
    return;
  }

  // Verify customer exists
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customer_id);
  if (!customer) {
    res.status(400).json({ success: false, error: 'Customer not found' });
    return;
  }

  try {
    const quote = quoteService.createQuote(input, req.user!.id);
    res.status(201).json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/quotes/:id
 * Update quote details
 */
router.put('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const quote = quoteService.updateQuote(req.params.id, req.body);
    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/quotes/:id
 * Delete a draft quote
 */
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  try {
    quoteService.deleteQuote(req.params.id);
    res.json({ success: true, message: 'Quote deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/quotes/:id/clone
 * Clone a quote
 */
router.post('/:id/clone', authenticate, (req: Request, res: Response) => {
  try {
    const quote = quoteService.cloneQuote(req.params.id, req.user!.id);
    res.status(201).json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================
// QUOTE ITEMS
// ============================================

/**
 * POST /api/quotes/:id/items
 * Add item to quote
 */
router.post('/:id/items', authenticate, (req: Request, res: Response) => {
  const input: QuoteItemInput = req.body;

  if (!input.product_id || !input.quantity) {
    res.status(400).json({ success: false, error: 'Product ID and quantity are required' });
    return;
  }

  try {
    const item = quoteService.addItem(req.params.id, input);
    const quote = quoteService.getQuoteWithDetails(req.params.id);
    res.status(201).json({ success: true, data: { item, quote } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/quotes/:id/items/:itemId
 * Update quote item
 */
router.put('/:id/items/:itemId', authenticate, (req: Request, res: Response) => {
  try {
    const item = quoteService.updateItem(req.params.id, req.params.itemId, req.body);
    const quote = quoteService.getQuoteWithDetails(req.params.id);
    res.json({ success: true, data: { item, quote } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/quotes/:id/items/:itemId
 * Remove item from quote
 */
router.delete('/:id/items/:itemId', authenticate, (req: Request, res: Response) => {
  try {
    quoteService.removeItem(req.params.id, req.params.itemId);
    const quote = quoteService.getQuoteWithDetails(req.params.id);
    res.json({ success: true, data: { quote } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================
// QUOTE STATUS ACTIONS
// ============================================

/**
 * POST /api/quotes/:id/submit-for-approval
 * Submit quote for approval
 */
router.post('/:id/submit-for-approval', authenticate, (req: Request, res: Response) => {
  try {
    const approval = approvalService.submitForApproval(req.params.id, req.user!.id);
    const quote = quoteService.getQuoteWithDetails(req.params.id);
    res.json({ success: true, data: { approval, quote } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/quotes/:id/finalize
 * Finalize a draft quote (skip approval if not required)
 */
router.post('/:id/finalize', authenticate, (req: Request, res: Response) => {
  try {
    const approvalCheck = approvalService.checkApprovalRequired(req.params.id);

    if (approvalCheck.required) {
      res.status(400).json({
        success: false,
        error: 'This quote requires approval before it can be finalized',
        requires_approval: true,
        reason: approvalCheck.reason,
      });
      return;
    }

    const quote = quoteService.updateStatus(req.params.id, 'approved', req.user!.id);
    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/quotes/:id/send
 * Mark quote as sent to customer
 */
router.post('/:id/send', authenticate, (req: Request, res: Response) => {
  try {
    const currentQuote = quoteService.getQuote(req.params.id);
    if (!currentQuote) {
      res.status(404).json({ success: false, error: 'Quote not found' });
      return;
    }

    if (currentQuote.status !== 'approved') {
      res.status(400).json({ success: false, error: 'Quote must be approved before sending' });
      return;
    }

    const quote = quoteService.updateStatus(req.params.id, 'sent');
    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/quotes/:id/accept
 * Mark quote as accepted by customer
 */
router.post('/:id/accept', authenticate, (req: Request, res: Response) => {
  try {
    const quote = quoteService.updateStatus(req.params.id, 'accepted');
    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/quotes/:id/reject
 * Mark quote as rejected by customer
 */
router.post('/:id/reject', authenticate, (req: Request, res: Response) => {
  try {
    const quote = quoteService.updateStatus(req.params.id, 'rejected');
    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================
// PDF GENERATION
// ============================================

/**
 * GET /api/quotes/:id/pdf
 * Generate and download quote PDF
 */
router.get('/:id/pdf', authenticate, async (req: Request, res: Response) => {
  const quote = quoteService.getQuoteWithDetails(req.params.id);

  if (!quote) {
    res.status(404).json({ success: false, error: 'Quote not found' });
    return;
  }

  try {
    const pdfBuffer = await pdfGenerator.generateQuotePdf(quote);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quote-${quote.quote_number}.pdf"`);
    res.send(pdfBuffer);
  } catch {
    res.status(500).json({ success: false, error: 'Failed to generate PDF' });
  }
});

// ============================================
// HUBSPOT SYNC
// ============================================

/**
 * POST /api/quotes/:id/sync-to-hubspot
 * Create or update deal in HubSpot
 */
router.post('/:id/sync-to-hubspot', authenticate, async (req: Request, res: Response) => {
  const quote = quoteService.getQuoteWithDetails(req.params.id);

  if (!quote) {
    res.status(404).json({ success: false, error: 'Quote not found' });
    return;
  }

  if (!hubspotService.isEnabled()) {
    res.status(400).json({ success: false, error: 'HubSpot integration not configured' });
    return;
  }

  try {
    let dealId: string | null;

    if (quote.hubspot_deal_id) {
      await hubspotService.updateDeal(quote.hubspot_deal_id, quote);
      dealId = quote.hubspot_deal_id;
    } else {
      dealId = await hubspotService.createDealFromQuote(quote);
    }

    if (dealId) {
      const updatedQuote = quoteService.getQuoteWithDetails(req.params.id);
      res.json({ success: true, data: updatedQuote, hubspot_deal_id: dealId });
    } else {
      res.status(500).json({ success: false, error: 'Failed to sync to HubSpot' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PRICING PREVIEW
// ============================================

/**
 * POST /api/quotes/preview-pricing
 * Preview pricing for items before adding to quote
 */
router.post('/preview-pricing', authenticate, (req: Request, res: Response) => {
  const { customer_id, items, tax_rate = 0 } = req.body;

  if (!customer_id || !items || !Array.isArray(items)) {
    res.status(400).json({ success: false, error: 'Customer ID and items array are required' });
    return;
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!customer) {
    res.status(400).json({ success: false, error: 'Customer not found' });
    return;
  }

  try {
    const calculation = pricingEngine.calculateQuote(items, customer as any, tax_rate);
    res.json({ success: true, data: calculation });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
