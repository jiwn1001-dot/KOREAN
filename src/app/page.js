'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCountries } from '@/lib/store';
import { getAuth } from '@/lib/auth';

export default function Home() {
  const [countries, setCountries] = useState([]);
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuth(getAuth());
    getCountries()
      .then(setCountries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const categoryCards = [
    {
      href: '/history',
      icon: '📜',
      title: '역사',
      desc: '모든 국가가 공유하는 역사 기록',
      badge: '전체 공개',
      badgeClass: 'badge-teal',
    },
    {
      href: '/geography',
      icon: '🗻',
      title: '지리',
      desc: '한반도의 산, 강, 평야 정보',
      badge: '전체 공개',
      badgeClass: 'badge-teal',
    },
    {
      href: '/map',
      icon: '🗺️',
      title: '지도',
      desc: '국가별 영토 현황 지도',
      badge: '전체 공개',
      badgeClass: 'badge-teal',
    },
  ];

  return (
    <div className="fade-in">
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">
          <span className="gradient-text">모의전</span> 정보조회
        </h1>
        <p className="hero-subtitle">
          국가별 정치, 경제, 외교 정보를 한눈에 확인하세요.
          관리자가 등록한 최신 정보를 실시간으로 조회할 수 있습니다.
        </p>
        <div className="hero-actions">
          <Link href="/history" className="btn btn-primary btn-lg">
            📜 역사 보기
          </Link>
          <Link href="/map" className="btn btn-secondary btn-lg">
            🗺️ 지도 보기
          </Link>
        </div>
      </section>

      <div className="page-content">
        {/* Public Categories */}
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">
              <span className="icon">📂</span>
              공개 정보
            </h2>
          </div>
          <div className="card-grid card-grid-3">
            {categoryCards.map((cat) => (
              <Link key={cat.href} href={cat.href} style={{ textDecoration: 'none' }}>
                <div className="card country-card">
                  <div
                    className="country-icon"
                    style={{ background: 'var(--gradient-subtle)' }}
                  >
                    {cat.icon}
                  </div>
                  <div className="country-name">{cat.title}</div>
                  <div className="country-desc">{cat.desc}</div>
                  <span
                    className={`badge ${cat.badgeClass}`}
                    style={{ marginTop: '12px' }}
                  >
                    {cat.badge}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Countries */}
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">
              <span className="icon">🏛️</span>
              국가별 정보
            </h2>
            <span className="badge badge-accent">🔒 비밀번호 필요</span>
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner" />
              <span>국가 목록을 불러오는 중...</span>
            </div>
          ) : countries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏗️</div>
              <div className="empty-state-text">등록된 국가가 없습니다</div>
              <div className="empty-state-sub">관리자가 국가를 추가하면 여기에 표시됩니다</div>
            </div>
          ) : (
            <div className="card-grid card-grid-4">
              {countries.map((country) => (
                <Link
                  key={country.id}
                  href={`/country/${country.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div className="card country-card">
                    <div
                      className="country-icon"
                      style={{
                        background: country.color
                          ? `${country.color}22`
                          : 'var(--gradient-subtle)',
                        color: country.color || 'var(--accent)',
                        border: `2px solid ${country.color || 'var(--border-subtle)'}`,
                      }}
                    >
                      {country.flag_url ? (
                        <img
                          src={country.flag_url}
                          alt={country.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: 'var(--radius-md)',
                          }}
                        />
                      ) : (
                        '🏴'
                      )}
                    </div>
                    <div className="country-name">{country.name}</div>
                    <div className="country-desc">정치 · 경제 · 외교</div>
                    <span
                      className="country-color-dot"
                      style={{
                        backgroundColor: country.color,
                        marginTop: '8px',
                      }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Info */}
        <section className="section">
          <div className="card card-glass" style={{ textAlign: 'center', padding: '40px' }}>
            <h3 style={{ marginBottom: '12px' }}>ℹ️ 정보 열람 안내</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto', fontSize: '0.92rem' }}>
              역사, 지리, 지도는 누구나 열람 가능합니다.<br />
              국가별 정치·경제·사회·외교 정보는 해당 국가 비밀번호가 필요합니다.<br />
              관리자 비밀번호로 모든 정보를 관리할 수 있습니다.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
