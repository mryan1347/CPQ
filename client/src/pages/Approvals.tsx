import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, FileText, AlertCircle } from 'lucide-react';

interface PendingApproval {
  id: string;
  quote_id: string;
  quote_number: string;
  company_name: string;
  total: number;
  requested_by_name: string;
  created_at: string;
}

export default function Approvals() {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; quoteNumber: string } | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const isApprover = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    if (isApprover) {
      fetchApprovals();
    } else {
      setIsLoading(false);
    }
  }, [isApprover]);

  const fetchApprovals = async () => {
    try {
      const response = await api.get('/approvals/pending');
      setApprovals(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch approvals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleApprove = async (approvalId: string) => {
    setActionLoading(approvalId);
    try {
      await api.post(`/approvals/${approvalId}/approve`);
      fetchApprovals();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectComment.trim()) return;

    setActionLoading(rejectModal.id);
    try {
      await api.post(`/approvals/${rejectModal.id}/reject`, { comments: rejectComment });
      setRejectModal(null);
      setRejectComment('');
      fetchApprovals();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isApprover) {
    return (
      <div className="card text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-500" />
        <p className="text-gray-600">You don't have permission to approve quotes.</p>
        <p className="text-sm text-gray-500 mt-1">
          Only managers and admins can approve quotes.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Pending Approvals ({approvals.length})
        </h2>
      </div>

      {approvals.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="text-gray-600">No pending approvals</p>
          <p className="text-sm text-gray-500 mt-1">All quotes have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <div key={approval.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <Link
                      to={`/quotes/${approval.quote_id}`}
                      className="text-lg font-medium text-blue-600 hover:underline"
                    >
                      {approval.quote_number}
                    </Link>
                  </div>
                  <p className="mt-1 text-gray-600">{approval.company_name}</p>
                  <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                    <span>Total: {formatCurrency(approval.total)}</span>
                    <span>Requested: {new Date(approval.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleApprove(approval.id)}
                    disabled={actionLoading === approval.id}
                    className="btn btn-success flex items-center space-x-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() =>
                      setRejectModal({ id: approval.id, quoteNumber: approval.quote_number })
                    }
                    disabled={actionLoading === approval.id}
                    className="btn btn-danger flex items-center space-x-2"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Reject Quote</h2>
              <p className="text-gray-500 mt-1">Quote: {rejectModal.quoteNumber}</p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for rejection *
              </label>
              <textarea
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                className="input"
                rows={4}
                placeholder="Please provide a reason for rejecting this quote..."
                required
              />
            </div>

            <div className="p-6 border-t flex justify-end space-x-3">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectComment('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectComment.trim() || actionLoading === rejectModal.id}
                className="btn btn-danger"
              >
                Reject Quote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
