import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orderAPI } from '../services/api';
import {
  DollarSign, ShoppingCart, TrendingUp, Package, ArrowUpRight, Clock
} from 'lucide-react';

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orderAPI.getAnalytics()
      .then((res) => setAnalytics(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!analytics) return <div className="empty">Failed to load analytics</div>;

  const statCards = [
    {
      label: 'Total Revenue',
      value: `$${analytics.totalRevenue?.toFixed(2) || '0.00'}`,
      icon: DollarSign,
      color: '#10b981',
    },
    {
      label: 'Total Orders',
      value: analytics.totalOrders || 0,
      icon: ShoppingCart,
      color: '#6366f1',
    },
    {
      label: 'Conversion Rate',
      value: `${analytics.conversionRate || 0}%`,
      icon: TrendingUp,
      color: '#f59e0b',
    },
    {
      label: 'Pending Orders',
      value: analytics.pendingOrders || 0,
      icon: Clock,
      color: '#ef4444',
    },
  ];

  return (
    <div className="dashboard-page">
      <div className="stat-grid">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${card.color}15`, color: card.color }}>
              <card.icon size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">{card.label}</span>
              <span className="stat-value">{card.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3>Top Products</h3>
            <Link to="/analytics" className="link-icon"><ArrowUpRight size={18} /></Link>
          </div>
          <div className="card-body">
            {analytics.topProducts?.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topProducts.map((p, i) => (
                    <tr key={i}>
                      <td>{p._id}</td>
                      <td>{p.sold}</td>
                      <td>${p.revenue?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-text">No sales data yet</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Recent Orders</h3>
            <Link to="/orders" className="link-icon"><ArrowUpRight size={18} /></Link>
          </div>
          <div className="card-body">
            {analytics.recentOrders?.length > 0 ? (
              <div className="recent-orders-list">
                {analytics.recentOrders.map((order) => (
                  <div key={order._id} className="recent-order-item">
                    <div>
                      <span className="order-number">{order.orderNumber}</span>
                      <span className="order-user">@{order.telegramUsername || 'N/A'}</span>
                    </div>
                    <div>
                      <span className={`badge badge-${order.status}`}>{order.status}</span>
                      <span className="order-amount">${order.totalAmount?.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">No orders yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
