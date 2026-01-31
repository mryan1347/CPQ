import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { FileText, DollarSign, Users, TrendingUp, Plus, ArrowRight } from 'lucide-react';

interface DashboardStats {
  totalQuotes: number;
  totalRevenue: number;
  pendingApprovals: number;
  recentQuotes: any[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalQuotes: 0,
    totalRevenue: 0,
    pendingApprovals: 0,
    recentQuotes: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [quotesRes, approvalsRes] = await Promise.all([
          api.get('/quotes?limit=5'),
          api.get('/approvals/pending').catch(() => ({ data: { data: [] } })),
        ]);

        const quotes = quotesRes.data.data || [];
        const approvals = approvalsRes.data.data || [];

        const totalRevenue = quotes
          .filter((q: any) => q.status === 'accepted')
          .reduce((sum: number, q: any) => sum + (q.total || 0), 0);

        setStats({
          totalQuotes: quotesRes.data.pagination?.total || quotes.length,
          totalRevenue,
          pendingApprovals: approvals.length,
          recentQuotes: quotes.slice(0, 5),
        });
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
        <Link to="/quotes/new" className="btn btn-primary flex items-center space-x-2">
          <Plus className="w-5 h-5" />
          <span>New Quote</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Quotes</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalQuotes}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {formatCurrency(stats.totalRevenue)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Approvals</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.pendingApprovals}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">--</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Quotes */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Quotes</h2>
          <Link
            to="/quotes"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center space-x-1"
          >
            <span>View all</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {stats.recentQuotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No quotes yet</p>
            <Link to="/quotes/new" className="text-blue-600 hover:underline mt-2 inline-block">
              Create your first quote
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="table-header py-3 px-4">Quote #</th>
                  <th className="table-header py-3 px-4">Customer</th>
                  <th className="table-header py-3 px-4">Total</th>
                  <th className="table-header py-3 px-4">Status</th>
                  <th className="table-header py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentQuotes.map((quote: any) => (
                  <tr key={quote.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <Link
                        to={`/quotes/${quote.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {quote.quote_number}
                      </Link>
                    </td>
                    <td className="py-3 px-4">{quote.customer?.company_name || '-'}</td>
                    <td className="py-3 px-4 font-medium">{formatCurrency(quote.total || 0)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                          quote.status
                        )}`}
                      >
                        {quote.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(quote.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
