'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAuth, logout } from '@/lib/auth';
import LoginModal from './LoginModal';

export default function Navbar() {
  const pathname = usePathname();
  const [auth, setAuth] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginType, setLoginType] = useState('admin');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setAuth(getAuth());
  }, []);

  const refreshAuth = () => {
    setAuth(getAuth());
  };

  const handleLogout = () => {
    logout();
    setAuth(null);
    window.location.reload();
  };

  const openLogin = (type) => {
    setLoginType(type);
    setShowLogin(true);
    setMobileOpen(false);
  };

  const navLinks = [
    { href: '/', label: '홈', icon: '🏠' },
    { href: '/history', label: '역사', icon: '📜' },
    { href: '/geography', label: '지리', icon: '🗻' },
    { href: '/map', label: '지도', icon: '🗺️' },
  ];

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link href="/" className="navbar-brand">
            <span className="logo-icon">⚔️</span>
            <span>모의전</span>
          </Link>

          <button
            className="navbar-mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? '✕' : '☰'}
          </button>

          <ul className={`navbar-nav ${mobileOpen ? 'mobile-open' : ''}`}>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={pathname === link.href ? 'active' : ''}
                  onClick={() => setMobileOpen(false)}
                >
                  <span>{link.icon}</span>
                  {link.label}
                </Link>
              </li>
            ))}

            {auth?.role === 'admin' && (
              <li>
                <Link
                  href="/admin"
                  className={pathname.startsWith('/admin') ? 'active' : ''}
                  onClick={() => setMobileOpen(false)}
                >
                  <span>⚙️</span>
                  관리자
                </Link>
              </li>
            )}

            {!auth && (
              <>
                <li>
                  <button onClick={() => openLogin('country')}>
                    <span>🔑</span>
                    국가 로그인
                  </button>
                </li>
                <li>
                  <button
                    className="nav-admin-btn"
                    onClick={() => openLogin('admin')}
                  >
                    <span>🛡️</span>
                    관리자
                  </button>
                </li>
              </>
            )}

            {auth && (
              <li>
                <button onClick={handleLogout}>
                  <span>🚪</span>
                  {auth.role === 'admin'
                    ? '관리자 로그아웃'
                    : `${auth.countryName || '국가'} 로그아웃`}
                </button>
              </li>
            )}
          </ul>
        </div>
      </nav>

      {showLogin && (
        <LoginModal
          type={loginType}
          onClose={() => setShowLogin(false)}
          onSuccess={() => {
            setShowLogin(false);
            refreshAuth();
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
