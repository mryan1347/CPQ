import { Client } from '@hubspot/api-client';
import db from '../../db/database.js';
import config from '../../config/index.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  Customer,
  Product,
  Quote,
  QuoteWithDetails,
  HubSpotCompany,
  HubSpotContact,
  HubSpotDeal,
} from '../../types/index.js';

export class HubSpotService {
  private client: Client;
  private isConfigured: boolean;

  constructor() {
    this.client = new Client({ accessToken: config.hubspot.accessToken });
    this.isConfigured = !!config.hubspot.accessToken;
  }

  /**
   * Check if HubSpot is configured
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Test HubSpot connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'HubSpot access token not configured' };
    }

    try {
      await this.client.crm.companies.basicApi.getPage(1);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Connection failed' };
    }
  }

  // ============================================
  // COMPANY OPERATIONS
  // ============================================

  /**
   * Fetch companies from HubSpot
   */
  async getCompanies(limit: number = 100): Promise<HubSpotCompany[]> {
    if (!this.isConfigured) return [];

    try {
      const response = await this.client.crm.companies.basicApi.getPage(
        limit,
        undefined,
        ['name', 'domain', 'phone', 'address', 'city', 'state', 'zip', 'country']
      );

      return response.results.map((company) => ({
        id: company.id,
        properties: company.properties as HubSpotCompany['properties'],
      }));
    } catch (error) {
      this.logSyncError('company', 'fetch', error);
      return [];
    }
  }

  /**
   * Get a single company from HubSpot
   */
  async getCompany(hubspotId: string): Promise<HubSpotCompany | null> {
    if (!this.isConfigured) return null;

    try {
      const response = await this.client.crm.companies.basicApi.getById(
        hubspotId,
        ['name', 'domain', 'phone', 'address', 'city', 'state', 'zip', 'country']
      );

      return {
        id: response.id,
        properties: response.properties as HubSpotCompany['properties'],
      };
    } catch (error) {
      this.logSyncError('company', 'fetch', error, hubspotId);
      return null;
    }
  }

  /**
   * Sync companies from HubSpot to local database
   */
  async syncCompanies(): Promise<{ synced: number; errors: number }> {
    const companies = await this.getCompanies(500);
    let synced = 0;
    let errors = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO customers (id, hubspot_company_id, company_name, phone, address, city, state, zip_code, country, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(hubspot_company_id) DO UPDATE SET
        company_name = excluded.company_name,
        phone = excluded.phone,
        address = excluded.address,
        city = excluded.city,
        state = excluded.state,
        zip_code = excluded.zip_code,
        country = excluded.country,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const company of companies) {
      try {
        // Check if customer exists
        const existing = db
          .prepare('SELECT id FROM customers WHERE hubspot_company_id = ?')
          .get(company.id) as { id: string } | undefined;

        upsertStmt.run(
          existing?.id || uuidv4(),
          company.id,
          company.properties.name || 'Unknown Company',
          company.properties.phone || null,
          company.properties.address || null,
          company.properties.city || null,
          company.properties.state || null,
          company.properties.zip || null,
          company.properties.country || 'USA'
        );

        this.logSync('company', existing?.id || 'new', company.id, 'sync', 'success');
        synced++;
      } catch (error) {
        this.logSyncError('company', 'sync', error, company.id);
        errors++;
      }
    }

    return { synced, errors };
  }

  /**
   * Push a customer to HubSpot
   */
  async pushCustomer(customer: Customer): Promise<string | null> {
    if (!this.isConfigured) return null;

    try {
      const properties = {
        name: customer.company_name,
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        zip: customer.zip_code || '',
        country: customer.country || 'USA',
      };

      if (customer.hubspot_company_id) {
        // Update existing
        await this.client.crm.companies.basicApi.update(customer.hubspot_company_id, {
          properties,
        });
        this.logSync('company', customer.id, customer.hubspot_company_id, 'push', 'success');
        return customer.hubspot_company_id;
      } else {
        // Create new
        const response = await this.client.crm.companies.basicApi.create({ properties });

        // Update local record with HubSpot ID
        db.prepare('UPDATE customers SET hubspot_company_id = ? WHERE id = ?').run(
          response.id,
          customer.id
        );

        this.logSync('company', customer.id, response.id, 'create', 'success');
        return response.id;
      }
    } catch (error) {
      this.logSyncError('company', 'push', error, customer.id);
      return null;
    }
  }

  // ============================================
  // CONTACT OPERATIONS
  // ============================================

  /**
   * Fetch contacts from HubSpot
   */
  async getContacts(limit: number = 100): Promise<HubSpotContact[]> {
    if (!this.isConfigured) return [];

    try {
      const response = await this.client.crm.contacts.basicApi.getPage(
        limit,
        undefined,
        ['firstname', 'lastname', 'email', 'phone', 'company']
      );

      return response.results.map((contact) => ({
        id: contact.id,
        properties: contact.properties as HubSpotContact['properties'],
      }));
    } catch (error) {
      this.logSyncError('contact', 'fetch', error);
      return [];
    }
  }

  /**
   * Search contacts by email
   */
  async searchContactByEmail(email: string): Promise<HubSpotContact | null> {
    if (!this.isConfigured) return null;

    try {
      const response = await this.client.crm.contacts.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
        properties: ['firstname', 'lastname', 'email', 'phone', 'company'],
        limit: 1,
      });

