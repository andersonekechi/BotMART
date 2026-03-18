import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Lock, User } from 'lucide-react';

export default function Settings() {
  const { admin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match');
    }
    if (newPassword.length < 6) {
      return setError('Password must be at least 6 characters');
    }

    setLoading(true);
    try {
      await authAPI.changePassword({ currentPassword, newPassword });
      setMessage('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="card settings-card">
        <div className="card-header">
          <User size={20} />
          <h3>Account Info</h3>
        </div>
        <div className="card-body">
          <div className="info-row">
            <span className="info-label">Username</span>
            <span className="info-value">{admin?.username}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Role</span>
            <span className="info-value badge badge-info">{admin?.role}</span>
          </div>
        </div>
      </div>

      <div className="card settings-card">
        <div className="card-header">
          <Lock size={20} />
          <h3>Change Password</h3>
        </div>
        <div className="card-body">
          {message && <div className="alert alert-success">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current Password</label>
              <input type="password" value={currentPassword} required
                onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={newPassword} required minLength={6}
                onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" value={confirmPassword} required minLength={6}
                onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
