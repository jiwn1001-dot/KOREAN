'use client';

const AUTH_KEY = 'mockwar_auth';

export function getAuth() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(data) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

export function clearAuth() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_KEY);
}

export function isAdmin() {
  const auth = getAuth();
  return auth?.role === 'admin';
}

export function getCountryAccess() {
  const auth = getAuth();
  if (auth?.role === 'admin') return 'all';
  if (auth?.role === 'country') return auth.countryId;
  return null;
}

export function canAccessCountry(countryId) {
  const auth = getAuth();
  if (!auth) return false;
  if (auth.role === 'admin') return true;
  return auth.role === 'country' && auth.countryId === countryId;
}

export async function loginAsAdmin(password) {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'admin', password }),
    });
    const data = await res.json();
    if (data.success) {
      setAuth({ role: 'admin' });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function loginAsCountry(countryId, password) {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'country', countryId, password }),
    });
    const data = await res.json();
    if (data.success) {
      setAuth({ role: 'country', countryId, countryName: data.countryName });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function logout() {
  clearAuth();
}
