import db from '../../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { quoteService } from '../quote/QuoteService.js';
import type { ApprovalRule, ApprovalRequest, Quote, User } from '../../types/index.js';

export class ApprovalService {
  /**
   * Check if a quote requires approval
   */
  checkApprovalRequired(quoteId: string): { required: boolean; rules: ApprovalRule[]; reason?: string } {
    const quote = quoteService.getQuoteWithDetails(quoteId);
    if (!quote) {
      return { required: false, rules: [] };
    }

    const matchingRules: ApprovalRule[] = [];
    const rules = db.prepare('SELECT * FROM approval_rules WHERE is_active = 1').all() as ApprovalRule[];

    // Calculate max discount percentage across all items
    let maxDiscountPercent = 0;
    for (const item of quote.items) {
      if (item.discount_percent > maxDiscountPercent) {
        maxDiscountPercent = item.discount_percent;
      }
    }

    for (const rule of rules) {
      let matches = false;

      // Check discount threshold
      if (rule.min_discount_percent !== null && rule.max_discount_percent !== null) {
        if (maxDiscountPercent >= rule.min_discount_percent && maxDiscountPercent <= rule.max_discount_percent) {
          matches = true;
        }
      } else if (rule.min_discount_percent !== null && maxDiscountPercent >= rule.min_discount_percent) {
        matches = true;
      }

      // Check total threshold
      if (rule.min_total !== null) {
        if (quote.total >= rule.min_total && (rule.max_total === null || quote.total <= rule.max_total)) {
          matches = true;
        }
      }

      if (matches) {
        matchingRules.push(rule);
      }
    }

    if (matchingRules.length > 0) {
      const reasons = matchingRules.map((r) => r.name).join(', ');
      return {
        required: true,
        rules: matchingRules,
        reason: `Approval required: ${reasons}`,
      };
    }

    return { required: false, rules: [] };
  }

  /**
   * Submit a quote for approval
   */
  submitForApproval(quoteId: string, userId: string): ApprovalRequest {
    const quote = quoteService.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found');
    if (quote.status !== 'draft') throw new Error('Only draft quotes can be submitted for approval');

    const approvalCheck = this.checkApprovalRequired(quoteId);
    if (!approvalCheck.required) {
      throw new Error('This quote does not require approval');
    }

    // Find appropriate approver based on required role
    const requiredRole = approvalCheck.rules[0]?.required_role || 'manager';
    const approver = db
      .prepare('SELECT id FROM users WHERE role = ? OR role = ? LIMIT 1')
      .get(requiredRole, 'admin') as { id: string } | undefined;

    const id = uuidv4();

    db.prepare(`
      INSERT INTO approval_requests (id, quote_id, requested_by, assigned_to, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(id, quoteId, userId, approver?.id || null);

    // Update quote status
    db.prepare("UPDATE quotes SET status = 'pending_approval', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      quoteId
    );

    return db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id) as ApprovalRequest;
  }

  /**
   * Get pending approvals for a user
   */
  getPendingApprovals(userId: string): (ApprovalRequest & { quote: Quote })[] {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
    if (!user) return [];

    let query = `
      SELECT ar.*, q.quote_number, q.total, q.customer_id, c.company_name
      FROM approval_requests ar
      JOIN quotes q ON ar.quote_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ar.status = 'pending'
    `;

    if (user.role !== 'admin') {
      query += ` AND (ar.assigned_to = ? OR ar.assigned_to IS NULL)`;
      return db.prepare(query).all(userId) as any[];
    }

    return db.prepare(query).all() as any[];
  }

  /**
   * Approve a quote
   */
  approve(requestId: string, approverId: string, comments?: string): ApprovalRequest {
    const request = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(requestId) as ApprovalRequest | null;
    if (!request) throw new Error('Approval request not found');
    if (request.status !== 'pending') throw new Error('Request is no longer pending');

    const approver = db.prepare('SELECT * FROM users WHERE id = ?').get(approverId) as User | undefined;
    if (!approver) throw new Error('Approver not found');

    // Verify approver has permission
    const approvalCheck = this.checkApprovalRequired(request.quote_id);
    const requiredRole = approvalCheck.rules[0]?.required_role || 'manager';

    if (approver.role !== 'admin' && approver.role !== requiredRole) {
      throw new Error(`Approval requires ${requiredRole} or admin role`);
    }

    // Update approval request
    db.prepare(`
      UPDATE approval_requests SET
        status = 'approved',
        comments = ?,
        resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(comments || null, requestId);

    // Update quote status
    quoteService.updateStatus(request.quote_id, 'approved', approverId);

    return db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(requestId) as ApprovalRequest;
  }

  /**
   * Reject a quote
   */
  reject(requestId: string, approverId: string, comments: string): ApprovalRequest {
    const request = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(requestId) as ApprovalRequest | null;
    if (!request) throw new Error('Approval request not found');
    if (request.status !== 'pending') throw new Error('Request is no longer pending');

    if (!comments) throw new Error('Comments are required when rejecting');

    // Update approval request
    db.prepare(`
      UPDATE approval_requests SET
        status = 'rejected',
        comments = ?,
        resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(comments, requestId);

    // Update quote status back to draft so it can be modified
    db.prepare("UPDATE quotes SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      request.quote_id
    );

    return db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(requestId) as ApprovalRequest;
  }

  /**
   * Get approval history for a quote
   */
  getApprovalHistory(quoteId: string): ApprovalRequest[] {
    return db
      .prepare(`
        SELECT ar.*, u1.name as requested_by_name, u2.name as assigned_to_name
        FROM approval_requests ar
        LEFT JOIN users u1 ON ar.requested_by = u1.id
        LEFT JOIN users u2 ON ar.assigned_to = u2.id
        WHERE ar.quote_id = ?
        ORDER BY ar.created_at DESC
      `)
      .all(quoteId) as ApprovalRequest[];
  }
}

export const approvalService = new ApprovalService();
