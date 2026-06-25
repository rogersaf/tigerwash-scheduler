import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';

export default function Login() {
  const [mode, setMode] = useState('signin');
  const [allNames, setAllNames] = useState([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.allNames().then(setAllNames).catch(() => {});
  }, []);

  function switchMode(m) {
    setMode(m);
    setError('');
    setPin('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name) return setError('Select your name.');
    if (!/^\d{4}$/.test(pin)) return setError('PIN must be exactly 4 digits.');

    setLoading(true);
    try {
      const data = mode === 'signin'
        ? await api.login(name, pin)
        : await api.createAccount(name, pin);
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      // If account already exists, flip to sign-in automatically
      if (err.message.includes('already exists')) {
        setMode('signin');
        setError('Account found — enter your PIN to sign in.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-icon">🐯</span>
          <div className="brand-name">Staff Scheduling</div>
          <div className="brand-loc">Tiger Wash</div>
        </div>

        <div className="auth-toggle">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')}>
            Sign In
          </button>
          <button className={mode === 'create' ? 'active' : ''} onClick={() => switchMode('create')}>
            Create Account
          </button>
        </div>

        {error && (
          <div className={`alert ${error.includes('found') ? 'alert-info' : 'alert-error'}`}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Your Name</label>
            <select value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">Select your name…</option>
              {allNames.map((emp) => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>{mode === 'create' ? 'Choose a 4-Digit PIN' : 'PIN'}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              className="pin-input"
              placeholder="• • • •"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            />
          </div>

          {mode === 'create' && (
            <p className="text-sm text-muted" style={{ marginBottom: 14, marginTop: -6 }}>
              First time only. Your PIN is how you sign in going forward.
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'create' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {mode === 'signin' && (
          <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 16 }}>
            Forgot your PIN? Ask your manager.
          </p>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-light)' }}>
          <a href="/terms" style={{ color: 'inherit' }}>Terms of Use</a>
          {' · '}
          <a href="/privacy" style={{ color: 'inherit' }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
