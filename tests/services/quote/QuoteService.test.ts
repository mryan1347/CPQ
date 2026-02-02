import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Quote, QuoteItem, Customer, Product } from '../../../src/types/index.js';

// Mock all dependencies before importing the service
vi.mock('../../../src/db/database.js', () => ({
  default: {
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    })),
  },
}));

vi.mock('../../../src/services/pricing/PricingEngine.js', () => ({
  pricingEngine: {
    calculateLineItem: vi.fn(() => ({
      unit_price: 100,
      quantity: 1,
      gross_total: 100,
      discount_percent: 0,
      discount_amount: 0,
      line_total: 100,
      applied_rules: [],
    })),
  },
}));

vi.mock('../../../src/services/hubspot/HubSpotService.js', () => ({
  hubspotService: {
    isEnabled: vi.fn(() => false),
    createDealFromQuote: vi.fn(),
    updateDeal: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Import after mocking
import db from '../../../src/db/database.js';
import { QuoteService } from '../../../src/services/quote/QuoteService.js';
import { pricingEngine } from '../../../src/services/pricing/PricingEngine.js';

describe('QuoteService', () => {
  let quoteService: QuoteService;

  const mockQuote: Quote = {
    id: 'quote-1',
    quote_number: 'Q-2024-00001',
    customer_id: 'cust-1',
    created_by: 'user-1',
    status: 'draft',
    title: 'Test Quote',
    subtotal: 1000,
    discount_total: 100,
    tax_rate: 10,
    tax_amount: 90,
    total: 990,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockCustomer: Customer = {
    id: 'cust-1',
    company_name: 'Test Company',
    country: 'USA',
    customer_tier: 'standard',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockProduct: Product = {
    id: 'prod-1',
    sku: 'SKU-001',
    name: 'Test Product',
    base_price: 100,
    unit: 'unit',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockQuoteItem: QuoteItem = {
    id: 'item-1',
    quote_id: 'quote-1',
    product_id: 'prod-1',
    quantity: 10,
    unit_price: 100,
    discount_percent: 10,
    discount_amount: 100,
    line_total: 900,
    sort_order: 1,
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    quoteService = new QuoteService();
  });

  describe('createQuote', () => {
    it('should create a new quote with default values', () => {
      const mockPrepare = vi.mocked(db.prepare);

      // Mock quote number count
      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ count: 0 })) } as any;
        }
        if (sql.includes('INSERT INTO quotes')) {
          return { run: vi.fn() } as any;
        }
        if (sql.includes('SELECT * FROM quotes WHERE id')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      const result = quoteService.createQuote(
        { customer_id: 'cust-1', title: 'Test Quote' },
        'user-1'
      );

      expect(result).toEqual(mockQuote);
    });

    it('should generate sequential quote numbers', () => {
      const mockPrepare = vi.mocked(db.prepare);
      let insertedQuoteNumber = '';

      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ count: 5 })) } as any;
        }
        if (sql.includes('INSERT INTO quotes')) {
          return {
            run: vi.fn((...args: any[]) => {
              insertedQuoteNumber = args[1]; // quote_number is second param
            }),
          } as any;
        }
        if (sql.includes('SELECT * FROM quotes WHERE id')) {
          return { get: vi.fn(() => ({ ...mockQuote, quote_number: insertedQuoteNumber })) } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      quoteService.createQuote({ customer_id: 'cust-1' }, 'user-1');

      const year = new Date().getFullYear();
      expect(insertedQuoteNumber).toBe(`Q-${year}-00006`);
    });
  });

  describe('getQuote', () => {
    it('should return quote when found', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => mockQuote),
      } as any);

      const result = quoteService.getQuote('quote-1');
      expect(result).toEqual(mockQuote);
    });

    it('should return null when not found', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => null),
      } as any);

      const result = quoteService.getQuote('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getQuoteWithDetails', () => {
    it('should return quote with customer and items', () => {
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('FROM quotes WHERE')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        if (sql.includes('FROM customers WHERE')) {
          return { get: vi.fn(() => mockCustomer) } as any;
        }
        if (sql.includes('FROM quote_items')) {
          return {
            all: vi.fn(() => [
              {
                ...mockQuoteItem,
                product_name: 'Test Product',
                sku: 'SKU-001',
                category: 'Test',
                unit: 'unit',
              },
            ]),
          } as any;
        }
        if (sql.includes('FROM users WHERE')) {
          return { get: vi.fn(() => ({ id: 'user-1', name: 'Test User', email: 'test@test.com' })) } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      const result = quoteService.getQuoteWithDetails('quote-1');

      expect(result).toBeDefined();
      expect(result?.customer).toEqual(mockCustomer);
      expect(result?.items).toHaveLength(1);
      expect(result?.created_by_user).toBeDefined();
    });

    it('should return null when quote not found', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => null),
      } as any);

      const result = quoteService.getQuoteWithDetails('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listQuotes', () => {
    it('should return paginated quotes', () => {
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ count: 50 })) } as any;
        }
        if (sql.includes('SELECT q.*')) {
          return {
            all: vi.fn(() => [
              { ...mockQuote, company_name: 'Test Company', created_by_name: 'Test User' },
            ]),
          } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      const result = quoteService.listQuotes({ page: 1, limit: 20 });

      expect(result.total).toBe(50);
      expect(result.quotes).toHaveLength(1);
    });

    it('should filter by status', () => {
      const mockAll = vi.fn(() => []);
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ count: 0 })) } as any;
        }
        return { all: mockAll } as any;
      });

      quoteService.listQuotes({ status: 'draft' });

      expect(mockAll).toHaveBeenCalled();
    });
  });

  describe('addItem', () => {
    it('should add item to draft quote', () => {
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('FROM quotes WHERE')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        if (sql.includes('FROM products WHERE')) {
          return { get: vi.fn(() => mockProduct) } as any;
        }
        if (sql.includes('FROM customers WHERE')) {
          return { get: vi.fn(() => mockCustomer) } as any;
        }
        if (sql.includes('MAX(sort_order)')) {
          return { get: vi.fn(() => ({ next: 1 })) } as any;
        }
        if (sql.includes('INSERT INTO quote_items')) {
          return { run: vi.fn() } as any;
        }
        if (sql.includes('FROM quote_items WHERE id')) {
          return { get: vi.fn(() => mockQuoteItem) } as any;
        }
        if (sql.includes('FROM quote_items WHERE quote_id')) {
          return { all: vi.fn(() => [mockQuoteItem]) } as any;
        }
        if (sql.includes('UPDATE quotes SET')) {
          return { run: vi.fn() } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      vi.mocked(pricingEngine.calculateLineItem).mockReturnValue({
        unit_price: 100,
        quantity: 10,
        gross_total: 1000,
        discount_percent: 10,
        discount_amount: 100,
        line_total: 900,
        applied_rules: [],
      });

      const result = quoteService.addItem('quote-1', {
        product_id: 'prod-1',
        quantity: 10,
        discount_percent: 10,
      });

      expect(result).toEqual(mockQuoteItem);
      expect(pricingEngine.calculateLineItem).toHaveBeenCalled();
    });

    it('should throw error for non-draft quote', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => ({ ...mockQuote, status: 'sent' })),
      } as any);

      expect(() =>
        quoteService.addItem('quote-1', { product_id: 'prod-1', quantity: 1 })
      ).toThrow('Cannot modify a non-draft quote');
    });

    it('should throw error when quote not found', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => null),
      } as any);

      expect(() =>
        quoteService.addItem('nonexistent', { product_id: 'prod-1', quantity: 1 })
      ).toThrow('Quote not found');
    });

    it('should throw error when product not found', () => {
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('FROM quotes WHERE')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        if (sql.includes('FROM products WHERE')) {
          return { get: vi.fn(() => null) } as any;
        }
        return { get: vi.fn(() => null) } as any;
      });

      expect(() =>
        quoteService.addItem('quote-1', { product_id: 'nonexistent', quantity: 1 })
      ).toThrow('Product not found');
    });
  });

  describe('removeItem', () => {
    it('should remove item from draft quote', () => {
      const mockDelete = vi.fn();
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('FROM quotes WHERE')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        if (sql.includes('DELETE FROM quote_items')) {
          return { run: mockDelete } as any;
        }
        if (sql.includes('FROM quote_items WHERE quote_id')) {
          return { all: vi.fn(() => []) } as any;
        }
        if (sql.includes('UPDATE quotes SET')) {
          return { run: vi.fn() } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      quoteService.removeItem('quote-1', 'item-1');

      expect(mockDelete).toHaveBeenCalledWith('item-1', 'quote-1');
    });

    it('should throw error for non-draft quote', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => ({ ...mockQuote, status: 'approved' })),
      } as any);

      expect(() => quoteService.removeItem('quote-1', 'item-1')).toThrow(
        'Cannot modify a non-draft quote'
      );
    });
  });

  describe('updateStatus', () => {
    it('should update quote status', () => {
      const mockRun = vi.fn();
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('FROM quotes WHERE')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        if (sql.includes('UPDATE quotes SET')) {
          return { run: mockRun } as any;
        }
        if (sql.includes('FROM customers WHERE')) {
          return { get: vi.fn(() => mockCustomer) } as any;
        }
        if (sql.includes('FROM quote_items')) {
          return { all: vi.fn(() => []) } as any;
        }
        if (sql.includes('FROM users WHERE')) {
          return { get: vi.fn(() => null) } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      quoteService.updateStatus('quote-1', 'sent');

      expect(mockRun).toHaveBeenCalled();
    });

    it('should set approved_by when approving', () => {
      const mockRun = vi.fn();
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('FROM quotes WHERE')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        if (sql.includes('UPDATE quotes SET')) {
          return { run: mockRun } as any;
        }
        if (sql.includes('FROM customers')) {
          return { get: vi.fn(() => mockCustomer) } as any;
        }
        if (sql.includes('FROM quote_items')) {
          return { all: vi.fn(() => []) } as any;
        }
        if (sql.includes('FROM users')) {
          return { get: vi.fn(() => null) } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      quoteService.updateStatus('quote-1', 'approved', 'manager-1');

      expect(mockRun).toHaveBeenCalled();
      // Verify the SQL contains approved_by
      const calls = vi.mocked(db.prepare).mock.calls;
      const updateCall = calls.find((c) => c[0].toString().includes('approved_by'));
      expect(updateCall).toBeDefined();
    });
  });

  describe('deleteQuote', () => {
    it('should delete draft quote', () => {
      const mockRun = vi.fn();
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('DELETE FROM quotes')) {
          return { run: mockRun } as any;
        }
        if (sql.includes('FROM quotes WHERE')) {
          return { get: vi.fn(() => mockQuote) } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) } as any;
      });

      quoteService.deleteQuote('quote-1');

      expect(mockRun).toHaveBeenCalledWith('quote-1');
    });

    it('should throw error for non-draft quote', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => ({ ...mockQuote, status: 'sent' })),
      } as any);

      expect(() => quoteService.deleteQuote('quote-1')).toThrow('Can only delete draft quotes');
    });

    it('should throw error when quote not found', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => null),
      } as any);

      expect(() => quoteService.deleteQuote('nonexistent')).toThrow('Quote not found');
    });
  });

  describe('cloneQuote', () => {
    it('should clone quote with all items', () => {
      const clonedQuote = { ...mockQuote, id: 'test-uuid-123', quote_number: 'Q-2024-00002' };

      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('FROM quotes WHERE id') && !sql.includes('INSERT')) {
          return {
            get: vi.fn(() => mockQuote),
          } as any;
        }
        if (sql.includes('FROM customers WHERE')) {
          return { get: vi.fn(() => mockCustomer) } as any;
        }
        if (sql.includes('FROM quote_items qi')) {
          return {
            all: vi.fn(() => [
              { ...mockQuoteItem, product_name: 'Test', sku: 'SKU', category: 'Cat', unit: 'unit' },
            ]),
          } as any;
        }
        if (sql.includes('FROM users WHERE')) {
          return { get: vi.fn(() => null) } as any;
        }
        if (sql.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ count: 1 })) } as any;
        }
        if (sql.includes('INSERT INTO quotes')) {
          return { run: vi.fn() } as any;
        }
        if (sql.includes('FROM products WHERE')) {
          return { get: vi.fn(() => mockProduct) } as any;
        }
        if (sql.includes('MAX(sort_order)')) {
          return { get: vi.fn(() => ({ next: 1 })) } as any;
        }
        if (sql.includes('INSERT INTO quote_items')) {
          return { run: vi.fn() } as any;
        }
        if (sql.includes('FROM quote_items WHERE id')) {
          return { get: vi.fn(() => mockQuoteItem) } as any;
        }
        if (sql.includes('FROM quote_items WHERE quote_id')) {
          return { all: vi.fn(() => [mockQuoteItem]) } as any;
        }
        if (sql.includes('UPDATE quotes SET')) {
          return { run: vi.fn() } as any;
        }
        return { run: vi.fn(), get: vi.fn(() => clonedQuote), all: vi.fn(() => []) } as any;
      });

      const result = quoteService.cloneQuote('quote-1', 'user-1');

      expect(result).toBeDefined();
    });

    it('should throw error when original quote not found', () => {
      vi.mocked(db.prepare).mockReturnValue({
        get: vi.fn(() => null),
        all: vi.fn(() => []),
      } as any);

      expect(() => quoteService.cloneQuote('nonexistent', 'user-1')).toThrow('Quote not found');
    });
  });
});
