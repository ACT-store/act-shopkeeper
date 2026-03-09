import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import dataService from '../services/dataService';
import './Login.css';

/**
 * Converts a username into the hidden Firebase Auth email.
 * Must match exactly what the Admin app constructs in authService.js.
 * e.g. "maria_santos" → "maria_santos@act.app"
 */
function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@act.app`;
}

function Login({ onLoginSuccess }) {
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

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
      onLoginSuccess(result.user);
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

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <img src="/act-logo-login.png" alt="ACT Store Logo" className="login-logo" />
          <h1 className="app-title">A.C.T Shop</h1>
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
