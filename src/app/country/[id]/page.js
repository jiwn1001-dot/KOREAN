'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getCountry, getDataEntry, getAllImages, getResearches, getResources, getCountries, createResearch } from '@/lib/store';
import { transferTech } from '@/lib/gameLogic';
import { canAccessCountry, isAdminOrSub } from '@/lib/auth';
import LoginModal from '@/components/LoginModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ParliamentArch from '@/components/ParliamentArch';
import SupportPieChart from '@/components/SupportPieChart';

export default function CountryPage() {
  const params = useParams();
  const countryId = params.id;

  const [country, setCountry] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [activeTab, setActiveTab] = useState('politics');
  const [data, setData] = useState({});
  const [images, setImages] = useState({});
  const [researches, setResearches] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    setAdmin(isAdminOrSub());
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

    try {
      const res = await getResearches(countryId);
      setResearches(res || []);
      const rsc = await getResources(countryId);
      setResources(rsc || []);
      const clist = await getCountries();
      setCountries(clist || []);
    } catch (err) {
      console.error('Failed to load researches or resources', err);
    }
  };

  const tabs = [
    { id: 'politics', label: '정치', icon: '🏛️' },
    { id: 'economy', label: '경제', icon: '💰' },
    { id: 'social', label: '사회문제', icon: '📢' },
    { id: 'diplomacy', label: '외교관계', icon: '🤝' },
    { id: 'research', label: '연구', icon: '🔬' },
    { id: 'resource', label: '자원', icon: '📦' },
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
              이 국가의 정보를 열람하려면 배정된 계정으로 로그인해야 합니다.
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setShowLogin(true)}
              style={{ width: '100%' }}
            >
              🔑 로그인
            </button>
          </div>
        </div>

        {showLogin && (
          <LoginModal
            onClose={() => setShowLogin(false)}
            onSuccess={() => {
              setShowLogin(false);
              setHasAccess(canAccessCountry(countryId));
              setAdmin(isAdminOrSub());
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
          
          {/* Leader Image */}
          {politicsData.leaderImage && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <img 
                src={politicsData.leaderImage} 
                alt="지도자" 
                style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '50%', border: '4px solid var(--border-default)' }} 
              />
            </div>
          )}
        </div>

        {/* Parliaments */}
        {(() => {
          const parliaments = politicsData.parliaments || (politicsData.parties ? [{ name: '의회', parties: politicsData.parties }] : []);
          if (parliaments.length === 0) {
            return (
              <div className="content-section">
                <h3 className="content-section-title">🏛️ 의회 현황</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>등록된 의회/정당 정보 없음</p>
              </div>
            );
          }
          return parliaments.map((parl, pIdx) => (
            <div key={pIdx} className="content-section" style={{ marginBottom: '32px' }}>
              <h3 className="content-section-title">🏛️ {parl.name || '의회'} 현황</h3>
              {parl.parties?.length > 0 ? (
                <>
                  <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>의석 분포</h4>
                    <ParliamentArch parties={parl.parties} />
                  </div>
                  <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>지지율</h4>
                    <SupportPieChart parties={parl.parties} />
                  </div>
    
                  <div className="party-list">
                    {parl.parties.map((party, i) => (
                      <div key={i} className="party-item" style={{ alignItems: 'flex-start' }}>
                        <span
                          className="party-color-dot"
                          style={{ backgroundColor: party.color || 'var(--accent)', marginTop: '6px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <span className="party-name">{party.name}</span>
                          <div className="party-stats">
                            <div className="party-seats">{party.seats}석</div>
                            <div>{party.supportRate}%</div>
                          </div>
                          {party.image && (
                            <img src={party.image} alt={party.name} style={{ marginTop: '8px', maxHeight: '40px', borderRadius: '4px' }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>등록된 정당 없음</p>
              )}
            </div>
          ));
        })()}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {politicsData.customFields.map((field, i) => (
              <div key={i} className="card stat-card" style={{ textAlign: 'left', padding: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>{field.label}</div>
                <div className="markdown-body" style={{ fontSize: '0.95rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{field.value}</ReactMarkdown>
                </div>
                {field.image && <img src={field.image} alt={field.label} style={{ marginTop: '12px', maxWidth: '100%', borderRadius: '8px' }} />}
              </div>
            ))}
          </div>
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

      {/* GDP & Growth Rate */}
      <div className="card-grid card-grid-2" style={{ marginBottom: '20px' }}>
         <div className="card stat-card" style={{ background: 'var(--gradient-card)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💵</div>
            <div className="stat-label">국내총생산 (GDP)</div>
            <div className="stat-value" style={{ color: 'var(--teal)' }}>
              {economyData.gdp?.value || '-'}
              {economyData.gdp?.unit && <span className="stat-unit">{economyData.gdp.unit}</span>}
            </div>
         </div>
         <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📈</div>
            <div className="stat-label">경제성장률 (턴당)</div>
            <div className="stat-value">
              {economyData.economicGrowthRate?.value || '0'}
              <span className="stat-unit">%</span>
            </div>
         </div>
      </div>

      <div className="card-grid card-grid-3" style={{ marginBottom: '20px' }}>
        {[
          { key: 'heavyIndustry', label: '중공업', icon: '🏭' },
          { key: 'lightIndustry', label: '경공업', icon: '🧵' },
          { key: 'agriculture', label: '농업', icon: '🌾' },
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {economyData.customFields.map((field, i) => (
              <div key={i} className="card stat-card" style={{ textAlign: 'left', padding: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>{field.label}</div>
                <div className="markdown-body" style={{ fontSize: '0.95rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{field.value}</ReactMarkdown>
                </div>
                {field.image && <img src={field.image} alt={field.label} style={{ marginTop: '12px', maxWidth: '100%', borderRadius: '8px' }} />}
              </div>
            ))}
          </div>
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
            <div className="content-text markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {catData.content}
              </ReactMarkdown>
            </div>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {catData.customFields.map((field, i) => (
              <div key={i} className="card stat-card" style={{ textAlign: 'left', padding: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>{field.label}</div>
                <div className="markdown-body" style={{ fontSize: '0.95rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{field.value}</ReactMarkdown>
                </div>
                {field.image && <img src={field.image} alt={field.label} style={{ marginTop: '12px', maxWidth: '100%', borderRadius: '8px' }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderResearch = () => (
    <div className="slide-up">
      <div className="content-section">
        <h3 className="content-section-title">🔬 연구 기술</h3>
        {researches.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>진행 중이거나 완료된 연구가 없습니다.</p>
        ) : (
          <div className="card-grid card-grid-2">
            {researches.map((r) => (
              <div key={r.id} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span className="badge badge-teal" style={{ marginBottom: '8px' }}>{r.category || '일반'}</span>
                    <h4 style={{ margin: '0 0 4px 0' }}>{r.name} (Lv.{r.level})</h4>
                  </div>
                  <div>
                    {r.status === 'completed' && <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>완료됨</span>}
                    {r.status === 'failed' && <span className="badge" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)' }}>실패함</span>}
                    {r.status === 'in_progress' && <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>진행중 ({r.remaining_turns}턴 남음)</span>}
                    {r.status === 'queued' && <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>대기중 ({r.required_turns}턴 필요)</span>}
                  </div>
                </div>
                
                {/* 기술 제공 UI */}
                {r.status === 'completed' && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', gap: '8px' }}>
                    <select id={`send_tech_${r.id}`} className="form-select" style={{ flex: 1 }}>
                      <option value="">-- 기술 제공 국가 선택 --</option>
                      {countries.filter(c => c.id !== countryId).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button className="btn btn-sm btn-secondary" onClick={async () => {
                      const targetId = document.getElementById(`send_tech_${r.id}`).value;
                      if (!targetId) return alert('제공할 국가를 선택하세요.');
                      
                      if (!confirm(`정말 ${r.name} (Lv.${r.level}) 기술을 제공하시겠습니까?`)) return;
                      
                      const result = await transferTech(targetId, r.name, r.level);
                      if (result.success) {
                        let msg = '기술이 성공적으로 제공되었습니다!';
                        if (result.bonusAdded > 0) {
                          msg += ` (상대방 생산력 +${result.bonusAdded}% 스킵 보너스 획득)`;
                        }
                        alert(msg);
                      } else {
                        alert(result.error || '기술 제공에 실패했습니다.');
                      }
                    }}>🎁 전송</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderResource = () => {
    const resourceLabels = {
      wood: { label: '목재', icon: '🪵' },
      steel: { label: '강철', icon: '🔩' },
      coal: { label: '석탄', icon: '🪨' },
      oil: { label: '석유', icon: '🛢️' },
      chromium: { label: '크롬', icon: '💎' },
      tungsten: { label: '텅스텐', icon: '⚡' },
      aluminum: { label: '알루미늄', icon: '⚙️' },
      rubber: { label: '고무', icon: '🛞' },
      sulfur: { label: '유황', icon: '🔥' },
      food: { label: '식료품', icon: '🍞' },
    };

    return (
      <div className="slide-up">
        <div className="content-section">
          <h3 className="content-section-title">📦 국가 자원</h3>
          <div className="card-grid card-grid-4">
            {Object.entries(resourceLabels).map(([key, info]) => {
              const rsc = resources.find(r => r.resource_type === key);
              const amount = rsc ? rsc.amount : 0;
              const prod = rsc ? rsc.production_per_turn : 0;
              return (
                <div key={key} className="card stat-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>{info.icon}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{info.label}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {Number(amount).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: Number(prod) > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {Number(prod) > 0 ? `+${prod} / 턴` : '생산 없음'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

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
      case 'research':
        return renderResearch();
      case 'resource':
        return renderResource();
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
            ⚙️ 관리자
          </a>
        )}
      </div>

      <div className="tabs" style={{ flexWrap: 'wrap' }}>
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

