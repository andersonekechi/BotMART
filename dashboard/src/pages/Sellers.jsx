import { useState, useEffect, useCallback } from 'react';
import { Search, X, Store, CheckCircle, XCircle, Ban } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchSellers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API_BASE}/sellers?${params}`, { headers });
      const data = await res.json();
      setSellers(data.sellers || []);
      setTotal(data.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchSellers(); }, [fetchSellers]);

  const updateStatus = async (id, status) => {
    try {
      await fetch(`${API_BASE}/sellers/${id}/status`, { method: 'PUT', headers, body: JSON.stringify({ status }) });
      fetchSellers();
    } catch (err) { alert('Failed'); }
  };

  const statusColors = { pending: '#f59e0b', approved: '#10b981', suspended: '#ef4444', rejected: '#6b7280' };

  return (
    <div className="sellers-page">
      <div className="page-actions">
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : sellers.length === 0 ? (
        <div className="empty-state">
          <Store size={48} />
          <h3>No sellers found</h3>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Username</th>
                <th>Products</th>
                <th>Revenue</th>
                <th>Sales</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div>
                      <strong>{s.storeName}</strong>
                      <br />
                      <small style={{ color: '#64748b' }}>{s.storeDescription?.slice(0, 50)}</small>
                    </div>
                  </td>
                  <td>@{s.username || 'N/A'}</td>
                  <td>{s.productCount}</td>
                  <td>${s.totalRevenue?.toFixed(2)}</td>
                  <td>{s.totalSales}</td>
                  <td>
                    <span className="badge" style={{ background: `${statusColors[s.status]}20`, color: statusColors[s.status] }}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-btns">
                      {s.status === 'pending' && (
                        <>
                          <button className="btn btn-sm btn-success" onClick={() => updateStatus(s._id, 'approved')}>
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => updateStatus(s._id, 'rejected')}>
                            <XCircle size={14} />
                          </button>
                        </>
                      )}
                      {s.status === 'approved' && (
                        <button className="btn btn-sm btn-danger" onClick={() => updateStatus(s._id, 'suspended')}>
                          <Ban size={14} /> Suspend
                        </button>
                      )}
                      {s.status === 'suspended' && (
                        <button className="btn btn-sm btn-success" onClick={() => updateStatus(s._id, 'approved')}>
                          <CheckCircle size={14} /> Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
