import db from '../../db/database.js';
import type {
  PricingRule,
  PricingRuleConditions,
  Customer,
  Product,
  QuoteItemInput,
  LineItemCalculation,
  PricingCalculation,
  AppliedDiscount,
} from '../../types/index.js';

export class PricingEngine {
  private rules: PricingRule[] = [];

  constructor() {
    this.loadRules();
  }

  /**
   * Load active pricing rules from database
   */
  loadRules(): void {
    const stmt = db.prepare(`
      SELECT * FROM pricing_rules
      WHERE is_active = 1
      AND (start_date IS NULL OR start_date <= date('now'))
      AND (end_date IS NULL OR end_date >= date('now'))
      ORDER BY priority DESC
    `);
    this.rules = stmt.all() as PricingRule[];
  }

  /**
   * Calculate pricing for a single line item
   */
  calculateLineItem(
    product: Product,
    quantity: number,
    customer: Customer,
    manualDiscountPercent: number = 0,
    allItems: { product: Product; quantity: number }[] = []
  ): LineItemCalculation {
    const unitPrice = product.base_price;
    const grossTotal = unitPrice * quantity;

    let applicableDiscountPercent = manualDiscountPercent;
    const appliedRules: string[] = [];

    // Apply automatic pricing rules
    for (const rule of this.rules) {
      const conditions = JSON.parse(rule.conditions) as PricingRuleConditions;

      if (this.ruleApplies(rule, conditions, product, quantity, customer, allItems)) {
        if (rule.discount_type === 'percentage') {
          // Take the highest applicable discount
          if (rule.discount_value > applicableDiscountPercent) {
            applicableDiscountPercent = rule.discount_value;
            appliedRules.push(rule.id);
          }
        }
      }
    }

    const discountAmount = grossTotal * (applicableDiscountPercent / 100);
    const lineTotal = grossTotal - discountAmount;

    return {
      unit_price: unitPrice,
      quantity,
      gross_total: grossTotal,
      discount_percent: applicableDiscountPercent,
      discount_amount: discountAmount,
      line_total: lineTotal,
      applied_rules: appliedRules,
    };
  }

  /**
   * Check if a pricing rule applies to the given context
   */
  private ruleApplies(
    rule: PricingRule,
    conditions: PricingRuleConditions,
    product: Product,
    quantity: number,
    customer: Customer,
    allItems: { product: Product; quantity: number }[]
  ): boolean {
    switch (rule.rule_type) {
      case 'volume':
        return this.checkVolumeRule(conditions, quantity);

      case 'customer_tier':
        return this.checkCustomerTierRule(conditions, customer);

      case 'bundle':
        return this.checkBundleRule(conditions, allItems);

      case 'promotional':
        return this.checkPromotionalRule(conditions, product);

      case 'commitment':
        return this.checkCommitmentRule(conditions, product);

      default:
        return false;
    }
  }

  private checkVolumeRule(conditions: PricingRuleConditions, quantity: number): boolean {
    if (conditions.min_quantity && quantity < conditions.min_quantity) {
      return false;
    }
    if (conditions.max_quantity && quantity > conditions.max_quantity) {
      return false;
    }
    return true;
  }

  private checkCustomerTierRule(conditions: PricingRuleConditions, customer: Customer): boolean {
    if (conditions.customer_tier && customer.customer_tier !== conditions.customer_tier) {
      return false;
    }
    return true;
  }

  private checkBundleRule(
    conditions: PricingRuleConditions,
    allItems: { product: Product; quantity: number }[]
  ): boolean {
    if (!conditions.required_categories || conditions.required_categories.length === 0) {
      return false;
    }

    const itemCategories = new Set(allItems.map((item) => item.product.category));
    return conditions.required_categories.every((cat) => itemCategories.has(cat));
  }

  private checkPromotionalRule(conditions: PricingRuleConditions, product: Product): boolean {
    if (conditions.product_ids && !conditions.product_ids.includes(product.id)) {
      return false;
    }
    if (conditions.category && product.category !== conditions.category) {
      return false;
    }
    return true;
  }