      if (response.results.length > 0) {
        return {
          id: response.results[0].id,
          properties: response.results[0].properties as HubSpotContact['properties'],
        };
      }
      return null;
    } catch (error) {
      this.logSyncError('contact', 'search', error);
      return null;
    }
  }

  // ============================================
  // DEAL OPERATIONS
  // ============================================

  /**
   * Create a deal in HubSpot from a quote
   */
  async createDealFromQuote(quote: QuoteWithDetails): Promise<string | null> {
    if (!this.isConfigured) return null;

    try {
      const customer = quote.customer;
      const dealName = quote.title || `Quote #${quote.quote_number}`;

      const properties: Record<string, string> = {
        dealname: dealName,
        amount: quote.total.toString(),
        dealstage: this.mapQuoteStatusToDealStage(quote.status),
        pipeline: 'default',
      };

      if (quote.valid_until) {
        properties.closedate = new Date(quote.valid_until).toISOString();
      }

      const response = await this.client.crm.deals.basicApi.create({ properties });

      // Update quote with HubSpot deal ID
      db.prepare('UPDATE quotes SET hubspot_deal_id = ? WHERE id = ?').run(response.id, quote.id);

      // Associate deal with company if customer has HubSpot ID
      if (customer?.hubspot_company_id) {
        await this.associateDealWithCompany(response.id, customer.hubspot_company_id);
      }

      this.logSync('deal', quote.id, response.id, 'create', 'success');
      return response.id;
    } catch (error) {
      this.logSyncError('deal', 'create', error, quote.id);
      return null;
    }
  }

  /**
   * Update a deal in HubSpot
   */
  async updateDeal(hubspotDealId: string, quote: QuoteWithDetails): Promise<boolean> {
    if (!this.isConfigured) return false;

    try {
      const properties: Record<string, string> = {
        dealname: quote.title || `Quote #${quote.quote_number}`,
        amount: quote.total.toString(),
        dealstage: this.mapQuoteStatusToDealStage(quote.status),
      };

      if (quote.valid_until) {
        properties.closedate = new Date(quote.valid_until).toISOString();
      }

      await this.client.crm.deals.basicApi.update(hubspotDealId, { properties });

      this.logSync('deal', quote.id, hubspotDealId, 'update', 'success');
      return true;
    } catch (error) {
      this.logSyncError('deal', 'update', error, hubspotDealId);
      return false;
    }
  }

  /**
   * Get deal from HubSpot
   */
  async getDeal(hubspotDealId: string): Promise<HubSpotDeal | null> {
    if (!this.isConfigured) return null;

    try {
      const response = await this.client.crm.deals.basicApi.getById(hubspotDealId, [
        'dealname',
        'amount',
        'dealstage',
        'closedate',
        'pipeline',
      ]);

      return {
        id: response.id,
        properties: response.properties as HubSpotDeal['properties'],
      };
    } catch (error) {
      this.logSyncError('deal', 'fetch', error, hubspotDealId);
      return null;
    }
  }

  /**
   * Associate deal with company
   */
  private async associateDealWithCompany(dealId: string, companyId: string): Promise<void> {
    try {
      await this.client.crm.deals.associationsApi.create(dealId, 'companies', companyId, [
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 5, // Deal to Company
        },
      ]);
    } catch (error) {
      console.error('Failed to associate deal with company:', error);
    }
  }

  // ============================================
  // PRODUCT OPERATIONS
  // ============================================

  /**
   * Sync products to HubSpot
   */
  async syncProductsToHubSpot(): Promise<{ synced: number; errors: number }> {
    if (!this.isConfigured) return { synced: 0, errors: 0 };

    const products = db.prepare('SELECT * FROM products WHERE is_active = 1').all() as Product[];
    let synced = 0;
    let errors = 0;

    for (const product of products) {
      try {
        const properties = {
          name: product.name,
          description: product.description || '',
          price: product.base_price.toString(),
          hs_sku: product.sku,
        };

        if (product.hubspot_product_id) {
          // Update existing
          await this.client.crm.products.basicApi.update(product.hubspot_product_id, {
            properties,
          });
        } else {
          // Create new
          const response = await this.client.crm.products.basicApi.create({ properties });

          db.prepare('UPDATE products SET hubspot_product_id = ? WHERE id = ?').run(
            response.id,
            product.id
          );
        }

        synced++;
      } catch (error) {
        this.logSyncError('product', 'sync', error, product.id);
        errors++;
      }
    }

    return { synced, errors };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private mapQuoteStatusToDealStage(status: string): string {
    const stageMap: Record<string, string> = {
      draft: 'appointmentscheduled',
      pending_approval: 'qualifiedtobuy',
      approved: 'presentationscheduled',
      sent: 'decisionmakerboughtin',
      accepted: 'closedwon',
      rejected: 'closedlost',
      expired: 'closedlost',
    };
    return stageMap[status] || 'appointmentscheduled';
  }

  private logSync(
    entityType: string,
    entityId: string,
    hubspotId: string | null,
    action: string,
    status: string
  ): void {
    db.prepare(
      `
      INSERT INTO hubspot_sync_log (id, entity_type, entity_id, hubspot_id, action, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(uuidv4(), entityType, entityId, hubspotId, action, status);
  }

  private logSyncError(entityType: string, action: string, error: any, entityId?: string): void {
    const errorMessage = error?.message || String(error);
    db.prepare(
      `
      INSERT INTO hubspot_sync_log (id, entity_type, entity_id, hubspot_id, action, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(uuidv4(), entityType, entityId || 'unknown', null, action, 'error', errorMessage);
  }

  /**
   * Get sync history
   */
  getSyncHistory(limit: number = 50): any[] {
    return db
      .prepare(
        `
      SELECT * FROM hubspot_sync_log
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(limit);
  }
}

// Export singleton instance
export const hubspotService = new HubSpotService();
