import { useState, useEffect } from 'react';
import { orderAPI } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import { DollarSign, ShoppingCart, TrendingUp, Users } from 'lucide-react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function Analytics() {
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

  const paymentData = analytics.paymentMethods?.map((pm) => ({
    name: pm._id === 'stripe' ? 'Stripe' : 'Crypto',
    value: pm.revenue,
    count: pm.count,
  })) || [];

  return (
    <div className="analytics-page">
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#10b98115', color: '#10b981' }}>
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Revenue</span>
            <span className="stat-value">${analytics.totalRevenue?.toFixed(2)}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#6366f115', color: '#6366f1' }}>
            <ShoppingCart size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Paid Orders</span>
            <span className="stat-value">{analytics.paidOrders}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f59e0b15', color: '#f59e0b' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Conversion</span>
            <span className="stat-value">{analytics.conversionRate}%</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ef444415', color: '#ef4444' }}>
            <Users size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Cancelled</span>
            <span className="stat-value">{analytics.cancelledOrders}</span>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <div className="card-header"><h3>Daily Revenue (Last 30 Days)</h3></div>
          <div className="card-body chart-body">
            {analytics.dailyRevenue?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="_id" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-text">No revenue data yet</p>
            )}
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header"><h3>Daily Orders</h3></div>
          <div className="card-body chart-body">
            {analytics.dailyRevenue?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="_id" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-text">No order data yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header"><h3>Top Products by Revenue</h3></div>
          <div className="card-body chart-body">
            {analytics.topProducts?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="_id" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-text">No product data yet</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Payment Methods</h3></div>
          <div className="card-body chart-body">
            {paymentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={paymentData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                    dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {paymentData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `$${v.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-text">No payment data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
