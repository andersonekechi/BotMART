import { useState, useEffect, useCallback } from 'react';
import { productAPI } from '../services/api';
import { Plus, Edit, Trash2, Search, X, Key, Eye, EyeOff } from 'lucide-react';

const EMPTY_PRODUCT = {
  name: '', description: '', price: '', category: 'general', stock: -1,
  status: 'active', deliveryType: 'download_link', deliveryContent: '', image: '',
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);
  const [licenseModal, setLicenseModal] = useState(null);
  const [newKeys, setNewKeys] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productAPI.getAll({ page, search, limit: 20 });
      setProducts(res.data.products);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PRODUCT);
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product._id);
    setForm({
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      stock: product.stock,
      status: product.status,
      deliveryType: product.deliveryType,
      deliveryContent: product.deliveryContent || '',
      image: product.image || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) };
      if (editing) {
        await productAPI.update(editing, data);
      } else {
        await productAPI.create(data);
      }
      setModalOpen(false);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Deactivate "${name}"?`)) return;
    try {
      await productAPI.remove(id);
      fetchProducts();
    } catch (err) {
      alert('Failed to remove product');
    }
  };

  const handleAddKeys = async () => {
    if (!newKeys.trim() || !licenseModal) return;
    const keys = newKeys.split('\n').map(k => k.trim()).filter(Boolean);
    try {
      await productAPI.addLicenseKeys(licenseModal._id, keys);
      setNewKeys('');
      setLicenseModal(null);
      fetchProducts();
    } catch (err) {
      alert('Failed to add keys');
    }
  };

  return (
    <div className="products-page">
      <div className="page-actions">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="Search products..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && <button onClick={() => setSearch('')}><X size={16} /></button>}
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} /> Add Product
        </button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <Package size={48} />
          <h3>No products yet</h3>
          <p>Add your first product to get started</p>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Add Product</button>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Sold</th>
                  <th>Delivery</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <div className="product-cell">
                        {p.image && <img src={p.image} alt="" className="product-thumb" />}
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.description?.slice(0, 60)}...</small>
                        </div>
                      </div>
                    </td>
                    <td>${p.price?.toFixed(2)}</td>
                    <td>{p.stock === -1 ? '∞' : p.stock}</td>
                    <td><span className="badge badge-info">{p.category}</span></td>
                    <td>
                      <span className={`badge badge-${p.status === 'active' ? 'delivered' : 'cancelled'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>{p.totalSold || 0}</td>
                    <td>
                      {p.deliveryType === 'license_key' ? (
                        <button className="btn-icon" title="Manage license keys" onClick={() => setLicenseModal(p)}>
                          <Key size={16} />
                          <span className="key-count">
                            {p.licenseKeys?.filter(k => !k.used).length || 0}
                          </span>
                        </button>
                      ) : (
                        <span className="text-muted">Link</span>
                      )}
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(p)}>
                          <Edit size={16} />
                        </button>
                        <button className="btn-icon btn-danger" title="Remove" onClick={() => handleDelete(p._id, p.name)}>
                          <Trash2 size={16} />
                        </button>
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

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Price *</label>
                  <input required type="number" step="0.01" min="0" value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea required rows={3} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Stock (-1 = unlimited)</label>
                  <input type="number" value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Delivery Type</label>
                  <select value={form.deliveryType} onChange={(e) => setForm({ ...form, deliveryType: e.target.value })}>
                    <option value="download_link">Download Link</option>
                    <option value="license_key">License Key</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Image URL</label>
                <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="https://example.com/image.png" />
              </div>
              {form.deliveryType === 'download_link' && (
                <div className="form-group">
                  <label>Download Link</label>
                  <input value={form.deliveryContent}
                    onChange={(e) => setForm({ ...form, deliveryContent: e.target.value })}
                    placeholder="https://example.com/download/file.zip" />
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {licenseModal && (
        <div className="modal-overlay" onClick={() => setLicenseModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>License Keys — {licenseModal.name}</h2>
              <button onClick={() => setLicenseModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="key-stats">
                <span>Total: {licenseModal.licenseKeys?.length || 0}</span>
                <span>Available: {licenseModal.licenseKeys?.filter(k => !k.used).length || 0}</span>
                <span>Used: {licenseModal.licenseKeys?.filter(k => k.used).length || 0}</span>
              </div>
              <div className="form-group">
                <label>Add New Keys (one per line)</label>
                <textarea rows={5} value={newKeys} onChange={(e) => setNewKeys(e.target.value)}
                  placeholder="KEY-XXXX-1111&#10;KEY-XXXX-2222&#10;KEY-XXXX-3333" />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setLicenseModal(null)}>Close</button>
                <button className="btn btn-primary" onClick={handleAddKeys} disabled={!newKeys.trim()}>
                  Add Keys
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
