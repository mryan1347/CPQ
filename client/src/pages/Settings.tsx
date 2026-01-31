import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Cloud, RefreshCw, Check, X, AlertCircle } from 'lucide-react';

interface HubSpotStatus {
  enabled: boolean;
  connected: boolean;
  error?: string;
}

interface SyncLog {
  id: string;
  entity_type: string;
  entity_id: string;
  hubspot_id?: string;
  action: string;
  status: string;
  error_message?: string;
  created_at: string;
}

export default function Settings() {
  const { user } = useAuth();
  const [hubspotStatus, setHubspotStatus] = useState<HubSpotStatus | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    fetchHubSpotStatus();
    if (isAdmin) {
      fetchSyncHistory();
    }
  }, [isAdmin]);

  const fetchHubSpotStatus = async () => {
    try {
      const response = await api.get('/hubspot/status');
      setHubspotStatus(response.data.data);
    } catch (error) {
      console.error('Failed to fetch HubSpot status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSyncHistory = async () => {
    try {
      const response = await api.get('/hubspot/sync-history?limit=20');
      setSyncHistory(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch sync history:', error);
    }
  };

  const handleSync = async (type: 'companies' | 'products') => {
    setSyncLoading(type);
    try {
      await api.post(`/hubspot/sync/${type}`);
      fetchSyncHistory();
      alert(`${type} synced successfully!`);
    } catch (error: any) {
      alert(error.response?.data?.error || `Failed to sync ${type}`);
    } finally {
      setSyncLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* HubSpot Integration */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-6">
          <Cloud className="w-6 h-6 text-orange-500" />
          <h2 className="text-lg font-semibold text-gray-900">HubSpot Integration</h2>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Connection Status</p>
              <p className="text-sm text-gray-500">
                {hubspotStatus?.enabled
                  ? hubspotStatus?.connected
                    ? 'Connected to HubSpot'
                    : 'Connection error'
                  : 'Not configured'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {hubspotStatus?.enabled ? (
                hubspotStatus?.connected ? (
                  <span className="flex items-center text-green-600">
                    <Check className="w-5 h-5 mr-1" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center text-red-600">
                    <X className="w-5 h-5 mr-1" />
                    Error
                  </span>
                )
              ) : (
                <span className="flex items-center text-gray-500">
                  <AlertCircle className="w-5 h-5 mr-1" />
                  Not Configured
                </span>
              )}
            </div>
          </div>

          {hubspotStatus?.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{hubspotStatus.error}</p>
            </div>
          )}

          {!hubspotStatus?.enabled && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="font-medium text-yellow-800">Configuration Required</p>
              <p className="text-sm text-yellow-700 mt-1">
                To enable HubSpot integration, add your HubSpot Private App access token to the
                .env file:
              </p>
              <code className="block mt-2 p-2 bg-yellow-100 rounded text-sm">
                HUBSPOT_ACCESS_TOKEN=your-access-token
              </code>
            </div>
          )}

          {/* Sync Actions */}
          {hubspotStatus?.connected && isAdmin && (
            <div className="space-y-3">
              <p className="font-medium text-gray-900">Manual Sync</p>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => handleSync('companies')}
                  disabled={syncLoading === 'companies'}
                  className="btn btn-secondary flex items-center space-x-2"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${syncLoading === 'companies' ? 'animate-spin' : ''}`}
                  />
                  <span>Sync Companies from HubSpot</span>
                </button>

                <button
                  onClick={() => handleSync('products')}
                  disabled={syncLoading === 'products'}
                  className="btn btn-secondary flex items-center space-x-2"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${syncLoading === 'products' ? 'animate-spin' : ''}`}
                  />
                  <span>Sync Products to HubSpot</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sync History */}
      {isAdmin && syncHistory.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sync History</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="table-header py-2 px-3">Time</th>
                  <th className="table-header py-2 px-3">Type</th>
                  <th className="table-header py-2 px-3">Action</th>
                  <th className="table-header py-2 px-3">Status</th>
                  <th className="table-header py-2 px-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.map((log) => (
                  <tr key={log.id} className="border-b">
                    <td className="py-2 px-3 text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 capitalize">{log.entity_type}</td>
                    <td className="py-2 px-3 capitalize">{log.action}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                          log.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-500">
                      {log.error_message || log.hubspot_id || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Account Settings */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">{user?.name}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full capitalize">
              {user?.role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
