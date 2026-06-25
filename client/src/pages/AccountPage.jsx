import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';

export default function AccountPage() {
  const { user } = useAuth();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleChangePin(e) {
    e.preventDefault();
    setMsg(''); setError('');
    if (!/^\d{4}$/.test(newPin)) return setError('New PIN must be exactly 4 digits.');
    if (newPin !== confirmPin) return setError('PINs do not match.');

    setLoading(true);
    try {
      // Verify current PIN by attempting login
      await api.login(user.name, currentPin);
      await api.updateEmployee(user.id, { pin: newPin });
      setMsg('PIN updated successfully.');
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const initials = user?.name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <div className="page-header">
        <div className="page-title">My Account</div>
        <div className="page-subtitle">Manage your profile and PIN</div>
      </div>
      <div className="page-body">
        <div className="card account-card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="account-avatar">{initials}</div>
            <div className="account-name">{user?.name}</div>
            <div className="account-role">
              {user?.role === 'manager' ? '🏷 Manager' : '👷 Team Member'}
            </div>
          </div>
        </div>

        <div className="card account-card">
          <div className="card-header">
            <div className="card-title">Change PIN</div>
          </div>
          <div className="card-body">
            {msg && <div className="alert alert-success">{msg}</div>}
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleChangePin}>
              <div className="field">
                <label>Current PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="pin-input"
                  placeholder="• • • •"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                />
              </div>
              <div className="field">
                <label>New PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="pin-input"
                  placeholder="• • • •"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                />
              </div>
              <div className="field">
                <label>Confirm New PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="pin-input"
                  placeholder="• • • •"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving…' : 'Update PIN'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
