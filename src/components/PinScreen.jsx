import React, { useState, useEffect } from 'react';
import { Delete } from 'lucide-react';

// ── SHA-256 hash of a PIN using Web Crypto API ─────────────────────────────
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(pin));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── PIN Numpad Screen ──────────────────────────────────────────────────────
export function PinScreen({ username, onSuccess, onBack, appTitle = 'A.C.T' }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const MAX_ATTEMPTS = 3;
  const LOCKOUT_SECONDS = 30;

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        setTimeLeft(0);
        setError('');
      } else {
        setTimeLeft(remaining);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  const handleDigit = (digit) => {
    if (isLocked || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === 4) {
      // Auto-submit when 4 digits entered
      setTimeout(() => submitPin(next), 120);
    }
  };

  const handleDelete = () => {
    if (isLocked) return;
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const submitPin = async (submittedPin) => {
    const result = await onSuccess(submittedPin);
    if (!result.ok) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin('');
      if (newAttempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setError(`Too many attempts. Try again in ${LOCKOUT_SECONDS}s.`);
      } else {
        setError(result.message || `Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} left.`);
      }
    }
  };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'var(--bg, #f8fafc)', padding:'24px',
    }}>
      <div style={{
        background:'var(--surface, #fff)', borderRadius:'20px', padding:'32px 28px',
        width:'100%', maxWidth:'340px', boxShadow:'0 4px 24px rgba(0,0,0,0.10)',
        textAlign:'center',
      }}>
        <img src="/act-logo-login.png" alt="ACT" style={{height:'52px', marginBottom:'8px'}} />
        <h2 style={{margin:'0 0 4px', fontSize:'20px', fontWeight:800, color:'var(--text-primary,#1a1a2e)'}}>
          Enter PIN
        </h2>
        <p style={{margin:'0 0 24px', fontSize:'13px', color:'var(--text-secondary,#6b7280)'}}>
          {username}
        </p>

        {/* PIN dots */}
        <div style={{display:'flex', gap:'16px', justifyContent:'center', marginBottom:'28px'}}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:'16px', height:'16px', borderRadius:'50%',
              background: pin.length > i ? 'var(--accent,#6366f1)' : 'transparent',
              border: `2px solid ${pin.length > i ? 'var(--accent,#6366f1)' : '#d1d5db'}`,
              transition: 'all 0.15s',
            }} />
          ))}
        </div>

        {/* Error / lockout */}
        {(error || isLocked) && (
          <div style={{
            background:'#fee2e2', color:'#dc2626', borderRadius:'10px',
            padding:'10px 14px', marginBottom:'20px', fontSize:'13px', fontWeight:500,
          }}>
            {isLocked ? `Locked. Try again in ${timeLeft}s.` : error}
          </div>
        )}

        {/* Numpad */}
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'12px',
          opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? 'none' : 'auto',
        }}>
          {digits.map((d, i) => {
            if (d === '') return <div key={i} />;
            const isDelete = d === '⌫';
            return (
              <button key={i}
                onClick={() => isDelete ? handleDelete() : handleDigit(d)}
                style={{
                  height:'60px', borderRadius:'14px', border:'none', cursor:'pointer',
                  fontSize: isDelete ? '20px' : '22px', fontWeight:600,
                  background: isDelete ? 'transparent' : 'var(--surface-alt,#f3f4f6)',
                  color: isDelete ? '#6b7280' : 'var(--text-primary,#1a1a2e)',
                  transition:'background 0.1s',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}
                onMouseDown={e => e.currentTarget.style.background = isDelete ? '#f3f4f6' : '#e0e7ff'}
                onMouseUp={e => e.currentTarget.style.background = isDelete ? 'transparent' : 'var(--surface-alt,#f3f4f6)'}
              >
                {isDelete ? <Delete size={20} /> : d}
              </button>
            );
          })}
        </div>

        {onBack && (
          <button onClick={onBack} style={{
            marginTop:'24px', background:'none', border:'none', color:'var(--text-secondary,#6b7280)',
            fontSize:'13px', cursor:'pointer', textDecoration:'underline',
          }}>
            ← Back to login
          </button>
        )}
      </div>
    </div>
  );
}
