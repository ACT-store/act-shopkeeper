import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import dataService from '../services/dataService';
import { PinScreen } from './PinScreen';
import './Login.css';

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@act-store.app`;
}

function Login({ onLoginSuccess }) {
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  // ── PIN step state ──────────────────────────────────────────────────────
  const [pendingUser, setPendingUser]   = useState(null); // user object after password OK
  const [showPin, setShowPin]           = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername) {
      setError('Please enter your username.');
      setLoading(false);
      return;
    }

    const hiddenEmail = usernameToEmail(trimmedUsername);
    const result = await dataService.login(hiddenEmail, password);

    if (result.success) {
      localStorage.setItem('user_username', trimmedUsername);
      localStorage.setItem('user_email', hiddenEmail);
      // ── Proceed to PIN step ──
      setPendingUser(result.user);
      setShowPin(true);
    } else {
      let msg = result.error || 'Login failed. Please try again.';
      if (
        msg.toLowerCase().includes('email') ||
        msg.toLowerCase().includes('user not found') ||
        msg.toLowerCase().includes('no account')
      ) {
        msg = 'No account found for this username.';
      }
      setError(msg);
    }

    setLoading(false);
  };

  // Called by PinScreen with the entered PIN — returns { ok, message }
  const handlePinVerify = async (pin) => {
    const result = await dataService.verifyPin(pendingUser.userId || pendingUser.uid, pin);
    if (result.ok) {
      onLoginSuccess(pendingUser);
    }
    return result;
  };

  if (showPin && pendingUser) {
    return (
      <PinScreen
        username={username}
        appTitle="Shopkeeper"
        onSuccess={handlePinVerify}
        onBack={() => { setShowPin(false); setPendingUser(null); setPassword(''); }}
      />
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <img src="/act-logo-login.png" alt="ACT Store Logo" className="login-logo" />
          <h1 className="app-title">A.C.T</h1>
          <h2 className="app-subtitle">Shopkeeper</h2>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="login-input"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
            />
          </div>
          <div className="input-group password-group">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="login-input password-input"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
