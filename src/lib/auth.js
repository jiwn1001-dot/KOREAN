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

export function isSubAdmin() {
  const auth = getAuth();
  return auth?.role === 'sub_admin';
}

export function isAdminOrSub() {
  return isAdmin() || isSubAdmin();
}

export function getCountryAccess() {
  const auth = getAuth();
  if (isAdminOrSub()) return 'all';
  return auth?.assignedCountryId || null;
}

export function canAccessCountry(countryId) {
  const auth = getAuth();
  if (!auth) return false;
  if (isAdminOrSub()) return true;
  return auth.assignedCountryId === countryId;
}

export async function loginWithCredentials(username, password) {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success && data.user) {
      setAuth(data.user);
      return { success: true, user: data.user };
    }
    return { success: false, error: data.error };
  } catch (err) {
    return { success: false, error: '서버 연결 오류' };
  }
}

export async function register(username, password) {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success && data.user) {
      setAuth(data.user);
      return { success: true, user: data.user };
    }
    return { success: false, error: data.error };
  } catch (err) {
    return { success: false, error: '서버 연결 오류' };
  }
}

export function logout() {
  clearAuth();
}
