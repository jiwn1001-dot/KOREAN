'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getCountry, getDataEntry, upsertDataEntry, getAllImages, getResearches, getResources, getCountries, createResearch, deleteResearch, upsertResource, updateResearch } from '@/lib/store';
import { transferTech, transferItems, acceptTransfer, rejectTransfer, getPendingTransfers } from '@/lib/gameLogic';
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
  const [weaponBlueprints, setWeaponBlueprints] = useState([]);
  const [militaryQueue, setMilitaryQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [countries, setCountries] = useState([]);
  const [techTrees, setTechTrees] = useState([]);
  const [unitTemplates, setUnitTemplates] = useState([]);
  const [militaryUnits, setMilitaryUnits] = useState([]);
  const [createUnitTemplateId, setCreateUnitTemplateId] = useState('');
  const [createUnitCount, setCreateUnitCount] = useState(1);
  const [queueBpId, setQueueBpId] = useState('');
  const [queueTargetAmount, setQueueTargetAmount] = useState('');
  const [globalEra, setGlobalEra] = useState('선사시대');
  const [pendingTransfers, setPendingTransfers] = useState([]);

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
      const settings = await getDataEntry('game_settings', null);
      if (settings && settings.data) {
        setWeaponBlueprints(settings.data.weaponBlueprints || []);
      }
      const qEntry = await getDataEntry('military_queue', countryId);
      if (qEntry && qEntry.data) {
        setMilitaryQueue(qEntry.data.queue || []);
      }
      const clist = await getCountries();
      setCountries(clist || []);
    } catch (err) {
      console.error('Failed to load related data:', err);
    }
    
    try {
      const settings = await getDataEntry('game_settings', null);
      if (settings && settings.data?.techTrees) {
        setTechTrees(settings.data.techTrees);
        setUnitTemplates(settings.data.unitTemplates || []);
        setGlobalEra(settings.data.globalEra || '선사시대');
      }
    } catch(err) {
      console.error('Failed to load game settings for tech trees', err);
    }

    // Load military units
    try {
      const unitsEntry = await getDataEntry('military_units', countryId);
      if (unitsEntry && unitsEntry.data) {
        setMilitaryUnits(unitsEntry.data.units || []);
      }
    } catch(err) {
      console.error('Failed to load military units', err);
    }

    // Load pending transfers
    try {
      const pt = await getPendingTransfers(countryId);
      setPendingTransfers(pt || []);
    } catch(err) {
      console.error('Failed to load pending transfers', err);
    }
  };

  const tabs = [
    { id: 'politics', label: '정치', icon: '🏛️' },
    { id: 'economy', label: '경제', icon: '💰' },
    { id: 'social', label: '사회문제', icon: '📢' },
    { id: 'diplomacy', label: '외교관계', icon: '🤝' },
    { id: 'research', label: '연구', icon: '🔬' },
    { id: 'resource', label: '자원', icon: '📦' },
    { id: 'military', label: '군수', icon: '⚔️' },
    { id: 'formation', label: '편제', icon: '🎖️' },
    { id: 'transfers', label: '알림 및 수송', icon: '🔔' },
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

  const renderEconomy = () => {
    const food = resources.find(r => r.resource_type === 'food')?.amount || 0;
    const consumerGoods = resources.find(r => r.resource_type === 'consumer_goods')?.amount || 0;
    const pop = economyData.population?.total || 0;
    
    let warning = null;
    if (pop > 0) {
      const isFoodDef = food < 0;
      const isFoodAbu = food >= pop;
      const isCgDef = consumerGoods < 0;
      const isCgAbu = consumerGoods >= pop;
      
      if (isFoodDef && isCgDef) {
        warning = { type: 'severe_inflation', msg: '🚨 [극심한 인플레이션] 식량과 소비재가 모두 부족합니다! (잔여량 < 0)' };
      } else if (isFoodAbu && isCgAbu) {
        warning = { type: 'severe_deflation', msg: '⚠️ [극심한 디플레이션] 식량과 소비재가 모두 넘쳐납니다! (잔여량 >= 인구수)' };
      } else if ((isFoodDef && isCgAbu) || (isFoodAbu && isCgDef)) {
        warning = { type: 'stagflation', msg: '🌪️ [스테그플레이션] 한 자원은 부족하고, 다른 자원은 넘쳐납니다!' };
      } else if (isFoodDef || isCgDef) {
        warning = { type: 'inflation', msg: '📈 [인플레이션] 식량 또는 소비재가 부족합니다.' };
      } else if (isFoodAbu || isCgAbu) {
        warning = { type: 'deflation', msg: '📉 [디플레이션] 식량 또는 소비재가 넘쳐납니다.' };
      } else {
        warning = { type: 'stable', msg: '✅ [안정적] 경제가 안정적입니다. (식량과 소비재 비축량이 적정 수준)' };
      }
    }

    const budget = (economyData.gdp || 0) * ((economyData.taxRate || 0) / 100);
    const nonBudget = (economyData.gdp || 0) - budget;

    return (
      <div className="slide-up">
        {warning && (
          <div className="card" style={{ padding: '16px', marginBottom: '20px', background: warning.type.includes('inflation') || warning.type === 'stagflation' ? 'rgba(248,113,113,0.1)' : warning.type.includes('deflation') ? 'rgba(96,165,250,0.1)' : 'rgba(74,222,128,0.1)', border: `1px solid ${warning.type.includes('inflation') || warning.type === 'stagflation' ? 'var(--error)' : warning.type.includes('deflation') ? 'var(--blue)' : 'var(--success)'}` }}>
            <h4 style={{ margin: 0, color: warning.type.includes('inflation') || warning.type === 'stagflation' ? 'var(--error)' : warning.type.includes('deflation') ? 'var(--blue)' : 'var(--success)' }}>{warning.msg}</h4>
          </div>
        )}
        
        <div className="card-grid card-grid-2" style={{ marginBottom: '20px' }}>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>👥</div>
            <div className="stat-label">전체 인구</div>
            <div className="stat-value">{Number(economyData.population?.total || 0).toLocaleString()}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>동원 가능: {Number(economyData.population?.mobilizable || 0).toLocaleString()}</div>
            {economyData.population?.growthRate > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '2px' }}>턴당 인구 증가: +1/{economyData.population.growthRate}</div>
            )}
          </div>
          <div className="card stat-card" style={{ background: 'var(--gradient-card)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💵</div>
            <div className="stat-label">국내총생산 (GDP)</div>
            <div className="stat-value" style={{ color: 'var(--teal)' }}>${Number(economyData.gdp || 0).toLocaleString()}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>세율: {economyData.taxRate || 0}%</div>
          </div>
        </div>

        <div className="card-grid card-grid-3" style={{ marginBottom: '20px' }}>
          <div className="card stat-card">
            <div className="stat-label">예산 (Budget)</div>
            <div className="stat-value">${Number(budget).toLocaleString()}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--accent)', marginTop: '4px' }}>이번 턴 중공업 코인: {economyData.heavyIndustryCoins || 0}개</div>
            {economyData.heavyIndustryCoins > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', justifyContent: 'center' }}>
                  <input type="number" id="hicAllocateAmount" className="form-input" placeholder="수량" defaultValue="1" style={{ width: '80px', textAlign: 'center' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', alignSelf: 'center' }}>개 배정</span>
                </div>
                <button className="btn btn-sm btn-primary" onClick={async () => {
                  const amt = parseInt(document.getElementById('hicAllocateAmount').value) || 0;
                  if (amt <= 0 || amt > economyData.heavyIndustryCoins) return alert('배정 가능한 올바른 수량을 입력하세요.');
                  if(!confirm(`중공업단지에 ${amt}개 배정하시겠습니까? (턴 종료 시 소멸)`)) return;
                  const newData = { ...economyData, heavyIndustryCoins: economyData.heavyIndustryCoins - amt, heavyIndustryComplexes: (economyData.heavyIndustryComplexes || 0) + amt };
                  await upsertDataEntry('economy', countryId, newData);
                  setData(p => ({ ...p, economy: { ...p.economy, data: newData } }));
                }}>🏭 중공업단지 짓기</button>
                <button className="btn btn-sm btn-primary" onClick={async () => {
                  const amt = parseInt(document.getElementById('hicAllocateAmount').value) || 0;
                  if (amt <= 0 || amt > economyData.heavyIndustryCoins) return alert('배정 가능한 올바른 수량을 입력하세요.');
                  if(!confirm(`조선소에 ${amt}개 배정하시겠습니까? (턴 종료 시 소멸)`)) return;
                  const newData = { ...economyData, heavyIndustryCoins: economyData.heavyIndustryCoins - amt, shipyards: (economyData.shipyards || 0) + amt };
                  await upsertDataEntry('economy', countryId, newData);
                  setData(p => ({ ...p, economy: { ...p.economy, data: newData } }));
                }}>🏗️ 조선소 짓기</button>
                <button className="btn btn-sm btn-secondary" onClick={async () => {
                  const amt = parseInt(document.getElementById('hicAllocateAmount').value) || 0;
                  if (amt <= 0 || amt > economyData.heavyIndustryCoins) return alert('배정 가능한 올바른 수량을 입력하세요.');
                  if(!confirm(`경제 투자에 ${amt}개 배정하시겠습니까? (다음 턴 GDP +${(amt * 10000).toLocaleString()})`)) return;
                  const newData = { ...economyData, heavyIndustryCoins: economyData.heavyIndustryCoins - amt, economicInvestment: (economyData.economicInvestment || 0) + amt };
                  await upsertDataEntry('economy', countryId, newData);
                  setData(p => ({ ...p, economy: { ...p.economy, data: newData } }));
                }}>💰 경제 투자</button>
              </div>
            )}
          </div>
          <div className="card stat-card">
            <div className="stat-label">비예산 (Non-Budget)</div>
            <div className="stat-value">${Number(nonBudget).toLocaleString()}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              광업 {economyData.allocation?.mining || 0}% | 농업 {economyData.allocation?.agriculture || 0}%<br/>
              상업 {economyData.allocation?.commerce || 0}% | 경공업 {economyData.allocation?.lightIndustry || 0}%
            </div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">이번 턴 생산 코인</div>
            <div style={{ fontSize: '0.9rem', marginTop: '8px', textAlign: 'left', display: 'inline-block' }}>
              <div>🌾 농수산업장: {economyData.agricultureCoins || 0}개</div>
              <div>🧵 경공업 공장: {economyData.lightIndustryCoins || 0}개</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>(턴 종료 시 식량 및 소비재로 자동 변환)</div>
            </div>
          </div>
        </div>

        <div className="card-grid card-grid-3" style={{ marginBottom: '20px' }}>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏭</div>
            <div className="stat-label">배정된 중공업단지</div>
            <div className="stat-value">{economyData.heavyIndustryComplexes || 0}</div>
          </div>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏗️</div>
            <div className="stat-label">배정된 조선소</div>
            <div className="stat-value">{economyData.shipyards || 0}</div>
          </div>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💰</div>
            <div className="stat-label">경제 투자 (누적)</div>
            <div className="stat-value">{economyData.economicInvestment || 0}</div>
          </div>
        </div>
      </div>
    );
  };

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

  const renderResearch = () => {
    const currentInProgress = researches.filter(r => r.status === 'in_progress').length;
    const maxSlots = economyData.researchSlots ?? 1;
    return (
    <div className="slide-up">
      <div className="content-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
          <h3 className="content-section-title" style={{ marginBottom: 0 }}>🔬 연구 기술</h3>
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: currentInProgress >= maxSlots ? 'var(--error)' : 'var(--accent)' }}>
            현재 연구 슬롯: {currentInProgress} / {maxSlots}
          </div>
        </div>
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
                    {r.status === 'in_progress' && (
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '0.8rem' }} onClick={async () => {
                        if (!confirm(`'${r.name}' 연구를 취소하시겠습니까?`)) return;
                        await deleteResearch(r.id);
                        alert('연구가 취소되었습니다.');
                        loadAllData();
                      }}>취소</button>
                    )}
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

      <div className="content-section" style={{ marginTop: '32px' }}>
        <h3 className="content-section-title">💡 새로운 연구 시작</h3>
        {techTrees.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>현재 열린 기술 트리가 없습니다.</p>
        ) : (
          <div className="card-grid card-grid-2">
            {techTrees.map(tree => {
              const countryResearches = researches.filter(r => r.name === tree.name);
              const activeResearch = countryResearches.find(r => r.status === 'in_progress' || r.status === 'failed');
              
              const completedResearches = countryResearches.filter(r => r.status === 'completed');
              const highestCompletedLevel = completedResearches.length > 0 ? Math.max(...completedResearches.map(r => r.level)) : 0;
              const nextLevelData = tree.levels[highestCompletedLevel];

              const eras = ['선사시대', '고대시대', '중세시대', '근세시대', '대혁명기', '빅토리안시대', '1차대전기', '2차대전기', '냉전기', '현대', '근미래'];
              let isEraLocked = false;
              if (nextLevelData?.era) {
                const globalEraIdx = eras.indexOf(globalEra);
                const nextEraIdx = eras.indexOf(nextLevelData.era);
                if (nextEraIdx > globalEraIdx) isEraLocked = true;
              }

              return (
                <div key={tree.id} className="card" style={{ padding: '16px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                    <span className="badge badge-accent" style={{ marginRight: '8px' }}>{tree.category}</span>
                    {tree.name}
                  </div>
                  <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    현재 완료된 단계: {highestCompletedLevel > 0 ? (tree.levels[highestCompletedLevel - 1]?.name || `Lv.${highestCompletedLevel}`) : '없음'}
                  </div>
                  
                  {activeResearch ? (
                    <div style={{ padding: '12px', background: activeResearch.status === 'failed' ? 'rgba(248,113,113,0.1)' : 'var(--bg-glass)', border: activeResearch.status === 'failed' ? '1px solid var(--error)' : 'none', borderRadius: '8px' }}>
                      <div style={{ marginBottom: '8px' }}>
                        <strong>[{activeResearch.status === 'failed' ? '실패함' : '진행 중'}] {tree.levels[activeResearch.level - 1]?.name || `Lv.${activeResearch.level}`}</strong> 
                        {activeResearch.status !== 'failed' && ` (남은 턴: ${activeResearch.remaining_turns})`}
                      </div>
                      {activeResearch.status === 'failed' && (
                        <button className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} onClick={async () => {
                          const maxSlots = economyData.researchSlots ?? 1;
                          const currentInProgress = researches.filter(r => r.status === 'in_progress').length;
                          if (currentInProgress >= maxSlots) {
                            return alert(`현재 진행 중인 연구가 슬롯 한도(${maxSlots}개)에 도달했습니다.`);
                          }
                          await updateResearch(activeResearch.id, { status: 'in_progress', remaining_turns: activeResearch.required_turns || 5 });
                          loadAllData();
                          alert('연구를 재시작했습니다.');
                        }}>🔄 재시작 (턴 초기화)</button>
                      )}
                    </div>
                  ) : (
                    <div>
                      {nextLevelData ? (
                        isEraLocked ? (
                          <div style={{ padding: '12px', background: 'rgba(248,113,113,0.1)', border: '1px solid var(--error)', borderRadius: '8px', color: 'var(--error)', textAlign: 'center', fontWeight: 'bold' }}>
                            글로벌 시대 제한<br/><span style={{ fontSize: '0.85rem' }}>(요구: {nextLevelData.era}, 현재: {globalEra})</span>
                          </div>
                        ) : (
                          <button className="btn btn-primary" style={{ width: '100%' }} onClick={async () => {
                          const maxSlots = economyData.researchSlots ?? 1;
                          const currentInProgress = researches.filter(r => r.status === 'in_progress').length;
                          const willQueue = currentInProgress >= maxSlots;
                          
                          if (!confirm(`정말 ${tree.name} 다음 단계(${nextLevelData.name || `Lv.${nextLevelData.level}`}) 연구를 ${willQueue ? '대기열에 추가' : '시작'}하시겠습니까? (소요: ${nextLevelData.turns}턴)`)) return;
                          
                          await createResearch({
                            country_id: countryId,
                            category: tree.category,
                            name: tree.name,
                            level: nextLevelData.level,
                            required_turns: nextLevelData.turns,
                            remaining_turns: nextLevelData.turns,
                            status: willQueue ? 'queued' : 'in_progress'
                          });
                          loadAllData(); // Reload
                          if (willQueue) {
                            alert(`연구 슬롯이 가득 차 대기열에 추가되었습니다. (최대 ${maxSlots}개)`);
                          } else {
                            alert(`${nextLevelData.name || `Lv.${nextLevelData.level}`} 연구가 시작되었습니다!`);
                          }
                        }}>🚀 다음 연구 {researches.filter(r => r.status === 'in_progress').length >= (economyData.researchSlots ?? 1) ? '대기' : '시작'}: {nextLevelData.name || `Lv.${nextLevelData.level}`} ({nextLevelData.turns}턴)</button>
                        )
                      ) : (
                        <p style={{ color: 'var(--text-muted)' }}>모든 단계를 완료했습니다.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
  };

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
      consumer_goods: { label: '소비재', icon: '👕' },
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

  const renderMilitary = () => {
    const resourceLabels = {
      wood: { label: '목재', icon: '🪵' },
      steel: { label: '강철', icon: '🔩' },
      coal: { label: '석탄', icon: '🪨' },
      oil: { label: '석유', icon: '🛢️' },
      chromium: { label: '크롬', icon: '💎' },
      tungsten: { label: '텅스텐', icon: '⚡' },
      aluminum: { label: '알루미늄', icon: '⚙️' },
      food: { label: '식료품', icon: '🍞' },
      consumer_goods: { label: '소비재', icon: '🛍️' }
    };
    const hasCoalToOil = researches.some(r => r.status === 'completed' && r.name && r.name.includes('석탄-석유')); // Example check, will refine later
    const weaponResources = resources.filter(r => r.resource_type && r.resource_type.startsWith('weapon:'));

    return (
      <div className="slide-up">
        <div className="content-section">
          <h3 className="content-section-title">⚔️ 군수 장비 인벤토리</h3>
          {weaponResources.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>보유 중인 군수 장비가 없습니다.</p>
          ) : (
            <div className="card-grid card-grid-3">
              {weaponResources.map(w => (
                <div key={w.id} className="card stat-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{w.resource_type.replace('weapon:', '')}</div>
                  <div style={{ fontSize: '1.4rem', color: 'var(--teal)', marginTop: '8px' }}>{Number(w.amount).toLocaleString()}개</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="content-section" style={{ marginTop: '30px' }}>
          <h3 className="content-section-title">🏭 무기 생산 대기열 (Queue)</h3>
          <div className="card" style={{ padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>연구가 완료된 무기를 대기열에 등록하면 매 턴 배정된 공업력과 자원을 소모해 자동 생산됩니다.</p>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', marginTop: '12px' }}>
              <select id="newQueueBp" className="form-select" style={{ flex: 1 }} value={queueBpId} onChange={e => setQueueBpId(e.target.value)}>
                <option value="">-- 생산할 무기 선택 --</option>
                {weaponBlueprints.filter(bp => {
                  let requiredTreeName = null;
                  let requiredLevel = null;
                  for (const tree of techTrees) {
                    const lData = tree.levels?.find(l => (l.name || `${tree.name} ${l.level}단계`) === bp.name);
                    if (lData) {
                      requiredTreeName = tree.name;
                      requiredLevel = lData.level;
                      break;
                    }
                  }
                  if (!requiredTreeName) return false;
                  return researches.some(r => r.status === 'completed' && r.name === requiredTreeName && r.level >= requiredLevel);
                }).map(bp => (
                  <option key={bp.id} value={bp.id}>{bp.name} (요구: {bp.facility === 'heavy' ? '중공업단지' : '조선소'} {bp.industryCost})</option>
                ))}
              </select>
              <input type="number" id="newQueueTarget" className="form-input" placeholder="목표량" style={{ width: '100px' }} value={queueTargetAmount} onChange={e => setQueueTargetAmount(e.target.value)} />
              <button className="btn btn-secondary" onClick={async () => {
                const bpId = queueBpId;
                const target = parseInt(queueTargetAmount);
                if (!bpId || !target || target <= 0) return alert('올바른 값을 입력하세요.');
                
                const newQueue = [...militaryQueue, { bpId, target, progress: 0, deliveries: [] }];
                await upsertDataEntry('military_queue', countryId, { queue: newQueue });
                setMilitaryQueue(newQueue);
                setQueueBpId('');
                setQueueTargetAmount('');
                alert('대기열에 추가되었습니다.');
              }}>➕ 대기열 추가</button>
            </div>
            
            {queueBpId && (
              <div style={{ background: 'var(--bg-glass)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                {(() => {
                  const bp = weaponBlueprints.find(b => b.id === queueBpId);
                  if (!bp) return null;
                  const amt = parseInt(queueTargetAmount) || 1;
                  const indCost = (bp.industryCost || 1) * amt;
                  const resText = bp.resources ? Object.entries(bp.resources).map(([rName, rAmount]) => {
                    const label = resourceLabels[rName]?.label || rName;
                    return `${label} ${rAmount * amt}`;
                  }).join(', ') : '없음';
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '0.95rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>총 생산 자원 비용:</span> <strong>{resText}</strong>
                      </div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--primary)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>필요 총 공업력:</span> <strong>{bp.facility === 'heavy' ? '중공업단지' : '조선소'} {indCost}</strong>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {militaryQueue.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>대기열이 비어 있습니다.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>무기명</th>
                    <th>진행도 / 목표량</th>
                    <th>입고 대기 중 (생산소모턴수)</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {militaryQueue.map((q, idx) => {
                    const bp = weaponBlueprints.find(b => b.id === q.bpId) || {};
                    return (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{bp.name || '알 수 없는 무기'}</td>
                        <td>{q.progress || 0} / {q.target}</td>
                        <td>
                          {q.deliveries && q.deliveries.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {q.deliveries.map((d, dIdx) => (
                                <span key={dIdx} className="badge badge-accent">
                                  {d.amount}개 ({d.remainingTurns}턴 뒤 입고)
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>없음</span>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={async () => {
                            if (!confirm('대기열에서 삭제하시겠습니까?')) return;
                            const newQ = militaryQueue.filter((_, i) => i !== idx);
                            await upsertDataEntry('military_queue', countryId, { queue: newQ });
                            setMilitaryQueue(newQ);
                          }}>삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {hasCoalToOil && (
          <div className="content-section" style={{ marginTop: '30px' }}>
            <h3 className="content-section-title">⚗️ 특수 화학 기술 (석탄 → 석유)</h3>
            <div className="card" style={{ padding: '20px', border: '1px solid var(--accent)' }}>
              <p>석탄 4개를 소모하여 석유 1개를 즉시 생산할 수 있습니다.</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
                <input type="number" id="coalToOilAmount" className="form-input" placeholder="생산할 석유 수량" style={{ width: '150px' }} />
                <button className="btn btn-primary" onClick={async () => {
                  const amt = parseInt(document.getElementById('coalToOilAmount').value) || 0;
                  if (amt <= 0) return alert('올바른 수량을 입력하세요.');
                  
                  const coalRes = resources.find(r => r.resource_type === 'coal');
                  const coalAmount = coalRes ? Number(coalRes.amount) : 0;
                  if (coalAmount < amt * 4) return alert(`석탄이 부족합니다. (필요: ${amt * 4}, 현재: ${coalAmount})`);
                  
                  if (!confirm(`석탄 ${amt * 4}개를 소모하여 석유 ${amt}개를 생산하시겠습니까?`)) return;
                  
                  await upsertResource(countryId, 'coal', coalAmount - (amt * 4));
                  const oilRes = resources.find(r => r.resource_type === 'oil');
                  const oilAmount = oilRes ? Number(oilRes.amount) : 0;
                  await upsertResource(countryId, 'oil', oilAmount + amt);
                  
                  alert('변환되었습니다.');
                  loadAllData();
                }}>변환하기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };



  const renderFormation = () => {
    // 1. Calculate research bonuses
    const completedTechs = researches.filter(r => r.status === 'completed');
    let penetrationBonus = 0;
    let antiairBonus = 0;
    let observationBonus = 0;

    completedTechs.forEach(tech => {
      const tree = techTrees.find(t => t.name === tech.name);
      if (tree) {
        for (let i = 0; i < tech.level; i++) {
          const levelData = (Array.isArray(tree.levels) ? tree.levels : [])[i];
          if (levelData) {
            if (levelData.effect === 'penetration_boost') penetrationBonus += (levelData.effectValue || 0);
            if (levelData.effect === 'antiair_boost') antiairBonus += (levelData.effectValue || 0);
            if (levelData.effect === 'observation_boost') observationBonus += (levelData.effectValue || 0);
          }
        }
      }
    });

    const totalMobilizable = Number(economyData.population?.mobilizable || 0);

    return (
      <div className="slide-up">
        <div className="content-section">
          <h2 className="content-section-title">🎖️ 편제 부대 편성 및 현황</h2>
          <p style={{ color: 'var(--text-muted)' }}>보유한 무기와 동원가능인구를 소모하여 부대를 편성합니다.</p>

          {/* 연구 보너스 정보 */}
          <div className="card" style={{ padding: '16px', marginBottom: '20px', background: 'var(--bg-glass)', border: '1px solid var(--accent)' }}>
            <h4 style={{ marginBottom: '8px', color: 'var(--accent)' }}>🔬 국가 기술 보너스 (전 유닛 일괄 적용)</h4>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div><strong>관통력:</strong> +{penetrationBonus}</div>
              <div><strong>대공능력:</strong> +{antiairBonus}</div>
              <div><strong>관측력:</strong> +{observationBonus}</div>
            </div>
          </div>

          <div className="card-grid card-grid-2">
            {/* 유닛 생성 */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginBottom: '16px' }}>부대 창설</h3>
              <div className="form-group">
                <label className="form-label">유닛 종류 선택</label>
                <select id="createUnitTemplate" className="form-select" value={createUnitTemplateId} onChange={e => setCreateUnitTemplateId(e.target.value)}>
                  <option value="">-- 템플릿 선택 --</option>
                  {unitTemplates.map(tmpl => (
                    <option key={tmpl.id} value={tmpl.id}>
                      [{tmpl.majorCategory}/{tmpl.minorCategory}] {tmpl.name} (인력: {tmpl.manpowerCost})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">부대 이름 (커스텀)</label>
                <input type="text" id="createUnitCustomName" className="form-input" placeholder="예: 제1보병사단 (공군은 무시됨)" />
              </div>
              <div className="form-group">
                <label className="form-label">생성 수량</label>
                <input type="number" id="createUnitCount" className="form-input" value={createUnitCount} min="1" onChange={e => setCreateUnitCount(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              
              {/* 소모 비용 미리보기 */}
              {createUnitTemplateId && (() => {
                const template = unitTemplates.find(t => t.id === createUnitTemplateId);
                if (!template) return null;
                const totalManpowerCost = (template.manpowerCost || 0) * createUnitCount;
                const isManpowerShort = totalMobilizable < totalManpowerCost;
                
                return (
                  <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>소모 자원 미리보기</h4>
                    <div style={{ fontSize: '0.9rem', marginBottom: '4px', color: isManpowerShort ? 'var(--error)' : 'inherit' }}>
                      <strong>동원가능인구:</strong> {totalManpowerCost.toLocaleString()} 필요 / {totalMobilizable.toLocaleString()} 보유
                    </div>
                    {template.requiredWeapons?.map(rw => {
                      const needed = rw.amount * createUnitCount;
                      const res = resources.find(r => r.resource_type === `weapon:${rw.weaponName}`);
                      const current = res ? Number(res.amount) : 0;
                      const isShort = current < needed;
                      return (
                        <div key={rw.weaponName} style={{ fontSize: '0.9rem', marginBottom: '2px', color: isShort ? 'var(--error)' : 'inherit' }}>
                          <strong>{rw.weaponName}:</strong> {needed.toLocaleString()} 필요 / {current.toLocaleString()} 보유
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <button className="btn btn-primary" style={{ width: '100%' }} onClick={async () => {
                const tmplId = createUnitTemplateId;
                const customName = document.getElementById('createUnitCustomName').value;
                const count = createUnitCount;
                
                if (!tmplId || !count || count <= 0) return alert('템플릿과 수량을 확인하세요.');
                const template = unitTemplates.find(t => t.id === tmplId);
                if (!template) return;

                // 인력 확인
                const totalManpowerCost = (template.manpowerCost || 0) * count;
                if (totalMobilizable < totalManpowerCost) {
                  return alert(`동원가능인구가 부족합니다. (필요: ${totalManpowerCost}, 현재: ${totalMobilizable})`);
                }

                // 무기 확인
                const reqWeapons = template.requiredWeapons || [];
                const weaponDeductions = [];
                for (const rw of reqWeapons) {
                  const needed = rw.amount * count;
                  const res = resources.find(r => r.resource_type === `weapon:${rw.weaponName}`);
                  if (!res || Number(res.amount) < needed) {
                    return alert(`무기 [${rw.weaponName}]가 부족합니다. (필요: ${needed}, 현재: ${res ? res.amount : 0})`);
                  }
                  weaponDeductions.push({ name: rw.weaponName, newAmount: Number(res.amount) - needed, prod: res.production_per_turn });
                }

                if (!confirm(`부대를 창설하시겠습니까?\n소모 인력: ${totalManpowerCost}\n소모 무기: ${reqWeapons.map(w => `${w.weaponName} ${w.amount * count}개`).join(', ')}`)) return;

                // 1. 무기 차감
                for (const wd of weaponDeductions) {
                  await upsertResource(countryId, `weapon:${wd.name}`, wd.newAmount, wd.prod);
                }
                
                // 2. 동원가능인구 차감
                const newEcoData = { ...economyData };
                newEcoData.population = { ...newEcoData.population, mobilizable: totalMobilizable - totalManpowerCost };
                await upsertDataEntry('economy', countryId, newEcoData);

                // 3. 편제 유닛 추가
                const newUnit = {
                  id: Date.now().toString(),
                  templateId: tmplId,
                  customName: template.majorCategory === '공군' ? '' : customName,
                  count,
                  operational: count, // 초기엔 전체 가동
                  createdAt: new Date().toISOString()
                };

                const newUnits = [...militaryUnits, newUnit];
                await upsertDataEntry('military_units', countryId, { units: newUnits });
                setMilitaryUnits(newUnits);
                
                alert('부대가 창설되었습니다.');
                loadAllData();
              }}>부대 창설하기</button>
            </div>

            {/* 현재 부대 목록 */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginBottom: '16px' }}>현재 보유 부대</h3>
              {militaryUnits.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>편성된 부대가 없습니다.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {militaryUnits.map(unit => {
                    const tmpl = unitTemplates.find(t => t.id === unit.templateId) || {};
                    const isAir = tmpl.majorCategory === '공군';
                    const nameDisplay = isAir ? tmpl.name : (unit.customName || tmpl.name);
                    const isFuelShortage = unit.operational < unit.count;
                    return (
                      <div key={unit.id} className="card" style={{ padding: '12px', background: 'var(--bg-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {tmpl.image && (
                              <img src={tmpl.image} alt={tmpl.name} style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                            )}
                            <div>
                              <span className="badge badge-accent" style={{ marginRight: '8px' }}>{tmpl.majorCategory}</span>
                              {nameDisplay} (x{unit.count})
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="number" id={`disbandCount_${unit.id}`} className="form-input" defaultValue="1" min="1" max={unit.count} style={{ width: '60px', padding: '2px 4px' }} />
                            <button className="btn btn-sm btn-ghost" onClick={async () => {
                              const disbandCount = parseInt(document.getElementById(`disbandCount_${unit.id}`).value) || 0;
                              if (disbandCount <= 0 || disbandCount > unit.count) return alert('올바른 해체 수량을 입력하세요.');
                              
                              const manpowerToReturn = (tmpl.manpowerCost || 0) * disbandCount;
                              const weaponsToReturn = (tmpl.requiredWeapons || []).map(w => ({ name: w.weaponName, amount: w.amount * disbandCount }));
                              
                              let msg = `${disbandCount}개의 부대를 해체하시겠습니까?\n`;
                              msg += `반환 인력: ${manpowerToReturn.toLocaleString()}명\n`;
                              if (weaponsToReturn.length > 0) {
                                msg += `반환 무기: ${weaponsToReturn.map(w => `${w.name} ${w.amount.toLocaleString()}개`).join(', ')}`;
                              }
                              if (!confirm(msg)) return;
                              
                              // 1. Return weapons
                              for (const w of weaponsToReturn) {
                                const res = resources.find(r => r.resource_type === `weapon:${w.name}`);
                                const currentAmount = res ? Number(res.amount) : 0;
                                const currentProd = res ? res.production_per_turn : 0;
                                await upsertResource(countryId, `weapon:${w.name}`, currentAmount + w.amount, currentProd);
                              }
                              
                              // 2. Return manpower
                              const newEcoData = { ...economyData };
                              newEcoData.population = { ...(newEcoData.population || {}), mobilizable: Number(newEcoData.population?.mobilizable || 0) + manpowerToReturn };
                              await upsertDataEntry('economy', countryId, newEcoData);
                              
                              // 3. Update unit count
                              let newUnits;
                              if (disbandCount === unit.count) {
                                newUnits = militaryUnits.filter(u => u.id !== unit.id);
                              } else {
                                newUnits = militaryUnits.map(u => {
                                  if (u.id === unit.id) {
                                    return { ...u, count: u.count - disbandCount, operational: Math.min(u.operational, u.count - disbandCount) };
                                  }
                                  return u;
                                });
                              }
                              
                              await upsertDataEntry('military_units', countryId, { units: newUnits });
                              setMilitaryUnits(newUnits);
                              alert('부대가 해체되었습니다.');
                              loadAllData();
                            }}>해체</button>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', marginTop: '8px', color: 'var(--text-muted)' }}>
                          가동 상태: <span style={{ color: isFuelShortage ? 'var(--error)' : 'var(--primary)', fontWeight: 'bold' }}>{unit.operational}</span> / {unit.count}
                          {isFuelShortage && <span style={{ marginLeft: '8px', color: 'var(--error)' }}>(연료 부족)</span>}
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                          <div>⚔️ {tmpl.attack} | 🛡️ {tmpl.defense} | 💨 {tmpl.speed}</div>
                          <div>❤️ {tmpl.hp} | 📐 {tmpl.combatWidth}</div>
                          <div style={{ gridColumn: 'span 2', marginTop: '2px' }}>
                            📦 보급소모: {tmpl.supplyConsumption || 0}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTransfers = () => {
    const resourceLabels = {
      wood: { label: '목재', icon: '🪵' },
      steel: { label: '강철', icon: '🔩' },
      coal: { label: '석탄', icon: '🪨' },
      oil: { label: '석유', icon: '🛢️' },
      chromium: { label: '크롬', icon: '💎' },
      tungsten: { label: '텅스텐', icon: '⚡' },
      aluminum: { label: '알루미늄', icon: '⚙️' },
      food: { label: '식료품', icon: '🍞' },
      consumer_goods: { label: '소비재', icon: '🛍️' }
    };
    const weaponResources = resources.filter(r => r.resource_type === 'weapon');

    return (
      <div className="slide-up">
        {/* Incoming Pending Transfers */}
        <div className="content-section" style={{ marginBottom: '30px' }}>
          <h3 className="content-section-title">📥 수신 대기 중인 물자</h3>
          <div className="card" style={{ padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>다른 국가가 보낸 물자를 수락해야 인벤토리에 들어옵니다.</p>
            {pendingTransfers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>수신 대기 중인 항목이 없습니다.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {pendingTransfers.map((t) => {
                  const senderName = countries.find(c => c.id === t.from)?.name || '알 수 없는 국가';
                  let itemName = t.key;
                  if (t.type === 'coin') {
                    itemName = t.key === 'agricultureCoins' ? '농업 코인' : t.key === 'heavyIndustryCoins' ? '중공업 코인' : '경공업 코인';
                  } else if (t.type === 'resource') {
                    itemName = resourceLabels[t.key]?.label || t.key;
                  }
                  
                  return (
                    <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-glass)', padding: '12px', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border-color)' }}>
                      <div>
                        <strong>{senderName}</strong> 국가에서 <strong>{itemName}</strong> {Number(t.amount).toLocaleString()}개를 보냈습니다.
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm btn-primary" onClick={async () => {
                          const res = await acceptTransfer(t.id, countryId);
                          if (res.success) {
                            alert(res.message);
                            loadAllData();
                          } else {
                            alert(res.message);
                          }
                        }}>✅ 수락</button>
                        <button className="btn btn-sm btn-danger" onClick={async () => {
                          const res = await rejectTransfer(t.id, countryId);
                          if (res.success) {
                            alert(res.message);
                            loadAllData();
                          } else {
                            alert(res.message);
                          }
                        }}>❌ 거절</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Send Transfer UI */}
        <div className="content-section" style={{ marginBottom: '30px' }}>
          <h3 className="content-section-title">🚚 송금 및 물자 지원</h3>
          <div className="card" style={{ padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>다른 국가로 무기, 자원, 코인을 전송할 수 있습니다. (상대방이 수락해야 전송이 완료됩니다)</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select id="transferTarget" className="form-select" style={{ flex: 1, minWidth: '150px' }}>
                <option value="">-- 받을 국가 선택 --</option>
                {countries.filter(c => c.id !== countryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select id="transferItem" className="form-select" style={{ flex: 1, minWidth: '150px' }}>
                <option value="">-- 보낼 물자 선택 --</option>
                <optgroup label="코인">
                  <option value="coin:agricultureCoins">농업 코인</option>
                  <option value="coin:heavyIndustryCoins">중공업 코인</option>
                  <option value="coin:lightIndustryCoins">경공업 코인</option>
                </optgroup>
                <optgroup label="자원">
                  {resources.filter(r => r.resource_type !== 'weapon' && r.amount > 0).map(r => (
                    <option key={r.id} value={`resource:${r.resource_type}`}>
                      {resourceLabels[r.resource_type]?.label || r.resource_type} (보유: {r.amount})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="무기">
                  {weaponResources.filter(w => w.amount > 0).map(w => (
                    <option key={w.id} value={w.resource_type}>
                      무기: {w.resource_type.replace('weapon:', '')} (보유: {w.amount}개)
                    </option>
                  ))}
                </optgroup>
              </select>
              <input type="number" id="transferAmount" className="form-input" placeholder="수량" style={{ width: '100px' }} />
              <button className="btn btn-primary" onClick={async () => {
                const toId = document.getElementById('transferTarget').value;
                const itemRaw = document.getElementById('transferItem').value;
                const amount = parseInt(document.getElementById('transferAmount').value);
                
                if (!toId) return alert('국가를 선택하세요.');
                if (!itemRaw) return alert('보낼 물자를 선택하세요.');
                if (!amount || amount <= 0) return alert('수량을 올바르게 입력하세요.');
                
                const [type, key] = itemRaw.split(':');
                const res = await transferItems(countryId, toId, type, key, amount);
                if (res.success) {
                  alert(res.message);
                  loadAllData();
                } else {
                  alert(res.message);
                }
              }}>요청 보내기</button>
            </div>
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
      case 'military':
        return renderMilitary();
      case 'formation':
        return renderFormation();
      case 'transfers':
        return renderTransfers();
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
            style={{ position: 'relative' }}
          >
            <span>{tab.icon}</span> {tab.label}
            {tab.id === 'transfers' && pendingTransfers.length > 0 && (
              <span style={{
                position: 'absolute', top: '-5px', right: '-5px', 
                background: 'red', color: 'white', borderRadius: '50%', 
                padding: '2px 6px', fontSize: '0.7rem', fontWeight: 'bold'
              }}>
                {pendingTransfers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {renderTab()}
    </div>
  );
}

