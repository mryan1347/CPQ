import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Product,
  Customer,
  PricingRule,
} from '../../../src/types/index.js';

// Mock the database module
vi.mock('../../../src/db/database.js', () => ({
  default: {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
    })),
  },
}));

// Import after mocking
import db from '../../../src/db/database.js';
import { PricingEngine } from '../../../src/services/pricing/PricingEngine.js';

describe('PricingEngine', () => {
  let pricingEngine: PricingEngine;

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

  const mockCustomer: Customer = {
    id: 'cust-1',
    company_name: 'Test Company',
    country: 'USA',
    customer_tier: 'standard',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockVolumeRule: PricingRule = {
    id: 'rule-1',
    name: 'Volume Discount',
    rule_type: 'volume',
    conditions: JSON.stringify({ min_quantity: 10, max_quantity: 50 }),
    discount_type: 'percentage',
    discount_value: 10,
    priority: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockTierRule: PricingRule = {
    id: 'rule-2',
    name: 'Enterprise Discount',
    rule_type: 'customer_tier',
    conditions: JSON.stringify({ customer_tier: 'enterprise' }),
    discount_type: 'percentage',
    discount_value: 15,
    priority: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock prepare to return rules
    vi.mocked(db.prepare).mockReturnValue({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
    } as any);

    pricingEngine = new PricingEngine();
  });

  describe('calculateLineItem', () => {
    it('should calculate basic line item without discounts', () => {
      const result = pricingEngine.calculateLineItem(
        mockProduct,
        5,
        mockCustomer,
        0,
        []
      );

      expect(result.unit_price).toBe(100);
      expect(result.quantity).toBe(5);
      expect(result.gross_total).toBe(500);
      expect(result.discount_percent).toBe(0);
      expect(result.discount_amount).toBe(0);
      expect(result.line_total).toBe(500);
    });

    it('should apply manual discount', () => {
      const result = pricingEngine.calculateLineItem(
        mockProduct,
        5,
        mockCustomer,
        10, // 10% manual discount
        []
      );

      expect(result.gross_total).toBe(500);
      expect(result.discount_percent).toBe(10);
      expect(result.discount_amount).toBe(50);
      expect(result.line_total).toBe(450);
    });

    it('should apply volume discount rule when quantity meets threshold', () => {
      // Setup rules
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => [mockVolumeRule]),
        get: vi.fn(() => null),
      } as any);

      const pricingEngineWithRules = new PricingEngine();

      const result = pricingEngineWithRules.calculateLineItem(
        mockProduct,
        15, // Meets min_quantity of 10
        mockCustomer,
        0,
        []
      );

      expect(result.quantity).toBe(15);
      expect(result.gross_total).toBe(1500);
      expect(result.discount_percent).toBe(10);
      expect(result.discount_amount).toBe(150);
      expect(result.line_total).toBe(1350);
      expect(result.applied_rules).toContain('rule-1');
    });

    it('should not apply volume discount when quantity below threshold', () => {
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => [mockVolumeRule]),
        get: vi.fn(() => null),
      } as any);

      const pricingEngineWithRules = new PricingEngine();

      const result = pricingEngineWithRules.calculateLineItem(
        mockProduct,
        5, // Below min_quantity of 10
        mockCustomer,
        0,
        []
      );

      expect(result.discount_percent).toBe(0);
      expect(result.applied_rules).toHaveLength(0);
    });

    it('should apply customer tier discount for enterprise customers', () => {
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => [mockTierRule]),
        get: vi.fn(() => null),
      } as any);

      const pricingEngineWithRules = new PricingEngine();
      const enterpriseCustomer: Customer = {
        ...mockCustomer,
        customer_tier: 'enterprise',
      };

      const result = pricingEngineWithRules.calculateLineItem(
        mockProduct,
        5,
        enterpriseCustomer,
        0,
        []
      );

      expect(result.discount_percent).toBe(15);
      expect(result.applied_rules).toContain('rule-2');
    });

    it('should take highest discount when multiple rules apply', () => {
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => [mockVolumeRule, mockTierRule]),
        get: vi.fn(() => null),
      } as any);

      const pricingEngineWithRules = new PricingEngine();
      const enterpriseCustomer: Customer = {
        ...mockCustomer,
        customer_tier: 'enterprise',
      };

      const result = pricingEngineWithRules.calculateLineItem(
        mockProduct,
        15, // Both volume and tier rules apply
        enterpriseCustomer,
        0,
        []
      );

      // Should take the higher discount (15% from tier rule)
      expect(result.discount_percent).toBe(15);
    });
  });

  describe('calculateQuote', () => {
    it('should calculate total for multiple items', () => {
      // Mock to return products
      const mockGetProducts = vi.fn(() => [mockProduct]);
      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('pricing_rules')) {
          return { all: vi.fn(() => []), get: vi.fn(() => null) } as any;
        }
        if (sql.includes('products')) {
          return { all: mockGetProducts, get: vi.fn(() => null) } as any;
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null) } as any;
      });

      const pricingEngineWithProducts = new PricingEngine();

      const result = pricingEngineWithProducts.calculateQuote(
        [{ product_id: 'prod-1', quantity: 10 }],
        mockCustomer,
        10 // 10% tax
      );

      expect(result.subtotal).toBe(1000);
      expect(result.discount_total).toBe(0);
      expect(result.tax_amount).toBe(100);
      expect(result.total).toBe(1100);
    });

    it('should handle empty items array', () => {
      vi.mocked(db.prepare).mockImplementation(() => ({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
      } as any));

      const pricingEngineEmpty = new PricingEngine();

      const result = pricingEngineEmpty.calculateQuote([], mockCustomer, 10);

      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getSuggestedPrice', () => {
    it('should return base price when no discounts apply', () => {
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
      } as any);

      const engine = new PricingEngine();
      const suggestedPrice = engine.getSuggestedPrice(mockProduct, 1, mockCustomer);

      expect(suggestedPrice).toBe(100);
    });

    it('should return discounted price when rules apply', () => {
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => [mockVolumeRule]),
        get: vi.fn(() => null),
      } as any);

      const engine = new PricingEngine();
      const suggestedPrice = engine.getSuggestedPrice(mockProduct, 20, mockCustomer);

      // 100 - 10% = 90
      expect(suggestedPrice).toBe(90);
    });
  });

  describe('checkApprovalRequired', () => {
    it('should return not required when no approval rules match', () => {
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
      } as any);

      const engine = new PricingEngine();
      const result = engine.checkApprovalRequired(5, 1000);

      expect(result.required).toBe(false);
    });

    it('should return required when discount exceeds threshold', () => {
      const mockApprovalRule = {
        name: 'High Discount Approval',
        min_discount_percent: 20,
        max_discount_percent: 100,
        min_total: null,
        max_total: null,
        required_role: 'manager',
      };

      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('approval_rules')) {
          return { all: vi.fn(() => [mockApprovalRule]), get: vi.fn(() => null) } as any;
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null) } as any;
      });

      const engine = new PricingEngine();
      const result = engine.checkApprovalRequired(25, 1000);

      expect(result.required).toBe(true);
      expect(result.reason).toBe('High Discount Approval');
      expect(result.required_role).toBe('manager');
    });

    it('should return required when total exceeds threshold', () => {
      const mockApprovalRule = {
        name: 'Large Order Approval',
        min_discount_percent: null,
        max_discount_percent: null,
        min_total: 10000,
        max_total: null,
        required_role: 'admin',
      };

      vi.mocked(db.prepare).mockImplementation((sql: string) => {
        if (sql.includes('approval_rules')) {
          return { all: vi.fn(() => [mockApprovalRule]), get: vi.fn(() => null) } as any;
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null) } as any;
      });

      const engine = new PricingEngine();
      const result = engine.checkApprovalRequired(5, 15000);

      expect(result.required).toBe(true);
      expect(result.required_role).toBe('admin');
    });
  });

  describe('getApplicableDiscounts', () => {
    it('should return empty array when no discounts apply', () => {
      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
      } as any);

      const engine = new PricingEngine();
      const discounts = engine.getApplicableDiscounts(mockProduct, 5, mockCustomer);

      expect(discounts).toHaveLength(0);
    });

    it('should return applicable discounts sorted by value', () => {
      const smallDiscount: PricingRule = {
        ...mockVolumeRule,
        discount_value: 5,
      };
      const largeDiscount: PricingRule = {
        ...mockTierRule,
        conditions: JSON.stringify({ customer_tier: 'standard' }),
        discount_value: 20,
      };

      vi.mocked(db.prepare).mockReturnValue({
        all: vi.fn(() => [smallDiscount, largeDiscount]),
        get: vi.fn(() => null),
      } as any);

      const engine = new PricingEngine();
      const discounts = engine.getApplicableDiscounts(mockProduct, 15, mockCustomer);

      expect(discounts).toHaveLength(2);
      expect(discounts[0].discount_percent).toBe(20);
      expect(discounts[1].discount_percent).toBe(5);
    });
  });
});
