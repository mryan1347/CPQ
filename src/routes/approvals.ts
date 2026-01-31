import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { approvalService } from '../services/approval/ApprovalService.js';
import { quoteService } from '../services/quote/QuoteService.js';

const router = Router();

/**
 * GET /api/approvals/pending
 * Get pending approvals for current user
 */
router.get('/pending', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const approvals = approvalService.getPendingApprovals(req.user!.id);

  res.json({
    success: true,
    data: approvals,
  });
});

/**
 * GET /api/approvals/quote/:quoteId
 * Get approval history for a quote
 */
router.get('/quote/:quoteId', authenticate, (req: Request, res: Response) => {
  const history = approvalService.getApprovalHistory(req.params.quoteId);

  res.json({
    success: true,
    data: history,
  });
});

/**
 * POST /api/approvals/:id/approve
 * Approve a pending request
 */
router.post('/:id/approve', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const { comments } = req.body;

  try {
    const approval = approvalService.approve(req.params.id, req.user!.id, comments);
    const quote = quoteService.getQuoteWithDetails(approval.quote_id);

    res.json({
      success: true,
      data: { approval, quote },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/approvals/:id/reject
 * Reject a pending request
 */
router.post('/:id/reject', authenticate, requireRole('admin', 'manager'), (req: Request, res: Response) => {
  const { comments } = req.body;

  if (!comments) {
    res.status(400).json({ success: false, error: 'Comments are required when rejecting' });
    return;
  }

  try {
    const approval = approvalService.reject(req.params.id, req.user!.id, comments);
    const quote = quoteService.getQuoteWithDetails(approval.quote_id);

    res.json({
      success: true,
      data: { approval, quote },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
