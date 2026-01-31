# CPQ - Configure, Price, Quote

A modern CPQ (Configure, Price, Quote) application with HubSpot CRM integration, designed to replace spreadsheet-based pricing workflows for sales teams.

## Features

### Core Functionality
- **Product Catalog Management**: Organize products with SKUs, categories, and base pricing
- **Dynamic Pricing Engine**: Automatic discounts based on volume, customer tier, bundles, and promotional rules
- **Quote Builder**: Create professional quotes with line items, discounts, and tax calculations
- **PDF Generation**: Generate professional PDF quotes for customers
- **Approval Workflows**: Configurable approval rules for high-discount or high-value quotes

### HubSpot Integration
- **Company Sync**: Import companies from HubSpot and push local customers
- **Deal Creation**: Automatically create/update deals when quotes are finalized
- **Product Sync**: Push product catalog to HubSpot
- **Contact Lookup**: Search and link HubSpot contacts

### User Management
- Role-based access control (Admin, Manager, Sales Rep)
- JWT-based authentication
- Per-user quote tracking

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Database**: SQLite (better-sqlite3)
- **PDF Generation**: PDFKit
- **CRM Integration**: HubSpot API Client

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd CPQ
```

2. Install dependencies:
```bash
npm install
cd client && npm install && cd ..
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=3001
JWT_SECRET=your-secret-key-here
HUBSPOT_ACCESS_TOKEN=your-hubspot-private-app-token
COMPANY_NAME=Your Company Name
```

4. Initialize the database:
```bash
npm run db:migrate
npm run db:seed
```

5. Start the development servers:
```bash
npm run dev
```

The application will be available at:
- API: http://localhost:3001
- Frontend: http://localhost:5173

### Default Login Credentials
After seeding, use these accounts:
- **Admin**: admin@company.com / admin123
- **Manager**: manager@company.com / admin123
- **Sales Rep**: sales@company.com / admin123

## Project Structure

```
CPQ/
├── src/                    # Backend source code
│   ├── config/             # Configuration
│   ├── db/                 # Database setup and migrations
│   ├── middleware/         # Express middleware
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   │   ├── approval/       # Approval workflow
│   │   ├── hubspot/        # HubSpot integration
│   │   ├── pdf/            # PDF generation
│   │   ├── pricing/        # Pricing engine
│   │   └── quote/          # Quote management
│   ├── types/              # TypeScript types
│   └── index.ts            # Server entry point
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── context/        # React context providers
│   │   ├── lib/            # Utilities
│   │   └── pages/          # Page components
│   └── ...
├── data/                   # SQLite database (generated)
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Deactivate product

### Customers
- `GET /api/customers` - List customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `POST /api/customers/:id/sync-to-hubspot` - Push to HubSpot

### Quotes
- `GET /api/quotes` - List quotes
- `POST /api/quotes` - Create quote
- `GET /api/quotes/:id` - Get quote details
- `POST /api/quotes/:id/items` - Add line item
- `PUT /api/quotes/:id/items/:itemId` - Update line item
- `DELETE /api/quotes/:id/items/:itemId` - Remove line item
- `POST /api/quotes/:id/finalize` - Finalize quote
- `POST /api/quotes/:id/submit-for-approval` - Submit for approval
- `POST /api/quotes/:id/send` - Mark as sent
- `POST /api/quotes/:id/accept` - Mark as accepted
- `GET /api/quotes/:id/pdf` - Download PDF
- `POST /api/quotes/:id/sync-to-hubspot` - Create/update HubSpot deal

### Approvals
- `GET /api/approvals/pending` - Get pending approvals
- `POST /api/approvals/:id/approve` - Approve request
- `POST /api/approvals/:id/reject` - Reject request

### HubSpot
- `GET /api/hubspot/status` - Check connection status
- `POST /api/hubspot/sync/companies` - Sync companies from HubSpot
- `POST /api/hubspot/sync/products` - Sync products to HubSpot

## Pricing Rules

The pricing engine supports several rule types:

### Volume Discounts
Automatic discounts based on quantity:
```json
{
  "rule_type": "volume",
  "conditions": { "min_quantity": 10 },
  "discount_type": "percentage",
  "discount_value": 5
}
```

### Customer Tier Pricing
Special pricing for customer segments:
```json
{
  "rule_type": "customer_tier",
  "conditions": { "customer_tier": "enterprise" },
  "discount_type": "percentage",
  "discount_value": 10
}
```

### Bundle Discounts
Discounts when purchasing from multiple categories:
```json
{
  "rule_type": "bundle",
  "conditions": { "required_categories": ["Licenses", "Support"] },
  "discount_type": "percentage",
  "discount_value": 10
}
```

## Approval Workflow

Quotes automatically require approval when:
- Discount exceeds configured thresholds (e.g., >15% requires manager approval)
- Total value exceeds thresholds (e.g., >$50,000 requires manager approval)

Configure approval rules in the database or via API.

## HubSpot Setup

1. Create a Private App in HubSpot:
   - Go to Settings > Integrations > Private Apps
   - Create a new app with these scopes:
     - `crm.objects.companies.read`
     - `crm.objects.companies.write`
     - `crm.objects.contacts.read`
     - `crm.objects.deals.read`
     - `crm.objects.deals.write`
     - `crm.objects.line_items.write`

2. Copy the access token to your `.env` file

3. Test the connection via Settings page or API:
```bash
curl http://localhost:3001/api/hubspot/status -H "Authorization: Bearer <token>"
```

## Production Deployment

1. Build the application:
```bash
npm run build
```

2. Set environment variables for production:
```env
NODE_ENV=production
JWT_SECRET=<strong-secret-key>
DATABASE_PATH=/path/to/cpq.db
```

3. Start the server:
```bash
npm start
```

## License

MIT
