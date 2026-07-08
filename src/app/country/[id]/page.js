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
  const [techTrees, setTechTrees] = useState([]);

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
    
    try {
      const settings = await getDataEntry('game_settings', null);
      if (settings && settings.data?.techTrees) {
        setTechTrees(settings.data.techTrees);
      }
    } catch(err) {
      console.error('Failed to load game settings for tech trees', err);
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
      if (food + consumerGoods < pop) warning = { type: 'inflation', msg: '🚨 [인플레이션 경고] 식량과 소비재가 인구보다 부족합니다!' };
      else if (food + consumerGoods > pop * 2) warning = { type: 'deflation', msg: '⚠️ [디플레이션 경고] 식량과 소비재가 인구 대비 과도하게 많습니다.' };
    }

    const budget = (economyData.gdp || 0) * ((economyData.taxRate || 0) / 100);
    const nonBudget = (economyData.gdp || 0) - budget;

    return (
      <div className="slide-up">
        {warning && (
          <div className="card" style={{ padding: '16px', marginBottom: '20px', background: warning.type === 'inflation' ? 'rgba(248,113,113,0.1)' : 'rgba(96,165,250,0.1)', border: `1px solid ${warning.type === 'inflation' ? 'var(--error)' : 'var(--blue)'}` }}>
            <h4 style={{ margin: 0, color: warning.type === 'inflation' ? 'var(--error)' : 'var(--blue)' }}>{warning.msg}</h4>
          </div>
        )}
        
        <div className="card-grid card-grid-2" style={{ marginBottom: '20px' }}>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>👥</div>
            <div className="stat-label">전체 인구</div>
            <div className="stat-value">{Number(economyData.population?.total || 0).toLocaleString()}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>동원 가능: {Number(economyData.population?.mobilizable || 0).toLocaleString()}</div>
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
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'center' }}>
                <button className="btn btn-sm btn-primary" onClick={() => alert('구현 중: 중공업단지로 변환 (턴 종료 시 소멸)')}>중공업단지 짓기</button>
                <button className="btn btn-sm btn-primary" onClick={() => alert('구현 중: 조선소로 변환 (턴 종료 시 소멸)')}>조선소 짓기</button>
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

        <div className="card-grid card-grid-2" style={{ marginBottom: '20px' }}>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏭</div>
            <div className="stat-label">영구 보유 중공업단지</div>
            <div className="stat-value">{economyData.heavyIndustryComplexes || 0}</div>
          </div>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏗️</div>
            <div className="stat-label">영구 보유 조선소</div>
            <div className="stat-value">{economyData.shipyards || 0}</div>
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

      <div className="content-section" style={{ marginTop: '32px' }}>
        <h3 className="content-section-title">💡 새로운 연구 시작</h3>
        {techTrees.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>현재 열린 기술 트리가 없습니다.</p>
        ) : (
          <div className="card-grid card-grid-2">
            {techTrees.map(tree => {
              const countryResearches = researches.filter(r => r.name === tree.name);
              const activeResearch = countryResearches.find(r => r.status === 'in_progress' || r.status === 'queued' || r.status === 'failed');
              
              const completedResearches = countryResearches.filter(r => r.status === 'completed');
              const highestCompletedLevel = completedResearches.length > 0 ? Math.max(...completedResearches.map(r => r.level)) : 0;
              const nextLevelData = tree.levels[highestCompletedLevel];

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
                        <strong>[{activeResearch.status === 'failed' ? '실패함' : (activeResearch.status === 'queued' ? '대기중' : '진행 중')}] {tree.levels[activeResearch.level - 1]?.name || `Lv.${activeResearch.level}`}</strong> 
                        {activeResearch.status !== 'failed' && ` (남은 턴: ${activeResearch.remaining_turns})`}
                      </div>
                      {activeResearch.status === 'failed' && (
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={async () => {
                          // TODO: Replace with updateResearch call when we import it, or use a fetch. 
                          // Wait, we need to import updateResearch if we want to restart. Let's just alert for now or implement properly.
                          alert('재시작은 아직 구현되지 않았습니다. 관리자에게 문의하세요.');
                        }}>🔄 재시작 (관리자 문의)</button>
                      )}
                    </div>
                  ) : (
                    <div>
                      {nextLevelData ? (
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={async () => {
                          if (!confirm(`정말 ${tree.name} 다음 단계(${nextLevelData.name || `Lv.${nextLevelData.level}`}) 연구를 시작하시겠습니까? (소요: ${nextLevelData.turns}턴)`)) return;
                          
                          await createResearch({
                            country_id: countryId,
                            category: tree.category,
                            name: tree.name,
                            level: nextLevelData.level,
                            required_turns: nextLevelData.turns,
                            remaining_turns: nextLevelData.turns,
                            status: 'in_progress'
                          });
                          loadAllData(); // Reload
                          alert(`${nextLevelData.name || `Lv.${nextLevelData.level}`} 연구가 시작되었습니다!`);
                        }}>🚀 다음 연구 시작: {nextLevelData.name || `Lv.${nextLevelData.level}`} ({nextLevelData.turns}턴)</button>
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

  const renderMilitary = () => {
    const hasCoalToOil = researches.some(r => r.status === 'completed' && r.name.includes('석탄-석유')); // Example check, will refine later
    const weaponResources = resources.filter(r => r.resource_type === 'weapon'); // Assuming weapons are saved as 'weapon' type

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
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{w.name || '알 수 없는 무기'}</div>
                  <div style={{ fontSize: '1.4rem', color: 'var(--teal)', marginTop: '8px' }}>{Number(w.amount).toLocaleString()}개</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="content-section" style={{ marginTop: '30px' }}>
          <h3 className="content-section-title">🏭 무기 생산 예약</h3>
          <div className="card" style={{ padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>연구가 완료된 무기 청사진을 기반으로, 매 턴 할당된 공업력을 소모하여 무기를 자동 생산합니다.</p>
            <button className="btn btn-secondary" onClick={() => alert('생산 예약 UI 구현 중...')}>➕ 새로운 생산 라인 추가</button>
          </div>
        </div>

        {hasCoalToOil && (
          <div className="content-section" style={{ marginTop: '30px' }}>
            <h3 className="content-section-title">⚗️ 특수 화학 기술 (석탄 → 석유)</h3>
            <div className="card" style={{ padding: '20px', border: '1px solid var(--accent)' }}>
              <p>석탄 4개를 소모하여 석유 1개를 생산할 수 있습니다.</p>
              <button className="btn btn-primary" onClick={() => alert('변환 로직 구현 중...')}>변환하기</button>
            </div>
          </div>
        )}
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

