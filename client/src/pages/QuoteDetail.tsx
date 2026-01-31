import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Download,
  Send,
  CheckCircle,
  XCircle,
  Copy,
  ArrowLeft,
  AlertCircle,
  Cloud,
} from 'lucide-react';

interface QuoteDetail {
  id: string;
  quote_number: string;
  customer?: {
    id: string;
    company_name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
  };
  items: Array<{
    id: string;
    product?: { name: string; sku: string; unit: string };
    quantity: number;
    unit_price: number;
    discount_percent: number;
    discount_amount: number;
    line_total: number;
  }>;
  status: string;
  title?: string;
  notes?: string;
  subtotal: number;
  discount_total: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  valid_until?: string;
  created_at: string;
  hubspot_deal_id?: string;
  requires_approval?: boolean;
  approval_reason?: string;
}

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useAuth(); // Ensure user is authenticated
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    fetchQuote();
  }, [id]);

  const fetchQuote = async () => {
    try {
      const response = await api.get(`/quotes/${id}`);
      setQuote(response.data.data);
    } catch (error) {
      console.error('Failed to fetch quote:', error);
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending_approval: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      sent: 'bg-purple-100 text-purple-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      switch (action) {
        case 'finalize':
          await api.post(`/quotes/${id}/finalize`);
          break;
        case 'submit-approval':
          await api.post(`/quotes/${id}/submit-for-approval`);
          break;
        case 'send':
          await api.post(`/quotes/${id}/send`);
          break;
        case 'accept':
          await api.post(`/quotes/${id}/accept`);
          break;
        case 'reject':
          await api.post(`/quotes/${id}/reject`);
          break;
        case 'clone':
          const response = await api.post(`/quotes/${id}/clone`);
          navigate(`/quotes/${response.data.data.id}`);
          return;
        case 'sync-hubspot':
          await api.post(`/quotes/${id}/sync-to-hubspot`);
          break;
      }
      await fetchQuote();
    } catch (error: any) {
      alert(error.response?.data?.error || `Failed to ${action}`);
    } finally {
      setActionLoading('');
    }
  };

  const downloadPdf = async () => {
    try {
      const response = await api.get(`/quotes/${id}/pdf`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quote-${quote?.quote_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Quote not found</p>
        <Link to="/quotes" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Quotes
        </Link>
      </div>
    );
  }

  const canFinalize = quote.status === 'draft' && !quote.requires_approval;
  const canSubmitApproval = quote.status === 'draft' && quote.requires_approval;
  const canSend = quote.status === 'approved';
  const canAcceptReject = quote.status === 'sent';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/quotes" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
            {quote.title && <p className="text-gray-500">{quote.title}</p>}
          </div>
          <span
            className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(
              quote.status
            )}`}
          >
            {quote.status.replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button onClick={downloadPdf} className="btn btn-secondary flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>PDF</span>
          </button>

          <button
            onClick={() => handleAction('clone')}
            disabled={actionLoading === 'clone'}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <Copy className="w-4 h-4" />
            <span>Clone</span>
          </button>

          <button
            onClick={() => handleAction('sync-hubspot')}
            disabled={actionLoading === 'sync-hubspot'}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <Cloud className="w-4 h-4" />
            <span>{quote.hubspot_deal_id ? 'Sync' : 'Push to'} HubSpot</span>
          </button>
        </div>
      </div>

      {/* Approval Warning */}
      {quote.requires_approval && quote.status === 'draft' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Approval Required</p>
            <p className="text-sm text-yellow-700">{quote.approval_reason}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {(canFinalize || canSubmitApproval || canSend || canAcceptReject) && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between">
            <p className="text-blue-800 font-medium">Available Actions</p>
            <div className="flex items-center space-x-2">
              {canFinalize && (
                <button
                  onClick={() => handleAction('finalize')}
                  disabled={actionLoading === 'finalize'}
                  className="btn btn-success flex items-center space-x-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Finalize Quote</span>
                </button>
              )}

              {canSubmitApproval && (
                <button
                  onClick={() => handleAction('submit-approval')}
                  disabled={actionLoading === 'submit-approval'}
                  className="btn btn-primary flex items-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit for Approval</span>
                </button>
              )}

              {canSend && (
                <button
                  onClick={() => handleAction('send')}
                  disabled={actionLoading === 'send'}
                  className="btn btn-primary flex items-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Mark as Sent</span>
                </button>
              )}

              {canAcceptReject && (
                <>
                  <button
                    onClick={() => handleAction('accept')}
                    disabled={actionLoading === 'accept'}
                    className="btn btn-success flex items-center space-x-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Accept</span>
                  </button>
                  <button
                    onClick={() => handleAction('reject')}
                    disabled={actionLoading === 'reject'}
                    className="btn btn-danger flex items-center space-x-2"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Info */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer</h2>
          {quote.customer ? (
            <div className="space-y-2">
              <p className="font-medium text-gray-900">{quote.customer.company_name}</p>
              {quote.customer.contact_name && (
                <p className="text-gray-600">{quote.customer.contact_name}</p>
              )}
              {quote.customer.email && (
                <p className="text-gray-600">{quote.customer.email}</p>
              )}
              {quote.customer.phone && (
                <p className="text-gray-600">{quote.customer.phone}</p>
              )}
            </div>
          ) : (
            <p className="text-gray-500">No customer assigned</p>
          )}
        </div>

        {/* Quote Info */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Created:</span>
              <span>{new Date(quote.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Valid Until:</span>
              <span>
                {quote.valid_until
                  ? new Date(quote.valid_until).toLocaleDateString()
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tax Rate:</span>
              <span>{quote.tax_rate}%</span>
            </div>
            {quote.hubspot_deal_id && (
              <div className="flex justify-between">
                <span className="text-gray-600">HubSpot Deal:</span>
                <span className="text-green-600">Synced</span>
              </div>
            )}
          </div>
        </div>

        {/* Totals */}
        <div className="card bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span>{formatCurrency(quote.subtotal)}</span>
            </div>
            {quote.discount_total > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount:</span>
                <span>-{formatCurrency(quote.discount_total)}</span>
              </div>
            )}
            {quote.tax_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tax:</span>
                <span>{formatCurrency(quote.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold border-t pt-2">
              <span>Total:</span>
              <span>{formatCurrency(quote.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Line Items</h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="table-header py-3 px-4">Product</th>
                <th className="table-header py-3 px-4 text-right">Qty</th>
                <th className="table-header py-3 px-4 text-right">Unit Price</th>
                <th className="table-header py-3 px-4 text-right">Discount</th>
                <th className="table-header py-3 px-4 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900">{item.product?.name}</p>
                    <p className="text-sm text-gray-500">{item.product?.sku}</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {item.quantity} {item.product?.unit}
                  </td>
                  <td className="py-3 px-4 text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="py-3 px-4 text-right">
                    {item.discount_percent > 0 ? `${item.discount_percent}%` : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-medium">
                    {formatCurrency(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Notes</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}
    </div>
  );
}