  private checkCommitmentRule(conditions: PricingRuleConditions, product: Product): boolean {
    if (conditions.category && product.category !== conditions.category) {
      return false;
    }
    return true;
  }

  /**
   * Calculate total pricing for a quote
   */
  calculateQuote(
    items: QuoteItemInput[],
    customer: Customer,
    taxRate: number = 0
  ): PricingCalculation {
    // Get products for all items
    const productIds = items.map((item) => item.product_id);
    const products = this.getProducts(productIds);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Build all items array for bundle checking
    const allItems = items
      .filter((item) => productMap.has(item.product_id))
      .map((item) => ({
        product: productMap.get(item.product_id)!,
        quantity: item.quantity,
      }));

    let subtotal = 0;
    let discountTotal = 0;
    const appliedDiscounts: AppliedDiscount[] = [];

    // Calculate each line item
    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product) continue;

      const calculation = this.calculateLineItem(
        product,
        item.quantity,
        customer,
        item.discount_percent || 0,
        allItems
      );

      subtotal += calculation.gross_total;
      discountTotal += calculation.discount_amount;

      // Track applied discounts
      for (const ruleId of calculation.applied_rules) {
        const rule = this.rules.find((r) => r.id === ruleId);
        if (rule && !appliedDiscounts.find((d) => d.rule_id === ruleId)) {
          appliedDiscounts.push({
            rule_id: rule.id,
            rule_name: rule.name,
            discount_type: rule.discount_type,
            discount_value: rule.discount_value,
            amount: calculation.discount_amount,
          });
        }
      }
    }

    const afterDiscount = subtotal - discountTotal;
    const taxAmount = afterDiscount * (taxRate / 100);
    const total = afterDiscount + taxAmount;

    return {
      subtotal,
      discounts: appliedDiscounts,
      discount_total: discountTotal,
      tax_amount: taxAmount,
      total,
    };
  }

  /**
   * Get suggested price for a product based on customer
   */
  getSuggestedPrice(product: Product, quantity: number, customer: Customer): number {
    const calculation = this.calculateLineItem(product, quantity, customer, 0, []);
    return calculation.line_total / quantity;
  }

  /**
   * Get applicable discounts for display
   */
  getApplicableDiscounts(
    product: Product,
    quantity: number,
    customer: Customer
  ): { rule: PricingRule; discount_percent: number }[] {
    const applicable: { rule: PricingRule; discount_percent: number }[] = [];

    for (const rule of this.rules) {
      const conditions = JSON.parse(rule.conditions) as PricingRuleConditions;

      if (this.ruleApplies(rule, conditions, product, quantity, customer, [])) {
        if (rule.discount_type === 'percentage') {
          applicable.push({
            rule,
            discount_percent: rule.discount_value,
          });
        }
      }
    }

    return applicable.sort((a, b) => b.discount_percent - a.discount_percent);
  }

  /**
   * Validate if a manual discount requires approval
   */
  checkApprovalRequired(
    discountPercent: number,
    total: number
  ): { required: boolean; reason?: string; required_role?: string } {
    const approvalRules = db
      .prepare(`SELECT * FROM approval_rules WHERE is_active = 1 ORDER BY min_discount_percent ASC`)
      .all() as any[];

    for (const rule of approvalRules) {
      // Check discount threshold
      if (
        rule.min_discount_percent !== null &&
        rule.max_discount_percent !== null &&
        discountPercent >= rule.min_discount_percent &&
        discountPercent <= rule.max_discount_percent
      ) {
        return {
          required: true,
          reason: rule.name,
          required_role: rule.required_role,
        };
      }

      // Check total threshold
      if (
        rule.min_total !== null &&
        total >= rule.min_total &&
        (rule.max_total === null || total <= rule.max_total)
      ) {
        return {
          required: true,
          reason: rule.name,
          required_role: rule.required_role,
        };
      }
    }

    return { required: false };
  }

  private getProducts(ids: string[]): Product[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db
      .prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
      .all(...ids) as Product[];
  }
}

// Export singleton instance
export const pricingEngine = new PricingEngine();
