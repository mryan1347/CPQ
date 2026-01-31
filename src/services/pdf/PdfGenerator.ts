import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import config from '../../config/index.js';
import type { QuoteWithDetails } from '../../types/index.js';

export class PdfGenerator {
  /**
   * Generate a PDF quote document
   */
  async generateQuotePdf(quote: QuoteWithDetails): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.buildDocument(doc, quote);

      doc.end();
    });
  }

  /**
   * Save PDF to file
   */
  async saveQuotePdf(quote: QuoteWithDetails, outputPath: string): Promise<string> {
    const buffer = await this.generateQuotePdf(quote);
    const dir = path.dirname(outputPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  private buildDocument(doc: PDFKit.PDFDocument, quote: QuoteWithDetails): void {
    // Header
    this.addHeader(doc, quote);

    // Customer info
    this.addCustomerInfo(doc, quote);

    // Line items table
    this.addItemsTable(doc, quote);

    // Totals
    this.addTotals(doc, quote);

    // Terms and notes
    this.addFooter(doc, quote);
  }

  private addHeader(doc: PDFKit.PDFDocument, quote: QuoteWithDetails): void {
    // Company name
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(config.company.name, { align: 'left' });

    // Company details
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(config.company.address)
      .text(`Phone: ${config.company.phone}`)
      .text(`Email: ${config.company.email}`)
      .text(config.company.website);

    doc.moveDown();

    // Quote title
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('QUOTE', { align: 'right' });

    // Quote details
    const rightColumn = 400;
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Quote #: ${quote.quote_number}`, rightColumn, doc.y, { align: 'right' })
      .text(`Date: ${this.formatDate(quote.created_at)}`, { align: 'right' })
      .text(`Valid Until: ${this.formatDate(quote.valid_until || '')}`, { align: 'right' })
      .text(`Status: ${quote.status.toUpperCase()}`, { align: 'right' });

    doc.moveDown(2);

    // Horizontal line
    doc
      .strokeColor('#333333')
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke();

    doc.moveDown();
  }

  private addCustomerInfo(doc: PDFKit.PDFDocument, quote: QuoteWithDetails): void {
    const customer = quote.customer;
    if (!customer) return;

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Bill To:');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(customer.company_name);

    if (customer.contact_name) {
      doc.text(`Attn: ${customer.contact_name}`);
    }
    if (customer.address) {
      doc.text(customer.address);
    }
    if (customer.city || customer.state || customer.zip_code) {
      doc.text(
        [customer.city, customer.state, customer.zip_code].filter(Boolean).join(', ')
      );
    }
    if (customer.email) {
      doc.text(`Email: ${customer.email}`);
    }
    if (customer.phone) {
      doc.text(`Phone: ${customer.phone}`);
    }

    doc.moveDown(2);
  }

  private addItemsTable(doc: PDFKit.PDFDocument, quote: QuoteWithDetails): void {
    const tableTop = doc.y;
    const columns = {
      item: { x: 50, width: 200 },
      qty: { x: 250, width: 50 },
      price: { x: 300, width: 80 },
      discount: { x: 380, width: 70 },
      total: { x: 450, width: 100 },
    };

    // Table header
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#333333');

    doc.rect(50, tableTop, 500, 20).fill('#f0f0f0');

    doc
      .fillColor('#333333')
      .text('Item', columns.item.x + 5, tableTop + 5, { width: columns.item.width })
      .text('Qty', columns.qty.x, tableTop + 5, { width: columns.qty.width, align: 'right' })
      .text('Unit Price', columns.price.x, tableTop + 5, { width: columns.price.width, align: 'right' })
      .text('Discount', columns.discount.x, tableTop + 5, { width: columns.discount.width, align: 'right' })
      .text('Total', columns.total.x, tableTop + 5, { width: columns.total.width, align: 'right' });

    // Table rows
    doc.font('Helvetica');
    let y = tableTop + 25;

    for (const item of quote.items) {
      const productName = item.product?.name || 'Unknown Product';
      const sku = item.product?.sku || '';

      // Check for page break
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc
        .fontSize(10)
        .text(productName, columns.item.x + 5, y, { width: columns.item.width });

      if (sku) {
        doc
          .fontSize(8)
          .fillColor('#666666')
          .text(`SKU: ${sku}`, columns.item.x + 5, y + 12, { width: columns.item.width });
        doc.fillColor('#333333');
      }

      doc
        .fontSize(10)
        .text(item.quantity.toString(), columns.qty.x, y, { width: columns.qty.width, align: 'right' })
        .text(this.formatCurrency(item.unit_price), columns.price.x, y, { width: columns.price.width, align: 'right' })
        .text(item.discount_percent > 0 ? `${item.discount_percent}%` : '-', columns.discount.x, y, { width: columns.discount.width, align: 'right' })
        .text(this.formatCurrency(item.line_total), columns.total.x, y, { width: columns.total.width, align: 'right' });

      if (item.notes) {
        y += sku ? 24 : 15;
        doc
          .fontSize(8)
          .fillColor('#666666')
          .text(`Note: ${item.notes}`, columns.item.x + 10, y, { width: 400 });
        doc.fillColor('#333333');
        y += 10;
      } else {
        y += sku ? 30 : 20;
      }

      // Row separator
      doc
        .strokeColor('#e0e0e0')
        .lineWidth(0.5)
        .moveTo(50, y - 5)
        .lineTo(550, y - 5)
        .stroke();
    }

    doc.y = y + 10;
  }

  private addTotals(doc: PDFKit.PDFDocument, quote: QuoteWithDetails): void {
    const rightAlign = 450;
    const valueAlign = 550;

    doc.moveDown();

    // Totals box
    const boxTop = doc.y;
    doc.rect(350, boxTop, 200, 80).fill('#f9f9f9');

    let y = boxTop + 10;

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#333333');

    // Subtotal
    doc
      .text('Subtotal:', rightAlign, y, { width: 80 })
      .text(this.formatCurrency(quote.subtotal), valueAlign - 50, y, { width: 80, align: 'right' });
    y += 15;

    // Discount
    if (quote.discount_total > 0) {
      doc
        .text('Discount:', rightAlign, y, { width: 80 })
        .text(`-${this.formatCurrency(quote.discount_total)}`, valueAlign - 50, y, { width: 80, align: 'right' });
      y += 15;
    }

    // Tax
    if (quote.tax_rate > 0) {
      doc
        .text(`Tax (${quote.tax_rate}%):`, rightAlign, y, { width: 80 })
        .text(this.formatCurrency(quote.tax_amount), valueAlign - 50, y, { width: 80, align: 'right' });
      y += 15;
    }

    // Total
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Total:', rightAlign, y, { width: 80 })
      .text(this.formatCurrency(quote.total), valueAlign - 50, y, { width: 80, align: 'right' });

    doc.y = boxTop + 90;
  }

  private addFooter(doc: PDFKit.PDFDocument, quote: QuoteWithDetails): void {
    doc.moveDown(2);

    // Notes
    if (quote.notes) {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Notes:');
      doc
        .font('Helvetica')
        .text(quote.notes);
      doc.moveDown();
    }

    // Terms
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Terms & Conditions:');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text('• This quote is valid until the date specified above.')
      .text('• Prices are subject to change after the validity period.')
      .text('• Payment terms: Net 30 unless otherwise agreed.')
      .text('• All prices are in USD unless otherwise specified.');

    // Acceptance signature area
    doc.moveDown(2);
    doc
      .fontSize(10)
      .fillColor('#333333')
      .font('Helvetica-Bold')
      .text('Acceptance:');

    doc.moveDown();
    doc.font('Helvetica').fontSize(9);

    const sigY = doc.y;
    doc.text('Signature: _________________________', 50, sigY);
    doc.text('Date: _____________', 350, sigY);

    doc.moveDown();
    doc.text('Name: _________________________', 50);
    doc.text('Title: _________________________', 50);

    // Footer with quote number
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(
        `Quote #${quote.quote_number} | Generated on ${this.formatDate(new Date().toISOString())}`,
        50,
        750,
        { align: 'center' }
      );
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

export const pdfGenerator = new PdfGenerator();
