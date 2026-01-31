import db from './database.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

console.log('Seeding database with sample data...');

// Create default admin user
const adminId = uuidv4();
const passwordHash = bcrypt.hashSync('admin123', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, name, role)
  VALUES (?, ?, ?, ?, ?)
`);

insertUser.run(adminId, 'admin@company.com', passwordHash, 'Admin User', 'admin');
insertUser.run(uuidv4(), 'sales@company.com', passwordHash, 'Sales Rep', 'sales_rep');
insertUser.run(uuidv4(), 'manager@company.com', passwordHash, 'Sales Manager', 'manager');

// Create sample products
const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products (id, sku, name, description, category, base_price, unit)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const products = [
  { sku: 'SVC-CONSULT-HR', name: 'Consulting Services - Hourly', description: 'Professional consulting services billed hourly', category: 'Services', price: 150.00, unit: 'hour' },
  { sku: 'SVC-CONSULT-DAY', name: 'Consulting Services - Daily', description: 'Professional consulting services billed daily', category: 'Services', price: 1200.00, unit: 'day' },
  { sku: 'SVC-IMPLEMENT', name: 'Implementation Services', description: 'Software implementation and setup', category: 'Services', price: 5000.00, unit: 'project' },
  { sku: 'SVC-TRAINING', name: 'Training Session', description: 'On-site or virtual training session', category: 'Services', price: 800.00, unit: 'session' },
  { sku: 'SVC-SUPPORT-MO', name: 'Monthly Support Package', description: 'Ongoing technical support', category: 'Support', price: 500.00, unit: 'month' },
  { sku: 'SVC-SUPPORT-YR', name: 'Annual Support Package', description: 'Annual technical support with discount', category: 'Support', price: 5000.00, unit: 'year' },
  { sku: 'LIC-BASIC', name: 'Basic License', description: 'Basic software license - up to 10 users', category: 'Licenses', price: 99.00, unit: 'month' },
  { sku: 'LIC-PRO', name: 'Professional License', description: 'Professional license - up to 50 users', category: 'Licenses', price: 299.00, unit: 'month' },
  { sku: 'LIC-ENT', name: 'Enterprise License', description: 'Enterprise license - unlimited users', category: 'Licenses', price: 999.00, unit: 'month' },
  { sku: 'HW-SERVER', name: 'Server Hardware', description: 'On-premise server hardware', category: 'Hardware', price: 15000.00, unit: 'each' },
  { sku: 'HW-WORKSTATION', name: 'Workstation', description: 'High-performance workstation', category: 'Hardware', price: 2500.00, unit: 'each' },
  { sku: 'ADD-STORAGE', name: 'Additional Storage', description: 'Extra cloud storage (100GB)', category: 'Add-ons', price: 25.00, unit: 'month' },
  { sku: 'ADD-API', name: 'API Access', description: 'API access for integrations', category: 'Add-ons', price: 150.00, unit: 'month' },
];

for (const product of products) {
  insertProduct.run(uuidv4(), product.sku, product.name, product.description, product.category, product.price, product.unit);
}

// Create pricing rules
const insertPricingRule = db.prepare(`
  INSERT OR IGNORE INTO pricing_rules (id, name, description, rule_type, conditions, discount_type, discount_value, priority)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const pricingRules = [
  {
    name: 'Volume Discount - 10+ Units',
    description: 'Automatic 5% discount for orders with 10+ units',
    rule_type: 'volume',
    conditions: JSON.stringify({ min_quantity: 10 }),
    discount_type: 'percentage',
    discount_value: 5,
    priority: 1,
  },
  {
    name: 'Volume Discount - 25+ Units',
    description: 'Automatic 10% discount for orders with 25+ units',
    rule_type: 'volume',
    conditions: JSON.stringify({ min_quantity: 25 }),
    discount_type: 'percentage',
    discount_value: 10,
    priority: 2,
  },
  {
    name: 'Volume Discount - 50+ Units',
    description: 'Automatic 15% discount for orders with 50+ units',
    rule_type: 'volume',
    conditions: JSON.stringify({ min_quantity: 50 }),
    discount_type: 'percentage',
    discount_value: 15,
    priority: 3,
  },
  {
    name: 'Annual Commitment Discount',
    description: '20% discount for annual license commitments',
    rule_type: 'commitment',
    conditions: JSON.stringify({ category: 'Licenses', commitment_months: 12 }),
    discount_type: 'percentage',
    discount_value: 20,
    priority: 5,
  },
  {
    name: 'Enterprise Customer Discount',
    description: 'Special pricing for enterprise tier customers',
    rule_type: 'customer_tier',
    conditions: JSON.stringify({ customer_tier: 'enterprise' }),
    discount_type: 'percentage',
    discount_value: 10,
    priority: 10,
  },
  {
    name: 'Partner Discount',
    description: 'Partner pricing discount',
    rule_type: 'customer_tier',
    conditions: JSON.stringify({ customer_tier: 'partner' }),
    discount_type: 'percentage',
    discount_value: 25,
    priority: 10,
  },
  {
    name: 'Bundle Discount - Full Stack',
    description: 'Discount when purchasing license + support + training',
    rule_type: 'bundle',
    conditions: JSON.stringify({ required_categories: ['Licenses', 'Support', 'Services'] }),
    discount_type: 'percentage',
    discount_value: 10,
    priority: 8,
  },
];

