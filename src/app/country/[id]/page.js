'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getCountry, getDataEntry, getAllImages, getResearches, getResources, getCountries, createResearch } from '@/lib/store';
import { transferTech, transferHeavyIndustryCoins, transferWeapons, transferResources } from '@/lib/gameLogic';
import { supabase } from '@/lib/supabase';
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
  const [weaponTemplates, setWeaponTemplates] = useState([]);

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
      if (settings && settings.data?.weaponTemplates) {
        setWeaponTemplates(settings.data.weaponTemplates);
      }
    } catch(err) {
      console.error('Failed to load game settings', err);
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

  const renderEconomy = () => {
    const eco = economyData || {};
    const budget = eco.budget || 0;
    const coins = eco.heavyIndustryCoins || 0;
    const weapons = eco.weapons || {};

    const handleAllocate = async (type) => {
      if (coins <= 0) return alert('할당할 중공업 코인이 없습니다.');
      if (!confirm(`중공업 코인 1개를 소모하여 ${type === 'heavy' ? '중공업단지' : '조선소'}를 1개 짓겠습니까?`)) return;

      const newEco = { ...eco };
      newEco.heavyIndustryCoins -= 1;
      if (type === 'heavy') newEco.heavyIndustryDistricts = (newEco.heavyIndustryDistricts || 0) + 1;
      else newEco.shipyards = (newEco.shipyards || 0) + 1;

      try {
        await supabase.from('data_entries').update({ data: newEco }).eq('id', data.economy.id);
        alert('성공적으로 할당되었습니다!');
        loadAllData();
      } catch (err) {
        alert('오류가 발생했습니다.');
      }
    };

    const handleTransferCoins = async () => {
      if (coins <= 0) return alert('송금할 코인이 없습니다.');
      const targetId = document.getElementById('transfer_coin_target').value;
      if (!targetId) return alert('송금할 국가를 선택하세요.');
      const amount = parseInt(document.getElementById('transfer_coin_amount').value);
      if (!amount || amount <= 0 || amount > coins) return alert('올바른 수량을 입력하세요.');

      if (!confirm(`정말 ${amount}개의 중공업 코인을 송금하시겠습니까?`)) return;

      const result = await transferHeavyIndustryCoins(countryId, targetId, amount);
      if (result.success) {
        alert('송금 완료!');
        loadAllData();
      } else {
        alert(result.error);
      }
    };

    const handleTransferWeapon = async () => {
      const weaponName = document.getElementById('transfer_weapon_name').value;
      if (!weaponName) return alert('송금할 무기를 선택하세요.');
      const targetId = document.getElementById('transfer_weapon_target').value;
      if (!targetId) return alert('송금할 국가를 선택하세요.');
      const amount = parseInt(document.getElementById('transfer_weapon_amount').value);
      const maxAmount = weapons[weaponName] || 0;
      if (!amount || amount <= 0 || amount > maxAmount) return alert('올바른 수량을 입력하세요.');

      if (!confirm(`정말 [${weaponName}] ${amount}대를 송금하시겠습니까?`)) return;

      const result = await transferWeapons(countryId, targetId, weaponName, amount);
      if (result.success) {
        alert('송금 완료!');
        loadAllData();
      } else {
        alert(result.error);
      }
    };

    const completedTechNames = researches.filter(r => r.status === 'completed').map(r => r.name);
    const availableTemplates = weaponTemplates.filter(t => !t.requiredTech || completedTechNames.includes(t.requiredTech));
    
    const allocations = eco.weaponAllocations || {};
    const handleAllocationChange = (templateId, val) => {
      const newAlloc = { ...allocations, [templateId]: Number(val) };
      setEconomyData(p => ({ ...p, weaponAllocations: newAlloc }));
    };

    const handleSaveAllocations = async () => {
      // 검증: 총 할당량이 보유 공장을 넘지 않는지 확인
      let heavyUsed = 0;
      let shipyardUsed = 0;
      
      for (const t of availableTemplates) {
        const amount = allocations[t.id] || 0;
        if (t.facility === 'heavy') heavyUsed += amount;
        else shipyardUsed += amount;
      }

      if (heavyUsed > (eco.heavyIndustryDistricts || 0)) {
        return alert(`중공업단지 할당량(${heavyUsed})이 보유량(${eco.heavyIndustryDistricts || 0})을 초과했습니다.`);
      }
      if (shipyardUsed > (eco.shipyards || 0)) {
        return alert(`조선소 할당량(${shipyardUsed})이 보유량(${eco.shipyards || 0})을 초과했습니다.`);
      }

      try {
        await supabase.from('data_entries').update({ data: { ...eco, weaponAllocations: allocations } }).eq('id', data.economy.id);
        alert('할당이 저장되었습니다.');
        loadAllData();
      } catch (err) {
        alert('오류가 발생했습니다.');
      }
    };

    return (
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

        {/* Warnings */}
        {eco.warnings && eco.warnings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {eco.warnings.map((w, i) => (
              <div key={i} style={{ padding: '12px', background: w.includes('인플') ? 'rgba(248,113,113,0.1)' : 'rgba(59,130,246,0.1)', border: w.includes('인플') ? '1px solid var(--error)' : '1px solid var(--teal)', borderRadius: '8px', color: w.includes('인플') ? 'var(--error)' : 'var(--teal)' }}>
                {w}
              </div>
            ))}
          </div>
        )}

        {/* GDP & Budget */}
        <div className="card-grid card-grid-2" style={{ marginBottom: '20px' }}>
           <div className="card stat-card" style={{ background: 'var(--gradient-card)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💵</div>
              <div className="stat-label">국내총생산 (GDP)</div>
              <div className="stat-value" style={{ color: 'var(--teal)' }}>
                ${Number(eco.gdp || 0).toLocaleString()}
              </div>
           </div>
           <div className="card stat-card">
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏦</div>
              <div className="stat-label">국가 예산 (세율 {eco.taxRate || 0}%)</div>
              <div className="stat-value">
                ${Number(budget).toLocaleString()}
              </div>
           </div>
        </div>

        {/* Population */}
        <div className="card-grid card-grid-2" style={{ marginBottom: '20px' }}>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>👥</div>
            <div className="stat-label">전체인구</div>
            <div className="stat-value">
              {Number(eco.totalPopulation || 0).toLocaleString()}<span className="stat-unit">명</span>
            </div>
          </div>
          <div className="card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🎖️</div>
            <div className="stat-label">동원가능인구</div>
            <div className="stat-value">
              {Number(eco.mobilizablePopulation || 0).toLocaleString()}<span className="stat-unit">명</span>
            </div>
          </div>
        </div>

        {/* Heavy Industry Coins */}
        <div className="card" style={{ padding: '20px', marginBottom: '20px', background: 'var(--bg-elevated)', border: '1px solid var(--accent)' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚙️ 사용 가능한 중공업 코인</span>
            <span style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>{coins}개</span>
          </h3>
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => handleAllocate('heavy')} disabled={coins <= 0}>
              🏭 중공업단지 짓기 (-1)
            </button>
            <button className="btn btn-secondary" onClick={() => handleAllocate('shipyard')} disabled={coins <= 0}>
              ⚓ 조선소 짓기 (-1)
            </button>
          </div>

          <div style={{ background: 'var(--bg-glass)', padding: '12px', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>💸 코인 송금하기</h4>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select id="transfer_coin_target" className="form-input" style={{ flex: 1 }}>
                <option value="">-- 국가 선택 --</option>
                {countries.filter(c => c.id !== countryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input id="transfer_coin_amount" type="number" className="form-input" style={{ width: '80px' }} placeholder="수량" min="1" max={coins} />
              <button className="btn btn-primary" onClick={handleTransferCoins} disabled={coins <= 0}>전송</button>
            </div>
          </div>
        </div>

        {/* Industry Power */}
        <div className="card-grid card-grid-2" style={{ marginBottom: '20px' }}>
          <div className="card stat-card">
             <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏭</div>
            <div className="stat-label">중공업단지 (공업력)</div>
            <div className="stat-value">
              {eco.heavyIndustryDistricts || 0}
            </div>
          </div>
          <div className="card stat-card">
             <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⚓</div>
            <div className="stat-label">조선소 (조선력)</div>
            <div className="stat-value">
              {eco.shipyards || 0}
            </div>
          </div>
        </div>

        {/* Weapon Factory Allocation */}
        <div className="content-section" style={{ marginBottom: '20px' }}>
          <h3 className="content-section-title">🏭 무기 생산 할당</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            보유한 공장을 각 무기 생산에 할당하세요. 턴을 넘길 때 할당된 공장 수에 비례하여 무기가 생산되며, 자원이 소모됩니다.
          </p>
          {availableTemplates.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>생산 가능한 무기 기술이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {availableTemplates.map(t => {
                const val = allocations[t.id] || 0;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{t.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        필요: {t.facility === 'heavy' ? '🏭 중공업단지' : '⚓ 조선소'} | 
                        효율: 턴당 {t.powerCost}대 생산 | 
                        자원(공장1개당): {Object.entries(t.resourceCosts || {}).filter(([_,v]) => v>0).map(([k,v]) => `${k} ${v}`).join(', ') || '없음'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ fontSize: '0.9rem' }}>공장 할당량:</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        style={{ width: '80px' }} 
                        min="0" 
                        value={val} 
                        onChange={(e) => handleAllocationChange(t.id, e.target.value)} 
                        disabled={!admin && !hasAccess} 
                      />
                    </div>
                  </div>
                );
              })}
              {(admin || hasAccess) && (
                <button className="btn btn-primary" style={{ marginTop: '12px', alignSelf: 'flex-start' }} onClick={handleSaveAllocations}>
                  💾 생산 할당 저장
                </button>
              )}
            </div>
          )}
        </div>

        {/* Weapons Inventory */}
        {Object.keys(weapons).length > 0 && (
          <div className="content-section" style={{ marginBottom: '20px' }}>
            <h3 className="content-section-title">🔫 무기 재고</h3>
            <div className="card-grid card-grid-3" style={{ marginBottom: '16px' }}>
              {Object.entries(weapons).map(([name, count]) => (
                <div key={name} className="card stat-card" style={{ padding: '12px' }}>
                  <div className="stat-label">{name}</div>
                  <div className="stat-value">{count}<span className="stat-unit">대</span></div>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--bg-glass)', padding: '16px', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>💸 무기 지원하기</h4>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select id="transfer_weapon_name" className="form-input" style={{ flex: 1, minWidth: '150px' }}>
                  <option value="">-- 무기 선택 --</option>
                  {Object.entries(weapons).filter(([_, count]) => count > 0).map(([name, _]) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <select id="transfer_weapon_target" className="form-input" style={{ flex: 1, minWidth: '150px' }}>
                  <option value="">-- 타겟 국가 --</option>
                  {countries.filter(c => c.id !== countryId).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input id="transfer_weapon_amount" type="number" className="form-input" style={{ width: '100px' }} placeholder="수량" min="1" />
                <button className="btn btn-primary" onClick={handleTransferWeapon}>전송</button>
              </div>
            </div>
          </div>
        )}

        {/* Non-Budget Ratios */}
        <div className="content-section">
          <h3 className="content-section-title">📊 비예산 산업 비율</h3>
          <div className="card-grid card-grid-4">
            <div className="card stat-card" style={{ padding: '12px' }}>
              <div className="stat-label">광업</div>
              <div className="stat-value">{eco.nonBudgetRatio?.mining || 0}%</div>
            </div>
            <div className="card stat-card" style={{ padding: '12px' }}>
              <div className="stat-label">농업</div>
              <div className="stat-value">{eco.nonBudgetRatio?.agriculture || 0}%</div>
            </div>
            <div className="card stat-card" style={{ padding: '12px' }}>
              <div className="stat-label">상업</div>
              <div className="stat-value">{eco.nonBudgetRatio?.commerce || 0}%</div>
            </div>
            <div className="card stat-card" style={{ padding: '12px' }}>
              <div className="stat-label">경공업</div>
              <div className="stat-value">{eco.nonBudgetRatio?.lightIndustry || 0}%</div>
            </div>
          </div>
        </div>

        {eco.customFields?.length > 0 && (
          <div className="content-section" style={{ marginTop: '20px' }}>
            <h3 className="content-section-title">📋 추가 경제 지표</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {eco.customFields.map((field, i) => (
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
      consumer_goods: { label: '소비재', icon: '🛋️' },
    };

    const completedTechNames = researches.filter(r => r.status === 'completed').map(r => r.name);

    const handleConvertCoalToOil = async () => {
      const coalRes = resources.find(r => r.resource_type === 'coal');
      const coalAmount = coalRes ? Number(coalRes.amount) : 0;
      if (coalAmount < 100) return alert('석탄이 100개 이상 필요합니다.');
      
      if (!confirm('석탄 100개를 소모하여 석유 50개로 변환하시겠습니까?')) return;

      const oilRes = resources.find(r => r.resource_type === 'oil');
      const newCoal = coalAmount - 100;
      const newOil = (oilRes ? Number(oilRes.amount) : 0) + 50;

      try {
        await supabase.from('resources').update({ amount: newCoal }).eq('id', coalRes.id);
        if (oilRes) {
          await supabase.from('resources').update({ amount: newOil }).eq('id', oilRes.id);
        } else {
          await supabase.from('resources').insert({ country_id: countryId, resource_type: 'oil', amount: newOil, production_per_turn: 0 });
        }
        alert('석유 변환 성공!');
        loadAllData();
      } catch (err) {
        alert('오류 발생');
      }
    };

    const handleTransferResource = async () => {
      const resType = document.getElementById('transfer_resource_type').value;
      if (!resType) return alert('송금할 자원을 선택하세요.');
      const targetId = document.getElementById('transfer_resource_target').value;
      if (!targetId) return alert('송금할 국가를 선택하세요.');
      const amount = parseInt(document.getElementById('transfer_resource_amount').value);
      
      const resData = resources.find(r => r.resource_type === resType);
      const maxAmount = resData ? Number(resData.amount) : 0;
      if (!amount || amount <= 0 || amount > maxAmount) return alert('올바른 수량을 입력하세요.');

      if (!confirm(`정말 자원을 송금하시겠습니까?`)) return;

      const result = await transferResources(countryId, targetId, resType, amount);
      if (result.success) {
        alert('자원 송금 완료!');
        loadAllData();
      } else {
        alert(result.error);
      }
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

        {/* 특수 기술 효과 */}
        {completedTechNames.some(name => name.includes('석탄 액화') || name.includes('합성 석유') || name.includes('석유 정제')) && (
          <div className="content-section" style={{ marginTop: '20px' }}>
            <h3 className="content-section-title">🧪 특수 기술 효과</h3>
            <div className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>석탄 액화 (석탄 -> 석유 변환)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>석탄 100개를 소모하여 석유 50개를 생산합니다.</div>
              </div>
              <button className="btn btn-secondary" onClick={handleConvertCoalToOil}>변환하기</button>
            </div>
          </div>
        )}

        {/* 자원 지원하기 */}
        <div className="content-section" style={{ marginTop: '20px' }}>
          <h3 className="content-section-title">💸 자원 지원하기</h3>
          <div style={{ background: 'var(--bg-glass)', padding: '16px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select id="transfer_resource_type" className="form-input" style={{ flex: 1, minWidth: '150px' }}>
                <option value="">-- 자원 선택 --</option>
                {Object.entries(resourceLabels).map(([key, info]) => {
                  const rsc = resources.find(r => r.resource_type === key);
                  if (rsc && rsc.amount > 0) {
                    return <option key={key} value={key}>{info.label}</option>;
                  }
                  return null;
                })}
              </select>
              <select id="transfer_resource_target" className="form-input" style={{ flex: 1, minWidth: '150px' }}>
                <option value="">-- 타겟 국가 --</option>
                {countries.filter(c => c.id !== countryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input id="transfer_resource_amount" type="number" className="form-input" style={{ width: '100px' }} placeholder="수량" min="1" />
              <button className="btn btn-primary" onClick={handleTransferResource}>전송</button>
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

