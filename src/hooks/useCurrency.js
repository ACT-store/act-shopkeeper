import { useState, useEffect } from 'react';
import dataService from '../services/dataService';

/**
 * Returns the current currency symbol (e.g. '$', '£', 'GH₵').
 * Reads synchronously from localStorage first (instant), then
 * verifies against dataService settings (async, handles first load).
 */
export function useCurrency() {
  const [symbol, setSymbol] = useState(() => dataService.getCurrencySymbol());

  useEffect(() => {
    dataService.getSettings().then(s => {
      const cur = s.currency || '$';
      setSymbol(cur);
      localStorage.setItem('ks_currency', cur);
    });
  }, []);

  // fmt: format a number with the currency symbol
  const fmt = (amount) => `${symbol}${Number(amount || 0).toFixed(2)}`;

  return { symbol, fmt };
}