for (const rule of pricingRules) {
  insertPricingRule.run(
    uuidv4(),
    rule.name,
    rule.description,
    rule.rule_type,
    rule.conditions,
    rule.discount_type,
    rule.discount_value,
    rule.priority
  );
}

// Create approval rules
const insertApprovalRule = db.prepare(`
  INSERT OR IGNORE INTO approval_rules (id, name, description, min_discount_percent, max_discount_percent, min_total, max_total, required_role)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertApprovalRule.run(uuidv4(), 'Manager Approval - High Discount', 'Requires manager approval for discounts over 15%', 15, 25, null, null, 'manager');
insertApprovalRule.run(uuidv4(), 'Admin Approval - Very High Discount', 'Requires admin approval for discounts over 25%', 25, 100, null, null, 'admin');
insertApprovalRule.run(uuidv4(), 'Manager Approval - Large Deal', 'Requires manager approval for deals over $50,000', null, null, 50000, 100000, 'manager');
insertApprovalRule.run(uuidv4(), 'Admin Approval - Enterprise Deal', 'Requires admin approval for deals over $100,000', null, null, 100000, null, 'admin');

// Create sample customers
const insertCustomer = db.prepare(`
  INSERT OR IGNORE INTO customers (id, company_name, contact_name, email, phone, address, city, state, zip_code, customer_tier)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const customers = [
  { company: 'Acme Corporation', contact: 'John Smith', email: 'john@acme.com', phone: '555-0101', address: '100 Main St', city: 'New York', state: 'NY', zip: '10001', tier: 'enterprise' },
  { company: 'TechStart Inc', contact: 'Sarah Johnson', email: 'sarah@techstart.io', phone: '555-0102', address: '200 Innovation Way', city: 'San Francisco', state: 'CA', zip: '94105', tier: 'standard' },
  { company: 'Global Partners LLC', contact: 'Mike Williams', email: 'mike@globalpartners.com', phone: '555-0103', address: '300 Business Blvd', city: 'Chicago', state: 'IL', zip: '60601', tier: 'partner' },
  { company: 'Startup Ventures', contact: 'Emily Brown', email: 'emily@startupventures.co', phone: '555-0104', address: '400 Startup Lane', city: 'Austin', state: 'TX', zip: '78701', tier: 'standard' },
  { company: 'Enterprise Solutions', contact: 'David Lee', email: 'david@enterprise-solutions.com', phone: '555-0105', address: '500 Corporate Dr', city: 'Seattle', state: 'WA', zip: '98101', tier: 'enterprise' },
];

for (const customer of customers) {
  insertCustomer.run(uuidv4(), customer.company, customer.contact, customer.email, customer.phone, customer.address, customer.city, customer.state, customer.zip, customer.tier);
}

console.log('Database seeded successfully!');
console.log('Default credentials:');
console.log('  Admin: admin@company.com / admin123');
console.log('  Sales Rep: sales@company.com / admin123');
console.log('  Manager: manager@company.com / admin123');
