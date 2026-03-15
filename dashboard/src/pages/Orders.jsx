import { useState, useEffect, useCallback } from 'react';
import { orderAPI } from '../services/api';
import { Search, X, Eye, ShoppingCart } from 'lucide-react';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await orderAPI.getAll({ page, search, status: statusFilter, limit: 20 });
      setOrders(res.data.orders);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await orderAPI.updateStatus(orderId, newStatus);
      fetchOrders();
      if (selectedOrder?._id === orderId) {
        const res = await orderAPI.getOne(orderId);
        setSelectedOrder(res.data);
      }
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const viewOrder = async (id) => {
    try {
      const res = await orderAPI.getOne(id);
      setSelectedOrder(res.data);
    } catch (err) {
      alert('Failed to load order');
    }
  };

  const statusColors = {
    pending: '#f59e0b',
    paid: '#3b82f6',
    delivered: '#10b981',
    cancelled: '#ef4444',
    refunded: '#8b5cf6',
  };

  return (
    <div className="orders-page">
      <div className="page-actions">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && <button onClick={() => setSearch('')}><X size={16} /></button>}
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <ShoppingCart size={48} />
          <h3>No orders found</h3>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>User</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id}>
                    <td><code>{order.orderNumber}</code></td>
                    <td>@{order.telegramUsername || order.telegramUserId}</td>
                    <td>{order.items?.length || 0} item(s)</td>
                    <td><strong>${order.totalAmount?.toFixed(2)}</strong></td>
                    <td><span className="badge badge-info">{order.paymentMethod}</span></td>
                    <td>
                      <span className="badge" style={{ background: `${statusColors[order.status]}20`, color: statusColors[order.status] }}>
                        {order.status}
                      </span>
                    </td>
                    <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-icon" title="View" onClick={() => viewOrder(order._id)}>
                          <Eye size={16} />
                        </button>
                        {order.status === 'pending' && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => handleStatusChange(order._id, 'paid')}>
                              Confirm
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleStatusChange(order._id, 'cancelled')}>
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {Math.ceil(total / 20)}</span>
              <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Order {selectedOrder.orderNumber}</h2>
              <button onClick={() => setSelectedOrder(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="order-detail-grid">
                <div>
                  <h4>Customer</h4>
                  <p>Telegram ID: {selectedOrder.telegramUserId}</p>
                  <p>Username: @{selectedOrder.telegramUsername || 'N/A'}</p>
                </div>
                <div>
                  <h4>Payment</h4>
                  <p>Method: {selectedOrder.paymentMethod}</p>
                  <p>Total: <strong>${selectedOrder.totalAmount?.toFixed(2)}</strong></p>
                  {selectedOrder.paymentId && <p>Payment ID: {selectedOrder.paymentId}</p>}
                </div>
                <div>
                  <h4>Status</h4>
                  <span className="badge" style={{ background: `${statusColors[selectedOrder.status]}20`, color: statusColors[selectedOrder.status] }}>
                    {selectedOrder.status}
                  </span>
                  <p>Created: {new Date(selectedOrder.createdAt).toLocaleString()}</p>
                  {selectedOrder.deliveredAt && <p>Delivered: {new Date(selectedOrder.deliveredAt).toLocaleString()}</p>}
                </div>
              </div>

              <h4>Items</h4>
              <table className="table">
                <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {selectedOrder.items?.map((item, i) => (
                    <tr key={i}>
                      <td>{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>${item.price?.toFixed(2)}</td>
                      <td>${(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedOrder.deliveryDetails?.length > 0 && (
                <>
                  <h4>Delivery Details</h4>
                  {selectedOrder.deliveryDetails.map((d, i) => (
                    <div key={i} className="delivery-detail">
                      <strong>{d.productName}</strong>
                      <span className="badge badge-info">{d.type}</span>
                      <code>{d.content}</code>
                    </div>
                  ))}
                </>
              )}

              {selectedOrder.status === 'pending' && (
                <div className="modal-footer">
                  <button className="btn btn-success" onClick={() => { handleStatusChange(selectedOrder._id, 'paid'); }}>
                    Confirm Payment & Deliver
                  </button>
                  <button className="btn btn-danger" onClick={() => { handleStatusChange(selectedOrder._id, 'cancelled'); setSelectedOrder(null); }}>
                    Cancel Order
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
