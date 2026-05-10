import React, { useState } from 'react';
import { apiUrl, getApiBase } from '../apiBase';

const defaultError = '';

function vercelMissingApiHint() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname || '';
  const noBase = !getApiBase();
  if (noBase && (host.endsWith('vercel.app') || host.includes('vercel')))
    return ' חסרה כתובת השרת: ב-Vercel הוסף משתנה REACT_APP_API_URL (כתובת ה-API) ועשה Redeploy.';
  return '';
}

function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(defaultError);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const url = apiUrl(mode === 'register' ? '/api/auth/register' : '/api/auth/login');
    setLoading(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const ct = res.headers.get('content-type') || '';
      const data =
        ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
      if (!res.ok) {
        if (res.status === 404 && !ct.includes('json')) {
          setError(
            'לא נמצא שרת API בכתובת הזו. אם האתר על Vercel, הגדר REACT_APP_API_URL בפרויקט והרץ Deploy מחדש.'
          );
          return;
        }
        setError(data.error || 'אירעה שגיאה, נסה שוב');
        return;
      }
      if (data.user) {
        onAuthenticated(data.user);
      } else {
        setError('תגובת שרת לא תקינה. נסה שוב או בדוק הגדרות API.' + vercelMissingApiHint());
      }
    } catch {
      setError(
        'לא ניתן להתחבר לשרת. בפיתוח מקומי ודא שהשרת רץ על פורט 5000.' +
          vercelMissingApiHint()
      );
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
