import React, { useState } from 'react';

const defaultError = '';

function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(defaultError);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    setLoading(true);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'אירעה שגיאה, נסה שוב');
        return;
      }
      if (data.user) {
        onAuthenticated(data.user);
      } else {
        setError('תגובת שרת לא תקינה. עצור והפעל מחדש את npm run dev.');
      }
    } catch {
      setError('לא ניתן להתחבר לשרת. ודא שהשרת רץ (פורט 5000).');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">StockView</h1>
        <p className="auth-subtitle">ניהול תיק השקעות — היכנסו או הירשמו</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            הרשמה
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            התחברות
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label">
            אימייל
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </label>
          <label className="auth-label">
            סיסמה {mode === 'register' && <span className="auth-hint">(מינ׳ 8 תווים)</span>}
            <input
              className="auth-input"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'מעבד…' : mode === 'register' ? 'צור חשבון' : 'התחבר'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthView;
