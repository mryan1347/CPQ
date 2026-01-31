// User types
export interface User {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  role: 'admin' | 'manager' | 'sales_rep';
  created_at: string;
  updated_at: string;
}

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

// Product types
export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  base_price: number;
  unit: string;
  is_active: boolean;
  hubspot_product_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  category?: string;
  base_price: number;
  unit?: string;
}

// Customer types
export interface Customer {
  id: string;
  hubspot_company_id?: string;
  hubspot_contact_id?: string;
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country: string;
  customer_tier: 'standard' | 'premium' | 'enterprise' | 'partner';
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerInput {
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  customer_tier?: 'standard' | 'premium' | 'enterprise' | 'partner';
}

// Pricing rule types
export type PricingRuleType = 'volume' | 'customer_tier' | 'bundle' | 'promotional' | 'commitment';
export type DiscountType = 'percentage' | 'fixed_amount' | 'fixed_price';

export interface PricingRuleConditions {
  min_quantity?: number;
  max_quantity?: number;
  customer_tier?: string;
  category?: string;
  product_ids?: string[];
  required_categories?: string[];
  commitment_months?: number;
}

export interface PricingRule {
  id: string;
  name: string;
  description?: string;
  rule_type: PricingRuleType;
  conditions: string; // JSON string of PricingRuleConditions
  discount_type: DiscountType;
  discount_value: number;
  priority: number;
  is_active: boolean;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

// Quote types
export type QuoteStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  created_by: string;
  status: QuoteStatus;
  title?: string;
  notes?: string;
  subtotal: number;
  discount_total: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  valid_until?: string;
  hubspot_deal_id?: string;
  approved_by?: string;
  approved_at?: string;
  sent_at?: string;
  accepted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteWithDetails extends Quote {
  customer?: Customer;
  items: QuoteItem[];
  created_by_user?: User;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  line_total: number;
  notes?: string;
  sort_order: number;
  created_at: string;
  product?: Product;
}

export interface CreateQuoteInput {
  customer_id: string;
  title?: string;
  notes?: string;
  tax_rate?: number;
  valid_until?: string;
}

export interface QuoteItemInput {
  product_id: string;
  quantity: number;
  unit_price?: number;
  discount_percent?: number;
  notes?: string;
}

// Approval types
export interface ApprovalRule {
  id: string;
  name: string;
  description?: string;
  min_discount_percent?: number;
  max_discount_percent?: number;
  min_total?: number;
  max_total?: number;
  required_role: string;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  quote_id: string;
  requested_by: string;
  assigned_to?: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  resolved_at?: string;
  created_at: string;
}

// HubSpot types
export interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

export interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    pipeline?: string;
  };
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Pricing calculation types
export interface PricingCalculation {
  subtotal: number;
  discounts: AppliedDiscount[];
  discount_total: number;
  tax_amount: number;
  total: number;
}

export interface AppliedDiscount {
  rule_id: string;
  rule_name: string;
  discount_type: DiscountType;
  discount_value: number;
  amount: number;
}

export interface LineItemCalculation {
  unit_price: number;
  quantity: number;
  gross_total: number;
  discount_percent: number;
  discount_amount: number;
  line_total: number;
  applied_rules: string[];
}
