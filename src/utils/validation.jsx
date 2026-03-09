import React, { useState, useCallback, useRef, useEffect } from 'react';

export function useValidation() {
  const [fieldErrors, setFieldErrors] = useState({});
  const timersRef = useRef({});

  const setFieldError = useCallback((field, message) => {
    setFieldErrors(prev => ({ ...prev, [field]: message }));
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    timersRef.current[field] = setTimeout(() => {
      setFieldErrors(prev => { const copy = { ...prev }; delete copy[field]; return copy; });
    }, 6000);
  }, []);

  const clearFieldError = useCallback((field) => {
    setFieldErrors(prev => { const copy = { ...prev }; delete copy[field]; return copy; });
    if (timersRef.current[field]) { clearTimeout(timersRef.current[field]); delete timersRef.current[field]; }
  }, []);

  const clearAll = useCallback(() => {
    setFieldErrors({});
    Object.values(timersRef.current).forEach(t => clearTimeout(t));
    timersRef.current = {};
  }, []);

  const showError = useCallback((field, message) => {
    setFieldError(field, message);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-field="${field}"]`) || document.querySelector(`[name="${field}"]`) || document.getElementById(field);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof el.focus === 'function' && el.tagName !== 'DIV') el.focus();
      }
    });
    return true;
  }, [setFieldError]);

  useEffect(() => { return () => { Object.values(timersRef.current).forEach(t => clearTimeout(t)); }; }, []);

  return { fieldErrors, setFieldError, clearFieldError, clearAll, showError };
}

export function ValidationNote({ field, errors, style }) {
  const msg = errors?.[field];
  if (!msg) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      marginTop: '4px', padding: '6px 10px',
      background: '#fffbeb', border: '1px solid #f59e0b',
      borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#92400e',
      animation: 'validationSlideIn 0.2s ease', ...style,
    }}>
      <span style={{ fontSize: '14px', lineHeight: 1 }}>⚠</span>
      <span>{msg}</span>
    </div>
  );
}

export function errorBorder(field, errors) {
  if (!errors?.[field]) return {};
  return { borderColor: '#f59e0b', boxShadow: '0 0 0 2px rgba(245,158,11,0.2)' };
}

export function errorClass(field, errors) {
  return errors?.[field] ? ' validation-error' : '';
}
