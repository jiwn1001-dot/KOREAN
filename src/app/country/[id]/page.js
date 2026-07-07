'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getCountry, getDataEntry, getAllImages } from '@/lib/store';
import { canAccessCountry, isAdmin, getAuth } from '@/lib/auth';
import LoginModal from '@/components/LoginModal';

export default function CountryPage() {
  const params = useParams();
  const countryId = params.id;

  const [country, setCountry] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [activeTab, setActiveTab] = useState('politics');
  const [data, setData] = useState({});
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    setAdmin(isAdmin());
    const access = canAccessCountry(countryId);
    setHasAccess(access);
    loadCountry();
  }, [countryId]);

  useEffect(() => {
    if (hasAccess && country) {
      loadAllData();
    }
  }, [hasAccess, country]);

  const loadCountry = async () => {
    try {
      const c = await getCountry(countryId);
      setCountry(c);
    } catch (err) {
      console.error('Failed to load country:', err);
    }
    setLoading(false);
  };

  const loadAllData = async () => {
    const categories = ['politics', 'economy', 'social', 'diplomacy'];
    const newData = {};
    const newImages = {};

    for (const cat of categories) {
      try {
        const entry = await getDataEntry(cat, countryId);
        if (entry) {
          newData[cat] = entry;
          const imgs = await getAllImages(entry.id);
          newImages[cat] = imgs;
        }
      } catch (err) {
        console.error(`Failed to load ${cat}:`, err);
      }
    }

    setData(newData);
    setImages(newImages);
  };

  const tabs = [
    { id: 'politics', label: '정치', icon: '🏛️' },
    { id: 'economy', label: '경제', icon: '💰' },
    { id: 'social', label: '사회문제', icon: '📢' },
    { id: 'diplomacy', label: '외교관계', icon: '🤝' },
  ];

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>국가 정보를 불러오는 중...</span>
      </div>
    );
  }

  if (!country) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <div className="empty-state-text">국가를 찾을 수 없습니다</div>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="page-content fade-in">
        <div className="password-gate">
          <div className="card card-glass password-gate-card" style={{ padding: '48px 32px' }}>
            <div className="password-gate-icon">🔒</div>
            <h2 className="password-gate-title">{country.name}</h2>
            <p className="password-gate-desc">
              이 국가의 정보를 열람하려면 비밀번호가 필요합니다.
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setShowLogin(true)}
              style={{ width: '100%' }}
            >
              🔑 비밀번호 입력
            </button>
          </div>
        </div>

        {showLogin && (
          <LoginModal
            type="country"
            onClose={() => setShowLogin(false)}
            onSuccess={() => {
              setShowLogin(false);
              setHasAccess(true);
              setAdmin(isAdmin());
            }}
          />
        )}
      </div>
    );
  }

  const politicsData = data.politics?.data || {};
  const economyData = data.economy?.data || {};
  const socialData = data.social?.data || {};
  const diplomacyData = data.diplomacy?.data || {};

  const partyColors = ['#7c6bf0', '#00d4c8', '#f87171', '#fbbf24', '#4ade80', '#f472b6', '#60a5fa', '#a78bfa'];

  const renderPolitics = () => (
    <div className="slide-up">
      {/* Images */}
      {images.politics?.length > 0 && (
        <div className="image-gallery" style={{ marginBottom: '24px' }}>
          {images.politics.map((img) => (
            <div key={img.id} className="image-gallery-item">
              <img src={img.url} alt={img.caption || ''} />
            </div>
          ))}
        </div>
      )}

      <div className="card-grid card-grid-2">
        {/* Government Info */}
        <div className="content-section">
          <h3 className="content-section-title">🏛️ 정부 정보</h3>
          <table className="data-table">
            <tbody>
              <tr>
                <td style={{ fontWeight: 600, width: '120px' }}>국가명</td>
                <td>{country.name}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>정부체제</td>
                <td>{politicsData.governmentType || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>정부수반</td>
                <td>{politicsData.headOfState || '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Parties */}
        <div className="content-section">
          <h3 className="content-section-title">🗳️ 정당 현황</h3>
          {politicsData.parties?.length > 0 ? (
            <>
              <div className="party-bar-container">
                <div className="party-bar">
                  {politicsData.parties.map((party, i) => {
                    const totalSeats = politicsData.parties.reduce((s, p) => s + (Number(p.seats) || 0), 0);
                    const width = totalSeats > 0 ? ((Number(party.seats) || 0) / totalSeats) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className="party-bar-segment"
                        style={{
                          width: `${width}%`,
                          backgroundColor: partyColors[i % partyColors.length],
                        }}
                        title={`${party.name}: ${party.seats}석`}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="party-list">
                {politicsData.parties.map((party, i) => (
                  <div key={i} className="party-item">
                    <span
                      className="party-color-dot"
                      style={{ backgroundColor: partyColors[i % partyColors.length] }}
                    />
                    <span className="party-name">{party.name}</span>
                    <div className="party-stats">
                      <div className="party-seats">{party.seats}석</div>
                      <div>{party.supportRate}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>등록된 정당 정보 없음</p>
          )}
        </div>
      </div>

      {/* Key Figures */}
      <div className="content-section" style={{ marginTop: '20px' }}>
        <h3 className="content-section-title">👤 주요인물</h3>
        {politicsData.keyFigures?.length > 0 ? (
          <div className="card-grid card-grid-2" style={{ gap: '12px' }}>
            {politicsData.keyFigures.map((figure, i) => (
              <div key={i} className="card figure-card">
                <div className="figure-avatar">
                  {figure.image ? (
                    <img src={figure.image} alt={figure.name} />
                  ) : (
                    '👤'
                  )}
                </div>
                <div className="figure-info">
                  <div className="figure-name">{figure.name}</div>
                  {figure.role && <div className="figure-role">{figure.role}</div>}
                  {figure.description && (
                    <div className="figure-desc">{figure.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>등록된 주요인물 없음</p>
        )}
      </div>

      {/* Custom Fields */}
      {politicsData.customFields?.length > 0 && (
        <div className="content-section" style={{ marginTop: '20px' }}>
          <h3 className="content-section-title">📋 추가 정보</h3>
          <table className="data-table">
            <tbody>
              {politicsData.customFields.map((field, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, width: '150px' }}>{field.label}</td>
                  <td>{field.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderEconomy = () => (
    <div className="slide-up">
      {images.economy?.length > 0 && (
        <div className="image-gallery" style={{ marginBottom: '24px' }}>
          {images.economy.map((img) => (
            <div key={img.id} className="image-gallery-item">
              <img src={img.url} alt={img.caption || ''} />
            </div>
          ))}
        </div>
      )}

      <div className="card-grid card-grid-3" style={{ marginBottom: '20px' }}>
        {[
          { key: 'heavyIndustry', label: '중공업', icon: '🏭' },
          { key: 'lightIndustry', label: '경공업', icon: '🧵' },
          { key: 'agriculture', label: '농업', icon: '🌾' },
          { key: 'resources', label: '자원', icon: '⛏️' },
          { key: 'commerce', label: '상업', icon: '🏪' },
        ].map((item) => {
          const val = economyData[item.key] || {};
          return (
            <div key={item.key} className="card stat-card">
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{item.icon}</div>
              <div className="stat-label">{item.label}</div>
              <div className="stat-value">
                {val.value || '-'}
                {val.unit && <span className="stat-unit">{val.unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {economyData.customFields?.length > 0 && (
        <div className="content-section">
          <h3 className="content-section-title">📋 추가 경제 지표</h3>
          <table className="data-table">
            <tbody>
              {economyData.customFields.map((field, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, width: '150px' }}>{field.label}</td>
                  <td>{field.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderTextSection = (category, catData, catImages) => (
    <div className="slide-up">
      {catImages?.length > 0 && (
        <div className="image-gallery" style={{ marginBottom: '24px' }}>
          {catImages.map((img) => (
            <div key={img.id} className="image-gallery-item">
              <img src={img.url} alt={img.caption || ''} />
            </div>
          ))}
        </div>
      )}

      <div className="card card-glass">
        <div className="card-body">
          {catData.content ? (
            <div className="content-text">{catData.content}</div>
          ) : (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon">📝</div>
              <div className="empty-state-text">아직 작성된 내용이 없습니다</div>
            </div>
          )}
        </div>
      </div>

      {catData.customFields?.length > 0 && (
        <div className="content-section" style={{ marginTop: '20px' }}>
          <h3 className="content-section-title">📋 추가 정보</h3>
          <table className="data-table">
            <tbody>
              {catData.customFields.map((field, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, width: '150px' }}>{field.label}</td>
                  <td>{field.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderTab = () => {
    switch (activeTab) {
      case 'politics':
        return renderPolitics();
      case 'economy':
        return renderEconomy();
      case 'social':
        return renderTextSection('social', socialData, images.social);
      case 'diplomacy':
        return renderTextSection('diplomacy', diplomacyData, images.diplomacy);
      default:
        return null;
    }
  };

  return (
    <div className="page-content fade-in">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            className="country-color-dot"
            style={{
              backgroundColor: country.color,
              width: '20px',
              height: '20px',
            }}
          />
          <h1 className="section-title" style={{ margin: 0 }}>
            {country.name}
          </h1>
        </div>
        {admin && (
          <a href="/admin" className="btn btn-sm btn-secondary">
            ⚙️ 편집
          </a>
        )}
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {renderTab()}
    </div>
  );
}
