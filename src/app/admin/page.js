'use client';

import React, { useState, useEffect, useCallback } from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div style={{padding:'20px', background:'red', color:'white'}}><h2>UI Error!</h2><pre>{this.state.error.toString()}</pre></div>;
    }
    return this.props.children;
  }
}

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { isAdmin } from '@/lib/auth';
import {
  getCountries, createCountry, updateCountry, deleteCountry,
  getDataEntry, upsertDataEntry,
  getAllImages, deleteImage, addImageByUrl,
  getMapData, saveMapData,
  getUsers, updateUserRole, assignCountryToUser,
  getGameState, advanceGameState,
  getResearches, createResearch, updateResearch, deleteResearch,
  getResources, upsertResource,
  saveAerialCombatSession, getAerialCombatSession
} from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { processTurnEnd, rollbackTurn, resetToTurnOne, transferTech } from '@/lib/gameLogic';
import { 
  createAerialCombatSession, 
  resolveAerialRound,
  aiChooseCard,
  aiRespondToBattle,
  aiShouldSurrender
} from '@/lib/aerialCombat';
import LoginModal from '@/components/LoginModal';

const MapEditor = dynamic(() => import('@/components/MapEditor'), { ssr: false });

const AerialCardUI = ({ card }) => {
  if (!card) return null;
  const isAA = card.canBlock;
  const isAce = card.isAce;

  // 대공포 디자인
  if (isAA) {
    return (
      <div style={{
        minWidth: '100px', height: '140px', background: '#333', color: '#ff4d4f', border: '2px solid #ff4d4f',
        borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 8px rgba(255, 77, 79, 0.3)', padding: '8px', textAlign: 'center', flexShrink: 0
      }}>
        <div style={{ fontSize: '24px' }}>🎯</div>
        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginTop: '8px' }}>대공포</div>
        <div style={{ fontSize: '0.7rem', color: '#ccc', marginTop: '4px' }}>무조건 요격</div>
      </div>
    );
  }

  // 에이스 디자인
  if (isAce) {
    return (
      <div style={{
        minWidth: '100px', height: '140px', background: 'linear-gradient(135deg, #FFD700 0%, #B8860B 100%)', 
        border: '2px solid #FFF8DC', borderRadius: '8px', position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(218, 165, 32, 0.5)', display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#FFD700', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', zIndex: 10 }}>ACE</div>
        {card.unitImage ? (
          <img src={card.unitImage} alt="unit" style={{ width: '100%', height: '70px', objectFit: 'cover', borderBottom: '1px solid #FFF8DC' }} />
        ) : (
          <div style={{ width: '100%', height: '70px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>✈️</div>
        )}
        <div style={{ padding: '8px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: '#fff', textShadow: '1px 1px 2px #000', fontWeight: 'bold' }}>전투력: {card.speed * 5}</div>
        </div>
      </div>
    );
  }

  // 일반 카드 디자인
  return (
    <div style={{
      minWidth: '100px', height: '140px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '8px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0
    }}>
      {card.unitImage ? (
        <img src={card.unitImage} alt="unit" style={{ width: '100%', height: '70px', objectFit: 'cover', borderBottom: '1px solid var(--border-color)' }} />
      ) : (
        <div style={{ width: '100%', height: '70px', background: 'var(--bg-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>✈️</div>
      )}
      <div style={{ padding: '8px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.9rem' }}>속도: {card.speed}</div>
      </div>
    </div>
  );
};

export default function AdminPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [toast, setToast] = useState(null);

  // Data
  const [countries, setCountries] = useState([]);
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [users, setUsers] = useState([]);
  const [gameState, setGameState] = useState({ current_turn: 1 });
  const [researches, setResearches] = useState([]);
  const [resources, setResources] = useState([]);
  const [techTrees, setTechTrees] = useState([]);
  const [weaponBlueprints, setWeaponBlueprints] = useState([]);
  const [editingBlueprintId, setEditingBlueprintId] = useState(null);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editingTechTreeId, setEditingTechTreeId] = useState(null);
  const [editingTechLevelId, setEditingTechLevelId] = useState(null);
  const [unitTemplates, setUnitTemplates] = useState([]);
  const [militaryUnits, setMilitaryUnits] = useState([]);
  const [gameSettingsEntry, setGameSettingsEntry] = useState(null);
  const [aerialSessionForm, setAerialSessionForm] = useState({ supplyLimit: 0 });
  const [testAerialGame, setTestAerialGame] = useState(null); // 테스트 게임 상태
  const [testGameLog, setTestGameLog] = useState([]); // 라운드 로그

  // Forms
  const [newCountry, setNewCountry] = useState({ name: '', password: '', color: '#7c6bf0' });
  const [historyEntry, setHistoryEntry] = useState(null);
  const [historyContent, setHistoryContent] = useState('');
  const [historyImages, setHistoryImages] = useState([]);
  const [geoEntry, setGeoEntry] = useState(null);
  const [geoData, setGeoData] = useState({ mountains: [], rivers: [], plains: [] });
  const [geoImages, setGeoImages] = useState([]);

  // Country data
  const [politicsEntry, setPoliticsEntry] = useState(null);
  const [politicsData, setPoliticsData] = useState({
    governmentType: '', headOfState: '', leaderImage: '', parties: [], keyFigures: [], customFields: [],
  });
  const [politicsImages, setPoliticsImages] = useState([]);
  const [economyEntry, setEconomyEntry] = useState(null);
  const [economyData, setEconomyData] = useState({
    gdp: 0,
    taxRate: 0,
    researchSlots: 1,
    multipliers: { shipbuilding: 1, food: 1, heavyIndustry: 1, consumerGoods: 1 },
    population: { total: 0, mobilizable: 0 },
    allocation: { mining: 0, agriculture: 0, commerce: 0, lightIndustry: 0 },
    commerceCoins: 0,
    heavyIndustryComplexes: 0,
    shipyards: 0,
    customFields: [],
  });
  const [economyImages, setEconomyImages] = useState([]);
  const [mgmtData, setMgmtData] = useState(null);
  const [socialEntry, setSocialEntry] = useState(null);
  const [socialData, setSocialData] = useState({ content: '', customFields: [] });
  const [socialImages, setSocialImages] = useState([]);
  const [diplomacyEntry, setDiplomacyEntry] = useState(null);
  const [diplomacyData, setDiplomacyData] = useState({ content: '', customFields: [] });
  const [diplomacyImages, setDiplomacyImages] = useState([]);

  const [mapData, setMapData] = useState(null);
  const [baseMapDataUrl, setBaseMapDataUrl] = useState(null);
  const [countryTab, setCountryTab] = useState('politics');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isAdm = isAdmin();
    setAdmin(isAdm);
    if (!isAdm) setShowLogin(true);
    else loadCountries();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadCountries = async () => {
    try {
      const data = await getCountries();
      setCountries(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadGameState = async () => {
    try {
      const state = await getGameState();
      setGameState(state);
    } catch (err) {
      console.error(err);
    }
  };

  const loadHistory = async () => {
    try {
      const entry = await getDataEntry('history');
      setHistoryEntry(entry);
      setHistoryContent(entry?.data?.content || '');
      if (entry) {
        const imgs = await getAllImages(entry.id);
        setHistoryImages(imgs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadGeography = async () => {
    try {
      const entry = await getDataEntry('geography');
      setGeoEntry(entry);
      setGeoData(entry?.data || { mountains: [], rivers: [], plains: [] });
      if (entry) {
        const imgs = await getAllImages(entry.id);
        setGeoImages(imgs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadCountryData = useCallback(async (cId) => {
    if (!cId) return;
    setLoading(true);
    try {
      // Politics
      const pol = await getDataEntry('politics', cId);
      setPoliticsEntry(pol);
      setPoliticsData(pol?.data || {
        governmentType: '', headOfState: '', leaderImage: '', parties: [], keyFigures: [], customFields: [],
      });
      if (pol) setPoliticsImages(await getAllImages(pol.id));
      else setPoliticsImages([]);

      // Economy
      const eco = await getDataEntry('economy', cId);
      setEconomyEntry(eco);
      setEconomyData(eco?.data || {
        gdp: 0,
        taxRate: 0,
        researchSlots: 1,
        multipliers: { shipbuilding: 1, food: 1, heavyIndustry: 1, consumerGoods: 1 },
        population: { total: 0, mobilizable: 0, growthRate: 0 },
        allocation: { mining: 0, agriculture: 0, commerce: 0, lightIndustry: 0 },
        commerceCoins: 0,
        heavyIndustryComplexes: 0,
        shipyards: 0,
        customFields: [],
      });
      if (eco) setEconomyImages(await getAllImages(eco.id));
      else setEconomyImages([]);

      // Social
      const soc = await getDataEntry('social', cId);
      setSocialEntry(soc);
      setSocialData(soc?.data || { content: '', customFields: [] });
      if (soc) setSocialImages(await getAllImages(soc.id));
      else setSocialImages([]);

      // Diplomacy
      const dip = await getDataEntry('diplomacy', cId);
      setDiplomacyEntry(dip);
      setDiplomacyData(dip?.data || { content: '', customFields: [] });
      if (dip) setDiplomacyImages(await getAllImages(dip.id));
      else setDiplomacyImages([]);

      // Researches, Resources, Military Units (for new admin tabs)
      try {
        const resData = await getResearches(cId);
        setResearches(resData || []);
        
        const rscData = await getResources(cId);
        setResources(rscData || []);
        
        const milData = await getDataEntry('military_units', cId);
        setMilitaryUnits(milData?.data?.units || []);
      } catch(e) {}
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  const loadMap = async () => {
    try {
      const data = await getMapData();
      setMapData(data);
      
      const baseMapEntry = await getDataEntry('map_base_image');
      if (baseMapEntry?.data?.base64) {
        setBaseMapDataUrl(baseMapEntry.data.base64);
      }
    } catch (err) {
      console.error(err);
    }
  };


  const handleBaseMapUpload = async (dataUrl) => {
    try {
      await upsertDataEntry('map_base_image', null, { base64: dataUrl });
      setBaseMapDataUrl(dataUrl);
      showToast('원본 지도가 업로드되었습니다!');
    } catch (err) {
      console.error(err);
      showToast('원본 지도 업로드 실패', 'error');
    }
  };

  useEffect(() => {
    if (!admin) return;
    if (activeSection === 'dashboard') {
      loadGameState();
    }
    else if (activeSection === 'users') {
      loadUsers();
      loadCountries();
    }
    else if (activeSection === 'history') loadHistory();
    else if (activeSection === 'geography') loadGeography();
    else if (activeSection === 'country-info') {
      loadCountries();
      if (selectedCountryId) loadCountryData(selectedCountryId);
    }
    else if (activeSection === 'research' || activeSection === 'blueprints' || activeSection === 'formations' || activeSection === 'aerial') {
      loadCountries();
      
      loadGameSettings();
    }
    else if (activeSection === 'resources') {
      loadCountries();
    }
    else if (activeSection === 'map') {
      loadMap();
      loadCountries();
    }
    else if (activeSection === 'countries') loadCountries();
  }, [activeSection, admin, selectedCountryId, loadCountryData]);

  const loadResearches = async (cId) => {
    try {
      const data = await getResearches(cId);
      setResearches(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadGameSettings = async () => {
    try {
      const entry = await getDataEntry('game_settings');
      setGameSettingsEntry(entry);
      if (entry && entry.data) {
        setTechTrees(entry.data.techTrees || []);
        setWeaponBlueprints(entry.data.weaponBlueprints || []);
        setUnitTemplates(entry.data.unitTemplates || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const saveGameSettings = async (newData) => {
    try {
      const payload = { 
        ...(gameSettingsEntry?.data || {}), 
        ...newData 
      };
      await upsertDataEntry('game_settings', null, payload);
      await loadGameSettings();
      showToast('게임 설정이 저장되었습니다.');
    } catch (err) {
      showToast('저장 실패', 'error');
    }
  };

  const loadResources = async (cId) => {
    try {
      const data = await getResources(cId);
      setResources(data);
    } catch (err) {
      console.error(err);
    }
  };

  // ==================== HANDLERS ====================

  const handleAddCountry = async (e) => {
    e.preventDefault();
    if (!newCountry.name || !newCountry.password) {
      showToast('국가명과 비밀번호를 입력하세요', 'error');
      return;
    }
    try {
      await createCountry(newCountry);
      setNewCountry({ name: '', password: '', color: '#7c6bf0' });
      await loadCountries();
      showToast('국가가 추가되었습니다');
    } catch (err) {
      showToast('국가 추가 실패', 'error');
    }
  };

  const handleDeleteCountry = async (id, name) => {
    if (!confirm(`"${name}" 국가를 삭제하시겠습니까? 모든 관련 데이터가 삭제됩니다.`)) return;
    try {
      await deleteCountry(id);
      await loadCountries();
      if (selectedCountryId === id) setSelectedCountryId('');
      showToast('국가가 삭제되었습니다');
    } catch (err) {
      showToast('국가 삭제 실패', 'error');
    }
  };

  const handleUpdateCountry = async (id, updates) => {
    try {
      await updateCountry(id, updates);
      await loadCountries();
      showToast('국가 정보가 수정되었습니다');
    } catch (err) {
      showToast('수정 실패', 'error');
    }
  };

  const handleSaveHistory = async () => {
    try {
      const entry = await upsertDataEntry('history', null, { content: historyContent, title: '역사' });
      setHistoryEntry(entry);
      showToast('역사 정보가 저장되었습니다');
    } catch (err) {
      showToast('저장 실패', 'error');
    }
  };

  const handleSaveGeography = async () => {
    try {
      const entry = await upsertDataEntry('geography', null, { ...geoData, title: '지리' });
      setGeoEntry(entry);
      showToast('지리 정보가 저장되었습니다');
    } catch (err) {
      showToast('저장 실패', 'error');
    }
  };

  const handleSaveCountryData = async (category, entryData) => {
    if (!selectedCountryId) return;
    try {
      const entry = await upsertDataEntry(category, selectedCountryId, entryData);
      showToast('저장되었습니다');

      // Refresh the entry reference
      if (category === 'politics') setPoliticsEntry(entry);
      else if (category === 'economy') setEconomyEntry(entry);
      else if (category === 'social') setSocialEntry(entry);
      else if (category === 'diplomacy') setDiplomacyEntry(entry);
    } catch (err) {
      showToast('저장 실패', 'error');
    }
  };

  const handleAddImage = async (url, caption, entryId, section = 'general', onSuccess) => {
    if (!entryId) {
      showToast('먼저 데이터를 저장한 후 이미지를 추가하세요', 'error');
      return;
    }
    if (!url) {
      showToast('이미지 URL을 입력하세요', 'error');
      return;
    }
    try {
      await addImageByUrl(url, entryId, section, caption);
      showToast('이미지가 추가되었습니다');
      if (onSuccess) onSuccess();
      // Refresh current section
      if (activeSection === 'history') loadHistory();
      else if (activeSection === 'geography') loadGeography();
      else if (activeSection === 'country-info') loadCountryData(selectedCountryId);
    } catch (err) {
      showToast('이미지 추가 실패', 'error');
    }
  };

  const handleDeleteImage = async (imgId) => {
    try {
      await deleteImage(imgId);
      showToast('이미지가 삭제되었습니다');
      if (activeSection === 'history') loadHistory();
      else if (activeSection === 'geography') loadGeography();
      else if (activeSection === 'country-info') loadCountryData(selectedCountryId);
    } catch (err) {
      showToast('이미지 삭제 실패', 'error');
    }
  };

  const handleSaveMap = async (imageDataUrl) => {
    try {
      const legend = countries.map((c) => ({ name: c.name, color: c.color }));
      await saveMapData(imageDataUrl, legend);
      showToast('지도가 저장되었습니다');
    } catch (err) {
      showToast('지도 저장 실패', 'error');
    }
  };

  // ==================== HELPER: Geo Item CRUD ====================
  const addGeoItem = (type) => {
    setGeoData((prev) => ({
      ...prev,
      [type]: [...(prev[type] || []), { name: '', description: '' }],
    }));
  };

  const updateGeoItem = (type, idx, field, value) => {
    setGeoData((prev) => {
      const items = [...(prev[type] || [])];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, [type]: items };
    });
  };

  const removeGeoItem = (type, idx) => {
    setGeoData((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== idx),
    }));
  };

  // ==================== IMAGE GALLERY COMPONENT ====================
  const ImageSection = ({ imgs, entryId }) => {
    const [tempUrl, setTempUrl] = useState('');
    const [tempCaption, setTempCaption] = useState('');

    return (
      <div style={{ marginTop: '20px' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px' }}>📷 이미지 (URL 복사 후 마크다운으로 삽입 가능: `![설명](URL)`)</h4>
        {imgs && imgs.length > 0 && (
          <div className="image-gallery" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {imgs.map((img) => (
              <div key={img.id} className="image-gallery-item" style={{ position: 'relative', width: '200px' }}>
                <img src={img.url} alt={img.caption || ''} style={{ width: '100%', borderRadius: '8px' }} />
                <div style={{ padding: '8px', background: 'var(--bg-glass)', borderRadius: '0 0 8px 8px', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => { navigator.clipboard.writeText(`![이미지](${img.url})`); showToast('마크다운 코드가 복사되었습니다'); }} style={{ width: '100%', marginBottom: '4px' }}>📋 마크다운 복사</button>
                </div>
                <button className="image-remove-btn" onClick={() => handleDeleteImage(img.id)} style={{ position: 'absolute', top: '4px', right: '4px' }}>✕</button>
              </div>
            ))}
          </div>
        )}
        
        <div className="card" style={{ padding: '16px', marginTop: '12px' }}>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
              <label className="form-label">이미지 링크 URL 추가</label>
              <input
                className="form-input"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">사진 설명</label>
              <input
                className="form-input"
                value={tempCaption}
                onChange={(e) => setTempCaption(e.target.value)}
                placeholder="설명 (선택)"
              />
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => { 
              handleAddImage(tempUrl, tempCaption, entryId, 'general', () => {
                setTempUrl('');
                setTempCaption('');
              }); 
            }}>
              추가
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== RENDER SECTIONS ====================

  const loadMgmtData = async () => {
    try {
      const { data: entries } = await supabase.from('data_entries')
        .select('country_id, category, data')
        .in('category', ['economy', 'military_units']);
        
      const results = countries.map(c => {
        const eco = entries?.find(e => e.country_id === c.id && e.category === 'economy')?.data || {};
        const mil = entries?.find(e => e.country_id === c.id && e.category === 'military_units')?.data || {};
        
        const taxRate = eco.taxRate || 0;
        const totalPop = eco.population?.total || 0;
        
        const units = mil.units || [];
        let activePop = 0;
        units.forEach(u => {
          const tmpl = unitTemplates.find(t => t.id === u.templateId);
          if (tmpl) activePop += (tmpl.manpowerCost || 0) * (u.count || 0);
        });
        
        const ratio = totalPop > 0 ? ((activePop / totalPop) * 100).toFixed(2) : 0;
        
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          taxRate,
          totalPop,
          activePop,
          ratio
        };
      });
      setMgmtData(results);
    } catch (err) {
      console.error(err);
    }
  };

  const renderManagement = () => (
    <div className="slide-up">
      <h2 style={{ marginBottom: '24px' }}>🎛️ 관리 패널</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>모든 국가의 경제 지표(세율)와 징병율(전체 인구 대비 복무 중인 인구)을 한눈에 조회합니다.</p>
      
      <button className="btn btn-primary" onClick={loadMgmtData} style={{ marginBottom: '16px' }}>🔄 데이터 갱신</button>
      
      {mgmtData ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>국가</th>
                <th>세율</th>
                <th>전체 인구</th>
                <th>복무 중인 인구 (편제 완료)</th>
                <th>전체 인구 대비 복무 비율</th>
              </tr>
            </thead>
            <tbody>
              {mgmtData.map(d => (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                      <div className="color-indicator" style={{ backgroundColor: d.color, width: '12px', height: '12px', borderRadius: '50%' }}></div>
                      {d.name}
                    </div>
                  </td>
                  <td>{d.taxRate}%</td>
                  <td>{d.totalPop.toLocaleString()}명</td>
                  <td>{d.activePop.toLocaleString()}명</td>
                  <td>
                    <span className={`badge ${d.ratio >= 10 ? 'badge-danger' : 'badge-primary'}`}>
                      {d.ratio}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>데이터 갱신 버튼을 눌러주세요.</p>
      )}
    </div>
  );

  const renderCountries = () => (
    <div className="slide-up">
      <h2 style={{ marginBottom: '24px' }}>🏴 국가 관리</h2>

      {/* Add Country Form */}
      <div className="admin-form-section">
        <h3 className="admin-form-title">➕ 국가 추가</h3>
        <form onSubmit={handleAddCountry}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">국가명</label>
              <input
                className="form-input"
                value={newCountry.name}
                onChange={(e) => setNewCountry((p) => ({ ...p, name: e.target.value }))}
                placeholder="국가 이름"
              />
            </div>
            <div className="form-group">
              <label className="form-label">비밀번호</label>
              <input
                className="form-input"
                value={newCountry.password}
                onChange={(e) => setNewCountry((p) => ({ ...p, password: e.target.value }))}
                placeholder="열람 비밀번호"
              />
            </div>
            <div className="form-group">
              <label className="form-label">지도 색상</label>
              <div className="form-inline">
                <input
                  type="color"
                  value={newCountry.color}
                  onChange={(e) => setNewCountry((p) => ({ ...p, color: e.target.value }))}
                  style={{ width: '40px', height: '36px', border: 'none', cursor: 'pointer' }}
                />
                <input
                  className="form-input"
                  value={newCountry.color}
                  onChange={(e) => setNewCountry((p) => ({ ...p, color: e.target.value }))}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            ➕ 국가 추가
          </button>
        </form>
      </div>

      {/* Country List */}
      <div className="admin-form-section">
        <h3 className="admin-form-title">📋 등록된 국가 ({countries.length})</h3>
        {countries.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>등록된 국가가 없습니다</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {countries.map((c) => (
              <CountryRow
                key={c.id}
                country={c}
                onUpdate={handleUpdateCountry}
                onDelete={handleDeleteCountry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="slide-up">
      <h2 style={{ marginBottom: '24px' }}>📜 역사 편집</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
        모든 국가가 공유하는 역사 기록입니다. 비밀번호 없이 누구나 열람할 수 있습니다.
      </p>

      <div className="form-group">
        <label className="form-label">역사 내용</label>
        <textarea
          className="form-textarea"
          value={historyContent}
          onChange={(e) => setHistoryContent(e.target.value)}
          placeholder="역사 내용을 입력하세요..."
          style={{ minHeight: '300px' }}
        />
      </div>

      <button className="btn btn-primary" onClick={handleSaveHistory}>
        💾 역사 저장
      </button>

      {historyEntry && <ImageSection imgs={historyImages} entryId={historyEntry.id} />}
    </div>
  );

  const renderGeography = () => {
    const geoTypes = [
      { key: 'mountains', title: '⛰️ 산', icon: '⛰️' },
      { key: 'rivers', title: '🏞️ 강', icon: '🏞️' },
      { key: 'plains', title: '🌾 평야', icon: '🌾' },
    ];

    return (
      <div className="slide-up">
        <h2 style={{ marginBottom: '24px' }}>🗻 지리 편집</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
          한반도에 위치한 산, 강, 평야 정보입니다. 누구나 열람할 수 있습니다.
        </p>

        {geoTypes.map(({ key, title }) => (
          <div key={key} className="admin-form-section">
            <h3 className="admin-form-title">
              {title}
              <span className="badge badge-accent" style={{ marginLeft: '8px' }}>
                {(geoData[key] || []).length}개
              </span>
            </h3>

            {(geoData[key] || []).map((item, idx) => (
              <div key={idx} className="card" style={{ padding: '16px', marginBottom: '12px' }}>
                <div className="form-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div className="form-group">
                      <label className="form-label">이름</label>
                      <input
                        className="form-input"
                        value={item.name || ''}
                        onChange={(e) => updateGeoItem(key, idx, 'name', e.target.value)}
                        placeholder="이름"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">설명</label>
                      <textarea
                        className="form-textarea"
                        value={item.description || ''}
                        onChange={(e) => updateGeoItem(key, idx, 'description', e.target.value)}
                        placeholder="설명 (마크다운 이미지 삽입 가능)"
                        style={{ minHeight: '60px' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">이미지 URL (선택)</label>
                      <input
                        className="form-input"
                        value={item.image || ''}
                        onChange={(e) => updateGeoItem(key, idx, 'image', e.target.value)}
                        placeholder="이미지 URL"
                      />
                    </div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => removeGeoItem(key, idx)}>
                    ✕ 삭제
                  </button>
                </div>
              </div>
            ))}

            <button className="btn btn-sm btn-ghost" onClick={() => addGeoItem(key)} style={{ marginTop: '8px' }}>
              ➕ {title.split(' ')[1]} 추가
            </button>
          </div>
        ))}

        <button className="btn btn-primary" onClick={handleSaveGeography}>
          💾 지리 저장
        </button>

        {geoEntry && <ImageSection imgs={geoImages} entryId={geoEntry.id} />}
      </div>
    );
  };

  const renderCountryInfo = () => {
    const countryTabs = [
      { id: 'politics', label: '🏛️ 정치' },
      { id: 'economy', label: '💰 경제' },
      { id: 'social', label: '📢 사회문제' },
      { id: 'diplomacy', label: '🤝 외교관계' },
      { id: 'admin-research', label: '🔬 연구 관리' },
      { id: 'admin-military', label: '⚔️ 군사/무기 관리' },
    ];

    return (
      <div className="slide-up">
        <h2 style={{ marginBottom: '24px' }}>🏴 국가별 정보 편집</h2>

        <div className="form-group">
          <label className="form-label">국가 선택</label>
          <select
            className="form-select"
            value={selectedCountryId}
            onChange={(e) => setSelectedCountryId(e.target.value)}
          >
            <option value="">-- 국가를 선택하세요 --</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {selectedCountryId && (
          <>
            <div className="tabs" style={{ marginTop: '20px' }}>
              {countryTabs.map((t) => (
                <button
                  key={t.id}
                  className={`tab ${countryTab === t.id ? 'active' : ''}`}
                  onClick={() => setCountryTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <>
                {countryTab === 'politics' && renderPoliticsEditor()}
                {countryTab === 'economy' && renderEconomyEditor()}
                {countryTab === 'social' && renderTextEditor('social', socialData, setSocialData, socialEntry, socialImages)}
                {countryTab === 'diplomacy' && renderTextEditor('diplomacy', diplomacyData, setDiplomacyData, diplomacyEntry, diplomacyImages)}
                {countryTab === 'admin-research' && renderAdminResearchEditor()}
                {countryTab === 'admin-military' && renderAdminMilitaryEditor()}
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const renderPoliticsEditor = () => (
    <div className="slide-up">
      <div className="admin-form-section">
        <h3 className="admin-form-title">🏛️ 정부 정보</h3>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">정부체제</label>
            <input
              className="form-input"
              value={politicsData.governmentType || ''}
              onChange={(e) => setPoliticsData((p) => ({ ...p, governmentType: e.target.value }))}
              placeholder="예: 입헌군주제, 대통령제..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">정부수반</label>
            <input
              className="form-input"
              value={politicsData.headOfState || ''}
              onChange={(e) => setPoliticsData((p) => ({ ...p, headOfState: e.target.value }))}
              placeholder="수반 이름"
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">지도자 이미지 URL (선택)</label>
            <input
              className="form-input"
              value={politicsData.leaderImage || ''}
              onChange={(e) => setPoliticsData((p) => ({ ...p, leaderImage: e.target.value }))}
              placeholder="https://..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">전적 (Combat Score)</label>
            <input
              type="number"
              className="form-input"
              value={politicsData.combatScore || 0}
              onChange={(e) => setPoliticsData((p) => ({ ...p, combatScore: Number(e.target.value) || 0 }))}
              placeholder="예: 승리 점수"
            />
          </div>
        </div>
      </div>

      {/* Parliaments */}
      <div className="admin-form-section">
        <h3 className="admin-form-title">
          🏛️ 의회 및 정당
        </h3>
        {(() => {
          // Backward compatibility: If no parliaments exist, create one from existing parties or empty
          const parliaments = politicsData.parliaments || (politicsData.parties ? [{ name: '의회', parties: politicsData.parties }] : []);
          
          return (
            <div>
              {parliaments.map((parl, pIdx) => (
                <div key={pIdx} className="card" style={{ padding: '16px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, color: 'var(--accent)' }}>의회 이름:</h4>
                    <input 
                      className="form-input" 
                      style={{ flex: 1 }} 
                      value={parl.name || ''} 
                      onChange={(e) => {
                        const newParliaments = [...parliaments];
                        newParliaments[pIdx] = { ...newParliaments[pIdx], name: e.target.value };
                        setPoliticsData(p => ({ ...p, parliaments: newParliaments }));
                      }} 
                    />
                    <button className="btn btn-sm btn-danger" onClick={() => {
                      if (!confirm('이 의회를 삭제하시겠습니까?')) return;
                      setPoliticsData(p => ({ ...p, parliaments: parliaments.filter((_, i) => i !== pIdx) }));
                    }}>의회 삭제</button>
                  </div>
                  
                  {/* Parties of this parliament */}
                  {(parl.parties || []).map((party, idx) => (
                    <div key={idx} className="card" style={{ padding: '12px', marginBottom: '12px', background: 'var(--bg-elevated)' }}>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">정당명</label>
                          <input
                            className="form-input"
                            value={party.name || ''}
                            onChange={(e) => {
                              const newParliaments = [...parliaments];
                              const newParties = [...newParliaments[pIdx].parties];
                              newParties[idx] = { ...newParties[idx], name: e.target.value };
                              newParliaments[pIdx] = { ...newParliaments[pIdx], parties: newParties };
                              setPoliticsData((p) => ({ ...p, parliaments: newParliaments }));
                            }}
                            placeholder="정당 이름"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">의석수</label>
                          <input
                            className="form-input"
                            type="number"
                            value={party.seats || 0}
                            onChange={(e) => {
                              const newParliaments = [...parliaments];
                              const newParties = [...newParliaments[pIdx].parties];
                              newParties[idx] = { ...newParties[idx], seats: e.target.value };
                              newParliaments[pIdx] = { ...newParliaments[pIdx], parties: newParties };
                              setPoliticsData((p) => ({ ...p, parliaments: newParliaments }));
                            }}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">지지율(%)</label>
                          <input
                            className="form-input"
                            type="number"
                            step="0.1"
                            value={party.supportRate || 0}
                            onChange={(e) => {
                              const newParliaments = [...parliaments];
                              const newParties = [...newParliaments[pIdx].parties];
                              newParties[idx] = { ...newParties[idx], supportRate: e.target.value };
                              newParliaments[pIdx] = { ...newParliaments[pIdx], parties: newParties };
                              setPoliticsData((p) => ({ ...p, parliaments: newParliaments }));
                            }}
                          />
                        </div>
                        <div className="form-group" style={{ width: '80px' }}>
                          <label className="form-label">색상</label>
                          <input
                            type="color"
                            value={party.color || '#cccccc'}
                            onChange={(e) => {
                              const newParliaments = [...parliaments];
                              const newParties = [...newParliaments[pIdx].parties];
                              newParties[idx] = { ...newParties[idx], color: e.target.value };
                              newParliaments[pIdx] = { ...newParliaments[pIdx], parties: newParties };
                              setPoliticsData((p) => ({ ...p, parliaments: newParliaments }));
                            }}
                            style={{ width: '100%', height: '36px', padding: '0', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                          />
                        </div>
                      </div>
                      <div className="form-row" style={{ alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label className="form-label">정당 로고 URL (선택)</label>
                          <input
                            className="form-input"
                            value={party.image || ''}
                            onChange={(e) => {
                              const newParliaments = [...parliaments];
                              const newParties = [...newParliaments[pIdx].parties];
                              newParties[idx] = { ...newParties[idx], image: e.target.value };
                              newParliaments[pIdx] = { ...newParliaments[pIdx], parties: newParties };
                              setPoliticsData((p) => ({ ...p, parliaments: newParliaments }));
                            }}
                            placeholder="이미지 URL"
                          />
                        </div>
                        <button className="btn btn-sm btn-danger" onClick={() => {
                          const newParliaments = [...parliaments];
                          newParliaments[pIdx] = { ...newParliaments[pIdx], parties: newParliaments[pIdx].parties.filter((_, i) => i !== idx) };
                          setPoliticsData((p) => ({ ...p, parliaments: newParliaments }));
                        }}>✕ 삭제</button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={() => {
                    const newParliaments = [...parliaments];
                    newParliaments[pIdx] = { ...newParliaments[pIdx], parties: [...(newParliaments[pIdx].parties || []), { name: '', seats: 0, supportRate: 0, color: '#cccccc' }] };
                    setPoliticsData((p) => ({ ...p, parliaments: newParliaments }));
                  }}>➕ 이 의회에 정당 추가</button>
                </div>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => {
                setPoliticsData(p => ({
                  ...p,
                  parliaments: [...parliaments, { name: `제${parliaments.length + 1}의회`, parties: [] }]
                }));
              }}>🏛️ 새 의회 추가</button>
            </div>
          );
        })()}
      </div>

      {/* Key Figures */}
      <div className="admin-form-section">
        <h3 className="admin-form-title">
          👤 주요인물
          <span className="badge badge-accent" style={{ marginLeft: '8px' }}>
            {(politicsData.keyFigures || []).length}명
          </span>
        </h3>
        {(politicsData.keyFigures || []).map((fig, idx) => (
          <div key={idx} className="card" style={{ padding: '16px', marginBottom: '12px' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">이름</label>
                <input
                  className="form-input"
                  value={fig.name}
                  onChange={(e) => {
                    const figs = [...politicsData.keyFigures];
                    figs[idx] = { ...figs[idx], name: e.target.value };
                    setPoliticsData((p) => ({ ...p, keyFigures: figs }));
                  }}
                  placeholder="인물 이름"
                />
              </div>
              <div className="form-group">
                <label className="form-label">직책/역할</label>
                <input
                  className="form-input"
                  value={fig.role || ''}
                  onChange={(e) => {
                    const figs = [...politicsData.keyFigures];
                    figs[idx] = { ...figs[idx], role: e.target.value };
                    setPoliticsData((p) => ({ ...p, keyFigures: figs }));
                  }}
                  placeholder="예: 국무총리, 외교부장관..."
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">설명</label>
              <textarea
                className="form-textarea"
                value={fig.description || ''}
                onChange={(e) => {
                  const figs = [...politicsData.keyFigures];
                  figs[idx] = { ...figs[idx], description: e.target.value };
                  setPoliticsData((p) => ({ ...p, keyFigures: figs }));
                }}
                placeholder="인물에 대한 설명..."
                style={{ minHeight: '80px' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">프로필 이미지 URL (선택)</label>
              <input
                className="form-input"
                value={fig.image || ''}
                onChange={(e) => {
                  const figs = [...politicsData.keyFigures];
                  figs[idx] = { ...figs[idx], image: e.target.value };
                  setPoliticsData((p) => ({ ...p, keyFigures: figs }));
                }}
                placeholder="https://..."
              />
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => {
              setPoliticsData((p) => ({
                ...p,
                keyFigures: p.keyFigures.filter((_, i) => i !== idx),
              }));
            }}>🗑️ 인물 삭제</button>
          </div>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => {
          setPoliticsData((p) => ({
            ...p,
            keyFigures: [...(p.keyFigures || []), { name: '', role: '', description: '', image: '' }],
          }));
        }}>➕ 인물 추가</button>
      </div>

      {/* Custom Fields */}
      {renderCustomFields(politicsData, setPoliticsData)}

      <div className="btn-group" style={{ marginTop: '20px' }}>
        <button className="btn btn-primary" onClick={() => handleSaveCountryData('politics', politicsData)}>
          💾 정치 정보 저장
        </button>
      </div>

      {politicsEntry && <ImageSection imgs={politicsImages} entryId={politicsEntry.id} />}
    </div>
  );

  const renderEconomyEditor = () => {
    return (
      <div className="slide-up">
        <div className="admin-form-section">
          <h3 className="admin-form-title">💰 거시 경제 (GDP 및 인구)</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">전체 인구</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  className="form-input"
                  value={economyData.population?.total || 0}
                  onChange={(e) => {
                    const newTotal = Number(e.target.value);
                    const oldTotal = economyData.population?.total || 0;
                    const delta = newTotal - oldTotal;
                    setEconomyData(p => ({
                      ...p,
                      population: {
                        ...p.population,
                        total: newTotal,
                        mobilizable: (p.population?.mobilizable || 0) + (delta * 0.4)
                      }
                    }));
                  }}
                  style={{ flex: 1 }}
                />
                <input 
                  type="number" 
                  id="totalPopDelta" 
                  className="form-input" 
                  placeholder="±증감치" 
                  style={{ width: '100px' }} 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('btnApplyTotalPop').click();
                    }
                  }}
                />
                <button id="btnApplyTotalPop" type="button" className="btn btn-sm btn-secondary" onClick={() => {
                  const delta = Number(document.getElementById('totalPopDelta').value) || 0;
                  if (delta === 0) return;
                  const oldTotal = economyData.population?.total || 0;
                  const newTotal = oldTotal + delta;
                  setEconomyData(p => ({
                    ...p,
                    population: {
                      ...p.population,
                      total: newTotal,
                      mobilizable: (p.population?.mobilizable || 0) + (delta * 0.4)
                    }
                  }));
                  document.getElementById('totalPopDelta').value = '';
                }}>적용</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">동원가능 인구</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  className="form-input"
                  value={economyData.population?.mobilizable || 0}
                  onChange={(e) => setEconomyData(p => ({
                    ...p, population: { ...p.population, mobilizable: Number(e.target.value) }
                  }))}
                  style={{ flex: 1 }}
                />
                <input 
                  type="number" 
                  id="mobPopDelta" 
                  className="form-input" 
                  placeholder="±증감치" 
                  style={{ width: '100px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('btnApplyMobPop').click();
                    }
                  }}
                />
                <button id="btnApplyMobPop" type="button" className="btn btn-sm btn-secondary" onClick={() => {
                  const delta = Number(document.getElementById('mobPopDelta').value) || 0;
                  if (delta === 0) return;
                  setEconomyData(p => ({
                    ...p, population: { ...p.population, mobilizable: (p.population?.mobilizable || 0) + delta }
                  }));
                  document.getElementById('mobPopDelta').value = '';
                }}>적용</button>
              </div>
              <small style={{ color: 'var(--text-muted)' }}>초기 1회 40% 산정 후 수동/증감치로 관리</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">인구증가율 (나눌 값)</label>
              <input
                type="number"
                className="form-input"
                value={economyData.population?.growthRate || 0}
                onChange={(e) => setEconomyData(p => ({
                  ...p, population: { ...p.population, growthRate: Number(e.target.value) }
                }))}
              />
              <small style={{ color: 'var(--text-muted)' }}>예: 100 입력 시 매 턴 (해당 인구 / 100) 만큼 증가</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">인구당 식량 소비 배율</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={economyData.food_consumption_mult ?? 1.0}
                onChange={(e) => setEconomyData(p => ({ ...p, food_consumption_mult: parseFloat(e.target.value) || 0 }))}
              />
              <small style={{ color: 'var(--text-muted)' }}>기본값 1.0</small>
            </div>
            <div className="form-group">
              <label className="form-label">인구당 소비재 소비 배율</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={economyData.cg_consumption_mult ?? 1.0}
                onChange={(e) => setEconomyData(p => ({ ...p, cg_consumption_mult: parseFloat(e.target.value) || 0 }))}
              />
              <small style={{ color: 'var(--text-muted)' }}>기본값 1.0</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">GDP ($)</label>
              <input
                type="number"
                className="form-input"
                value={economyData.gdp || 0}
                onChange={(e) => setEconomyData(p => ({ ...p, gdp: Number(e.target.value) }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">세율 (%)</label>
              <input
                type="number"
                className="form-input"
                value={economyData.taxRate || 0}
                onChange={(e) => setEconomyData(p => ({ ...p, taxRate: Number(e.target.value) }))}
              />
              <small style={{ color: 'var(--text-muted)' }}>예산 = GDP × (세율/100)</small>
            </div>
            <div className="form-group">
              <label className="form-label">연구 슬롯 (동시 진행 가능 개수)</label>
              <input
                type="number"
                className="form-input"
                value={economyData.researchSlots ?? 1}
                onChange={(e) => setEconomyData(p => ({ ...p, researchSlots: Number(e.target.value) }))}
              />
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">상업 코인 부여 (턴 종료 시 소비되며, 개당 GDP 1% 영구 상승)</label>
            <input
              type="number"
              step="0.1"
              className="form-input"
              value={economyData.commerceCoins || 0}
              onChange={(e) => setEconomyData(p => ({ ...p, commerceCoins: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="admin-form-section">
          <h3 className="admin-form-title">⚙️ 국가별 생산 배율</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            기본값은 1입니다. (예: 1.5로 설정 시 기존 생산량의 1.5배 증가)
          </p>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">조선력 배율</label>
              <input type="number" step="0.1" className="form-input" value={economyData.multipliers?.shipbuilding ?? 1} onChange={e => setEconomyData(p => ({ ...p, multipliers: { ...(p.multipliers || {}), shipbuilding: Number(e.target.value) } }))} />
            </div>
            <div className="form-group">
              <label className="form-label">식량 생산력 배율</label>
              <input type="number" step="0.1" className="form-input" value={economyData.multipliers?.food ?? 1} onChange={e => setEconomyData(p => ({ ...p, multipliers: { ...(p.multipliers || {}), food: Number(e.target.value) } }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">중공업 배율</label>
              <input type="number" step="0.1" className="form-input" value={economyData.multipliers?.heavyIndustry ?? 1} onChange={e => setEconomyData(p => ({ ...p, multipliers: { ...(p.multipliers || {}), heavyIndustry: Number(e.target.value) } }))} />
            </div>
            <div className="form-group">
              <label className="form-label">소비재 배율</label>
              <input type="number" step="0.1" className="form-input" value={economyData.multipliers?.consumerGoods ?? 1} onChange={e => setEconomyData(p => ({ ...p, multipliers: { ...(p.multipliers || {}), consumerGoods: Number(e.target.value) } }))} />
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <h3 className="admin-form-title">📊 비예산 배분율 설정</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            비예산 = GDP - 예산. 배분율 총합은 100% 여야 합니다. (현재 합계: {((economyData.allocation?.mining||0) + (economyData.allocation?.agriculture||0) + (economyData.allocation?.commerce||0) + (economyData.allocation?.lightIndustry||0))}%)
          </p>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">광업 (%)</label>
              <input type="number" className="form-input" value={economyData.allocation?.mining || 0} onChange={e => setEconomyData(p => ({ ...p, allocation: { ...p.allocation, mining: Number(e.target.value) } }))} />
            </div>
            <div className="form-group">
              <label className="form-label">농수산업 (%)</label>
              <input type="number" className="form-input" value={economyData.allocation?.agriculture || 0} onChange={e => setEconomyData(p => ({ ...p, allocation: { ...p.allocation, agriculture: Number(e.target.value) } }))} />
            </div>
            <div className="form-group">
              <label className="form-label">상업 (%)</label>
              <input type="number" className="form-input" value={economyData.allocation?.commerce || 0} onChange={e => setEconomyData(p => ({ ...p, allocation: { ...p.allocation, commerce: Number(e.target.value) } }))} />
            </div>
            <div className="form-group">
              <label className="form-label">경공업 (%)</label>
              <input type="number" className="form-input" value={economyData.allocation?.lightIndustry || 0} onChange={e => setEconomyData(p => ({ ...p, allocation: { ...p.allocation, lightIndustry: Number(e.target.value) } }))} />
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <h3 className="admin-form-title">🏭 보유 산업 단지 (영구 자산)</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">중공업단지 (공업력)</label>
              <input type="number" className="form-input" value={economyData.heavyIndustryComplexes || 0} onChange={e => setEconomyData(p => ({ ...p, heavyIndustryComplexes: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">조선소 (조선력)</label>
              <input type="number" className="form-input" value={economyData.shipyards || 0} onChange={e => setEconomyData(p => ({ ...p, shipyards: Number(e.target.value) }))} />
            </div>
          </div>
        </div>

        {renderCustomFields(economyData, setEconomyData)}

        <button className="btn btn-primary" onClick={() => handleSaveCountryData('economy', economyData)}>
          💾 경제 정보 저장
        </button>

        {economyEntry && <ImageSection imgs={economyImages} entryId={economyEntry.id} />}
      </div>
    );
  };

  const renderTextEditor = (category, data, setData, entry, imgs) => (
    <div className="slide-up">
      <div className="form-group">
        <label className="form-label">
          {category === 'social' ? '📢 사회문제' : '🤝 외교관계'} 내용
        </label>
        <textarea
          className="form-textarea"
          value={data.content || ''}
          onChange={(e) => setData((p) => ({ ...p, content: e.target.value }))}
          placeholder="내용을 입력하세요..."
          style={{ minHeight: '250px' }}
        />
      </div>

      {renderCustomFields(data, setData)}

      <button className="btn btn-primary" onClick={() => handleSaveCountryData(category, data)}>
        💾 저장
      </button>

      {entry && <ImageSection imgs={imgs} entryId={entry.id} />}
    </div>
  );

  const renderCustomFields = (data, setData) => (
    <div className="admin-form-section">
      <h3 className="admin-form-title">
        📋 커스텀 필드
        <span className="badge badge-accent" style={{ marginLeft: '8px' }}>
          {(data.customFields || []).length}개
        </span>
      </h3>
      {(data.customFields || []).map((field, idx) => (
        <div key={idx} className="card" style={{ padding: '16px', marginBottom: '12px' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">항목명</label>
              <input
                className="form-input"
                value={field.label || ''}
                onChange={(e) => {
                  const fields = [...(data.customFields || [])];
                  fields[idx] = { ...fields[idx], label: e.target.value };
                  setData((p) => ({ ...p, customFields: fields }));
                }}
                placeholder="항목 이름"
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">설명/내용</label>
              <textarea
                className="form-textarea"
                value={field.value || ''}
                onChange={(e) => {
                  const fields = [...(data.customFields || [])];
                  fields[idx] = { ...fields[idx], value: e.target.value };
                  setData((p) => ({ ...p, customFields: fields }));
                }}
                placeholder="마크다운 호환"
                style={{ minHeight: '60px' }}
              />
            </div>
          </div>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">이미지 URL (선택)</label>
              <input
                className="form-input"
                value={field.image || ''}
                onChange={(e) => {
                  const fields = [...(data.customFields || [])];
                  fields[idx] = { ...fields[idx], image: e.target.value };
                  setData((p) => ({ ...p, customFields: fields }));
                }}
                placeholder="이미지 URL"
              />
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => {
              setData((p) => ({
                ...p,
                customFields: (p.customFields || []).filter((_, i) => i !== idx),
              }));
            }}>✕ 삭제</button>
          </div>
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" onClick={() => {
        setData((p) => ({
          ...p,
          customFields: [...(p.customFields || []), { label: '', value: '' }],
        }));
      }}>➕ 필드 추가</button>
    </div>
  );

  const renderAdminResearchEditor = () => {
    return (
      <div className="slide-up">
        <div className="admin-form-section">
          <h3 className="admin-form-title">🔬 국가별 연구 직접 관리</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>기술(중분류) 이름을 검색/선택하고 해당 연구의 완료 단계를 직접 설정합니다.</p>
          
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">기술 검색 (중분류명)</label>
                <input type="text" id="adminTechName" className="form-input" list="adminTechList" placeholder="기술 이름 입력" />
                <datalist id="adminTechList">
                  {(techTrees || []).map(t => (
                    <option key={t.id} value={t.name}>{t.category} - {t.name}</option>
                  ))}
                </datalist>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">단계 (Level)</label>
                <input type="number" id="adminTechLevel" className="form-input" placeholder="예: 3" min="0" />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" onClick={async () => {
                  const techName = document.getElementById('adminTechName').value;
                  const level = parseInt(document.getElementById('adminTechLevel').value);
                  if (!techName || isNaN(level) || level < 0) return alert('올바른 기술명과 단계를 입력하세요.');
                  
                  const tree = (techTrees || []).find(t => t.name === techName);
                  if (!tree) return alert('존재하지 않는 기술 이름입니다.');
                  
                  if (!confirm(`'${techName}' 기술을 ${level}단계로 설정하시겠습니까?`)) return;
                  
                  const existingRes = researches.find(r => r.name === techName);
                  if (level === 0) {
                    if (existingRes) await deleteResearch(existingRes.id);
                  } else {
                    if (existingRes) {
                      await updateResearch(existingRes.id, { level, status: 'completed', remaining_turns: 0 });
                    } else {
                      await createResearch({
                        country_id: selectedCountryId,
                        category: tree.category,
                        name: techName,
                        level,
                        required_turns: 0,
                        remaining_turns: 0,
                        status: 'completed'
                      });
                    }
                  }
                  
                  alert('연구가 업데이트되었습니다.');
                  loadCountryData(selectedCountryId); // reload
                }}>💾 연구 적용</button>
              </div>
            </div>
          </div>
          
          <h4 style={{ marginBottom: '12px' }}>현재 완료된 연구 목록</h4>
          {researches.filter(r => r.status === 'completed').length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>완료된 연구가 없습니다.</p>
          ) : (
            <div className="card-grid card-grid-3">
              {researches.filter(r => r.status === 'completed').map(r => (
                <div key={r.id} className="card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="badge badge-accent" style={{ marginRight: '8px' }}>{r.category || '기타'}</span>
                    <strong>{r.name}</strong> (Lv.{r.level})
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => {
                    document.getElementById('adminTechName').value = r.name;
                    document.getElementById('adminTechLevel').value = r.level;
                  }}>수정</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAdminMilitaryEditor = () => {
    return (
      <div className="slide-up">
        <div className="admin-form-section">
          <h3 className="admin-form-title">⚔️ 국가별 무기/유닛 직접 관리</h3>
          
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '16px' }}>🔫 무기 보유량 조절</h4>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">무기 검색 (청사진 이름)</label>
                <input type="text" id="adminWeaponName" className="form-input" list="adminWeaponList" placeholder="무기 이름 입력" />
                <datalist id="adminWeaponList">
                  {(Array.isArray(weaponBlueprints) ? weaponBlueprints : []).map(bp => (
                    <option key={bp.id} value={bp.name}>{bp.techCategory} - {bp.name}</option>
                  ))}
                </datalist>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">수량 직접입력</label>
                <input type="number" id="adminWeaponAmount" className="form-input" placeholder="예: 10000" min="0" />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" onClick={async () => {
                  const name = document.getElementById('adminWeaponName').value;
                  const amount = parseInt(document.getElementById('adminWeaponAmount').value);
                  if (!name || isNaN(amount) || amount < 0) return alert('올바른 무기명과 수량을 입력하세요.');
                  
                  if (!confirm(`'${name}' 무기의 보유량을 ${amount.toLocaleString()}개로 설정하시겠습니까? (기존 수량은 덮어씌워집니다.)`)) return;
                  
                  const resourceType = `weapon:${name}`;
                  const existingRes = resources.find(r => r.resource_type === resourceType);
                  const prod = existingRes ? Number(existingRes.production_per_turn) : 0;
                  
                  await upsertResource(selectedCountryId, resourceType, amount, prod);
                  alert('무기 수량이 업데이트되었습니다.');
                  loadCountryData(selectedCountryId);
                }}>💾 무기 적용</button>
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <h5 style={{ marginBottom: '8px' }}>현재 보유 무기</h5>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {resources.filter(r => r.resource_type.startsWith('weapon:')).map(r => {
                  const wName = r.resource_type.replace('weapon:', '');
                  return (
                    <span key={r.id} className="badge" style={{ padding: '8px', cursor: 'pointer' }} onClick={() => {
                      document.getElementById('adminWeaponName').value = wName;
                      document.getElementById('adminWeaponAmount').value = r.amount;
                    }}>
                      {wName}: {Number(r.amount).toLocaleString()}개
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <h4 style={{ marginBottom: '16px' }}>🎖️ 유닛(부대) 보유량 조절</h4>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">유닛 템플릿 검색</label>
                <input type="text" id="adminUnitName" className="form-input" list="adminUnitList" placeholder="유닛 이름 입력" />
                <datalist id="adminUnitList">
                  {unitTemplates.map(t => (
                    <option key={t.id} value={t.name}>{t.majorCategory} - {t.name}</option>
                  ))}
                </datalist>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">총 부대 수</label>
                <input type="number" id="adminUnitAmount" className="form-input" placeholder="예: 10" min="0" />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" onClick={async () => {
                  const name = document.getElementById('adminUnitName').value;
                  const count = parseInt(document.getElementById('adminUnitAmount').value);
                  if (!name || isNaN(count) || count < 0) return alert('올바른 유닛명과 수량을 입력하세요.');
                  
                  const tmpl = unitTemplates.find(t => t.name === name);
                  if (!tmpl) return alert('존재하지 않는 템플릿입니다.');
                  
                  if (!confirm(`'${name}' 유닛의 총 개수를 ${count}개로 설정하시겠습니까? (기존 데이터 덮어쓰기)`)) return;
                  
                  let newUnits = [...militaryUnits];
                  const existingIdx = newUnits.findIndex(u => u.templateId === tmpl.id || u.name === name);
                  
                  if (count === 0) {
                    if (existingIdx !== -1) newUnits.splice(existingIdx, 1);
                  } else {
                    if (existingIdx !== -1) {
                      newUnits[existingIdx].count = count;
                      newUnits[existingIdx].operational = Math.min(newUnits[existingIdx].operational, count);
                    } else {
                      newUnits.push({
                        id: Date.now().toString(),
                        templateId: tmpl.id,
                        name: tmpl.name,
                        count: count,
                        operational: count
                      });
                    }
                  }
                  
                  await upsertDataEntry('military_units', selectedCountryId, { units: newUnits });
                  alert('유닛 수량이 업데이트되었습니다.');
                  loadCountryData(selectedCountryId);
                }}>💾 유닛 적용</button>
              </div>
            </div>
            
            <div style={{ marginTop: '16px' }}>
              <h5 style={{ marginBottom: '8px' }}>현재 보유 부대</h5>
              <div className="card-grid card-grid-3">
                {militaryUnits.map(u => (
                  <div key={u.id} className="card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{u.name}</strong> 
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>가동: {u.operational} / 총: {u.count}</div>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => {
                      document.getElementById('adminUnitName').value = u.name;
                      document.getElementById('adminUnitAmount').value = u.count;
                    }}>수정</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  const RenderBlueprintsInner = () => (
    <div className="fade-in">
      <h2>🛠️ 무기 청사진(설계도) 관리</h2>
      <p style={{ color: 'var(--text-muted)' }}>유저가 무기를 생산할 수 있도록 필요 기술, 요구 공업력 등을 설정합니다.</p>
      
      <div className="card" style={{ padding: '20px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>{editingBlueprintId ? '청사진 수정' : '새 청사진 추가'}</h4>
          {editingBlueprintId && (
            <button className="btn btn-sm" onClick={() => {
              setEditingBlueprintId(null);
              document.getElementById('newBpName').value = '';
              document.getElementById('newBpIndustryCost').value = '1';
              document.getElementById('newBpProductionTurns').value = '1';
              document.getElementById('newBpRes1Name').value = '';
              document.getElementById('newBpRes1Cost').value = '';
              document.getElementById('newBpRes2Name').value = '';
              document.getElementById('newBpRes2Cost').value = '';
            }}>취소</button>
          )}
        </div>
        <div className="form-row" style={{ marginTop: '16px' }}>
          <div className="form-group">
            <label>무기명 (기술명과 동일해야 함)</label>
            <input type="text" id="newBpName" className="form-input" list="bpNameOptions" placeholder="직접 입력하거나 목록에서 검색/선택" />
            <datalist id="bpNameOptions">
              {(Array.isArray(techTrees) ? techTrees : []).flatMap(tree => 
                (Array.isArray(tree.levels) ? tree.levels : []).map(lvl => {
                  const val = lvl.name || `${tree.name} ${lvl.level}단계`;
                  return <option key={`${tree.name}_${lvl.level}`} value={val}>{val}</option>;
                })
              )}
            </datalist>
          </div>
          <div className="form-group">
            <label>요구 기술 분류</label>
            <select id="newBpTechCategory" className="form-select">
              <option value="지상군">지상군</option>
              <option value="해군">해군</option>
              <option value="항공">항공</option>
              <option value="공학">공학</option>
              <option value="화학">화학 (산업)</option>
            </select>
          </div>
          <div className="form-group">
            <label>필요 산업 유형</label>
            <select id="newBpFacility" className="form-select">
              <option value="heavy">중공업단지 (공업력)</option>
              <option value="shipyard">조선소 (조선력)</option>
            </select>
          </div>
          <div className="form-group">
            <label>필요 산업력</label>
            <input type="number" id="newBpIndustryCost" className="form-input" placeholder="1" defaultValue="1" step="0.1" />
          </div>
          <div className="form-group">
            <label>생산소모턴수</label>
            <input type="number" id="newBpProductionTurns" className="form-input" placeholder="1" defaultValue="1" min="1" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>소모 자원 1 (종류/개수)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select id="newBpRes1Name" className="form-select">
                <option value="">-- 자원 선택 --</option>
                <option value="steel">강철</option>
                <option value="oil">석유</option>
                <option value="wood">목재</option>
                <option value="coal">석탄</option>
                <option value="chromium">크롬</option>
                <option value="tungsten">텅스텐</option>
                <option value="aluminum">알루미늄</option>
                <option value="rubber">고무</option>
                <option value="sulfur">유황</option>
              </select>
              <input type="number" id="newBpRes1Cost" className="form-input" placeholder="수량" step="0.1" />
            </div>
          </div>
          <div className="form-group">
            <label>소모 자원 2 (종류/개수)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select id="newBpRes2Name" className="form-select">
                <option value="">-- 자원 선택 --</option>
                <option value="steel">강철</option>
                <option value="oil">석유</option>
                <option value="wood">목재</option>
                <option value="coal">석탄</option>
                <option value="chromium">크롬</option>
                <option value="tungsten">텅스텐</option>
                <option value="aluminum">알루미늄</option>
                <option value="rubber">고무</option>
                <option value="sulfur">유황</option>
              </select>
              <input type="number" id="newBpRes2Cost" className="form-input" placeholder="수량" step="0.1" />
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => {
          const name = document.getElementById('newBpName').value;
          const cat = document.getElementById('newBpTechCategory').value;
          const facility = document.getElementById('newBpFacility').value;
          const indCost = parseFloat(document.getElementById('newBpIndustryCost').value) || 1;
          const r1n = document.getElementById('newBpRes1Name').value;
          const r1c = parseFloat(document.getElementById('newBpRes1Cost').value) || 0;
          const r2n = document.getElementById('newBpRes2Name').value;
          const r2c = parseFloat(document.getElementById('newBpRes2Cost').value) || 0;
          
          if (!name) return showToast('무기명을 입력하세요.', 'error');
          
          const resources = {};
          if (r1n && r1c > 0) resources[r1n] = r1c;
          if (r2n && r2c > 0) resources[r2n] = r2c;
          
          const newBp = {
            id: editingBlueprintId || Date.now().toString(),
            name,
            techCategory: cat,
            facility,
            industryCost: indCost,
            productionTurns: parseInt(document.getElementById('newBpProductionTurns')?.value) || 1,
            resources
          };
          
          if (editingBlueprintId) {
            const updated = (Array.isArray(weaponBlueprints) ? weaponBlueprints : []).map(b => b.id === editingBlueprintId ? newBp : b);
            saveGameSettings({ weaponBlueprints: updated });
            setEditingBlueprintId(null);
          } else {
            saveGameSettings({ weaponBlueprints: [...(Array.isArray(weaponBlueprints) ? weaponBlueprints : []), newBp] });
          }
          
          document.getElementById('newBpName').value = '';
          document.getElementById('newBpIndustryCost').value = '1';
          document.getElementById('newBpProductionTurns').value = '1';
          document.getElementById('newBpRes1Name').value = '';
          document.getElementById('newBpRes1Cost').value = '';
          document.getElementById('newBpRes2Name').value = '';
          document.getElementById('newBpRes2Cost').value = '';
        }}>➕ {editingBlueprintId ? '청사진 수정 완료' : '청사진 추가'}</button>
      </div>

      {['지상군', '해군', '항공', '공학', '화학'].map(cat => {
        const bps = (Array.isArray(weaponBlueprints) ? weaponBlueprints : []).filter(bp => bp && bp.techCategory === cat);
        if (bps.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: '24px' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>{cat} 청사진</h3>
            <div className="card-grid card-grid-3">
              {bps.map((bp) => (
                <div key={bp.id} className="card" style={{ padding: '16px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent)' }}>{bp.name}</h4>
                  <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                    <div><strong>생산 시설:</strong> {bp.facility === 'heavy' ? '중공업단지' : '조선소'} ({bp.industryCost})</div>
                    <div><strong>생산소모턴수:</strong> {bp.productionTurns || 1}턴</div>
                    <div>
                      <strong>필요 자원:</strong> 
                      {Object.keys(bp.resources || {}).length > 0 
                        ? Object.entries(bp.resources || {}).map(([k, v]) => ` ${k}(${v})`).join(',')
                        : ' 없음'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => {
                      document.getElementById('newBpName').value = bp.name || '';
                      document.getElementById('newBpTechCategory').value = bp.techCategory || '지상군';
                      document.getElementById('newBpFacility').value = bp.facility || 'heavy';
                      document.getElementById('newBpIndustryCost').value = bp.industryCost || '1';
                      document.getElementById('newBpProductionTurns').value = bp.productionTurns || '1';
                      const resKeys = Object.keys(bp.resources || {});
                      document.getElementById('newBpRes1Name').value = resKeys[0] || '';
                      document.getElementById('newBpRes1Cost').value = bp.resources?.[resKeys[0]] || '';
                      document.getElementById('newBpRes2Name').value = resKeys[1] || '';
                      document.getElementById('newBpRes2Cost').value = bp.resources?.[resKeys[1]] || '';
                      setEditingBlueprintId(bp.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => {
                      if(!confirm('정말 삭제하시겠습니까?')) return;
                      saveGameSettings({ weaponBlueprints: (Array.isArray(weaponBlueprints) ? weaponBlueprints : []).filter(b => b.id !== bp.id) });
                    }}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!(Array.isArray(weaponBlueprints) && (Array.isArray(weaponBlueprints) ? weaponBlueprints : []).length > 0) && <p>등록된 청사진이 없습니다.</p>}
    </div>
  );
  const renderUnitTemplates = () => {
    const majorCategories = ['육군', '해군', '공군', '특수'];
    const minorCategoryMap = {
      '육군': ['기계화', '보병', '포병', '특전사', '산악부대', '해병대', '공수부대'],
      '해군': ['항공모함', '전함', '어뢰정', '기뢰함', '잠수함'],
      '공군': ['전투기', '뇌격기', '근접항공지원기', '폭격기'],
      '특수': ['미사일', '핵무기', '독가스', 'EMP']
    };
    const fuelTypes = [
      { value: 'none', label: '없음' },
      { value: 'oil', label: '석유' },
      { value: 'coal', label: '석탄' },
      { value: 'wood', label: '목재' }
    ];

    // 무기 이름 목록 (기존 청사진에서 추출)
    const availableWeapons = (Array.isArray(weaponBlueprints) ? weaponBlueprints : []).map(bp => bp.name).filter(Boolean);

    return (
      <div className="fade-in">
        <h2>🎖️ 편제 유닛 템플릿 관리</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>유저가 무기와 인력을 소모하여 편성할 수 있는 유닛(부대)의 종류를 정의합니다.</p>

        {/* 새 템플릿 생성 폼 */}
        <div className="card" style={{ padding: '20px', marginBottom: '24px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4>{editingUnitId ? '유닛 템플릿 수정' : '➕ 새 유닛 템플릿 추가'}</h4>
            {editingUnitId && (
              <button className="btn btn-sm" onClick={() => {
                setEditingUnitId(null);
                document.getElementById('newUnitName').value = '';
                document.getElementById('newUnitWeapons').value = '';
                document.getElementById('newUnitImage').value = '';
              }}>취소</button>
            )}
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>부대 이름 (소분류)</label>
              <input type="text" id="newUnitName" className="form-input" placeholder="예: 1936년형 보병사단" />
            </div>
            <div className="form-group">
              <label>대분류</label>
              <select id="newUnitMajor" className="form-select" onChange={() => {
                const val = document.getElementById('newUnitMajor').value;
                const minorSel = document.getElementById('newUnitMinor');
                minorSel.innerHTML = '';
                (minorCategoryMap[val] || []).forEach(m => {
                  const opt = document.createElement('option');
                  opt.value = m; opt.textContent = m;
                  minorSel.appendChild(opt);
                });
              }}>
                {majorCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>중분류</label>
              <select id="newUnitMinor" className="form-select">
                {minorCategoryMap['육군'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group"><label>방어력</label><input type="number" id="newUnitDef" className="form-input" defaultValue="0" /></div>
            <div className="form-group"><label>속도</label><input type="number" id="newUnitSpd" className="form-input" defaultValue="0" /></div>
            <div className="form-group"><label>공격력</label><input type="number" id="newUnitAtk" className="form-input" defaultValue="0" /></div>
            <div className="form-group"><label>체력</label><input type="number" id="newUnitHp" className="form-input" defaultValue="100" /></div>
            <div className="form-group"><label>전장너비</label><input type="number" id="newUnitWidth" className="form-input" defaultValue="1" /></div>
          </div>

          <div className="form-row">
            <div className="form-group"><label>소모칸수 (해군)</label><input type="number" id="newUnitSlot" className="form-input" defaultValue="0" /></div>
            <div className="form-group"><label>함재기수 (항모)</label><input type="number" id="newUnitCarrier" className="form-input" defaultValue="0" /></div>
            <div className="form-group"><label>효과유효턴수 (특수)</label><input type="number" id="newUnitEffDur" className="form-input" defaultValue="0" /></div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>소모인력 (동원가능인구 차감)</label>
              <input type="number" id="newUnitManpower" className="form-input" defaultValue="0" />
            </div>
            <div className="form-group">
              <label>소모연료 종류</label>
              <select id="newUnitFuelType" className="form-select">
                {fuelTypes.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>턴당 연료소모량 (유닛 1개당)</label>
              <input type="number" id="newUnitFuelAmt" className="form-input" defaultValue="0" />
            </div>
            <div className="form-group">
              <label>보급소모</label>
              <input type="number" id="newUnitSupply" className="form-input" defaultValue="0" />
            </div>
          </div>

          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>유닛 이미지 URL (선택)</label>
              <input type="text" id="newUnitImage" className="form-input" placeholder="https://..." />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>소모군수품 (무기이름:수량, 콤마 구분)</label>
              <input type="text" id="newUnitWeapons" className="form-input" placeholder="예: 소총:100,기관총:10" />
              <small style={{ color: 'var(--text-muted)' }}>등록된 무기: {availableWeapons.join(', ') || '없음'}</small>
            </div>
          </div>

          <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => {
            const name = document.getElementById('newUnitName').value;
            if (!name) return showToast('부대 이름을 입력하세요.', 'error');

            // 소모군수품 파싱
            const weaponsRaw = document.getElementById('newUnitWeapons').value;
            const requiredWeapons = [];
            if (weaponsRaw.trim()) {
              weaponsRaw.split(',').forEach(pair => {
                const [wName, wAmt] = pair.trim().split(':');
                if (wName && wAmt) requiredWeapons.push({ weaponName: wName.trim(), amount: parseInt(wAmt) || 0 });
              });
            }

            const newTemplate = {
              id: editingUnitId || Date.now().toString(),
              name,
              majorCategory: document.getElementById('newUnitMajor').value,
              minorCategory: document.getElementById('newUnitMinor').value,
              defense: parseInt(document.getElementById('newUnitDef').value) || 0,
              speed: parseInt(document.getElementById('newUnitSpd').value) || 0,
              attack: parseInt(document.getElementById('newUnitAtk').value) || 0,
              hp: parseInt(document.getElementById('newUnitHp').value) || 100,
              combatWidth: parseInt(document.getElementById('newUnitWidth').value) || 1,
              slotSize: parseInt(document.getElementById('newUnitSlot').value) || 0,
              carrierCapacity: parseInt(document.getElementById('newUnitCarrier').value) || 0,
              effectDuration: parseInt(document.getElementById('newUnitEffDur').value) || 0,
              requiredWeapons,
              manpowerCost: parseInt(document.getElementById('newUnitManpower').value) || 0,
              fuelType: document.getElementById('newUnitFuelType').value,
              fuelPerTurn: parseInt(document.getElementById('newUnitFuelAmt').value) || 0,
              supplyConsumption: parseInt(document.getElementById('newUnitSupply').value) || 0,
              image: document.getElementById('newUnitImage').value || '',
            };

            if (editingUnitId) {
              const updated = unitTemplates.map(t => t.id === editingUnitId ? newTemplate : t);
              saveGameSettings({ unitTemplates: updated });
              setEditingUnitId(null);
            } else {
              saveGameSettings({ unitTemplates: [...unitTemplates, newTemplate] });
            }
            
            document.getElementById('newUnitName').value = '';
            document.getElementById('newUnitWeapons').value = '';
            document.getElementById('newUnitImage').value = '';
          }}>➕ {editingUnitId ? '템플릿 수정 완료' : '유닛 템플릿 추가'}</button>
        </div>

        {/* 등록된 템플릿 목록 */}
        <div>
          {unitTemplates.length === 0 && <p>등록된 유닛 템플릿이 없습니다.</p>}
          {majorCategories.map(major => {
            const majorUnits = unitTemplates.filter(t => t.majorCategory === major);
            if (majorUnits.length === 0) return null;
            return (
              <div key={major} style={{ marginBottom: '32px' }}>
                <h3 style={{ borderBottom: '2px solid var(--accent)', paddingBottom: '8px', marginBottom: '16px' }}>{major} 템플릿</h3>
                {(minorCategoryMap[major] || []).map(minor => {
                  const minorUnits = majorUnits.filter(t => t.minorCategory === minor);
                  if (minorUnits.length === 0) return null;
                  return (
                    <div key={minor} style={{ marginBottom: '20px', marginLeft: '16px' }}>
                      <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '12px', color: 'var(--text-muted)' }}>{minor}</h4>
                      <div className="card-grid card-grid-2">
                        {minorUnits.map(tmpl => (
                          <div key={tmpl.id} className="card" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                {tmpl.image && (
                                  <img src={tmpl.image} alt={tmpl.name} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                                )}
                                <div>
                                  <span className="badge badge-accent" style={{ marginRight: '6px' }}>{tmpl.majorCategory}</span>
                                  <span className="badge" style={{ marginRight: '6px' }}>{tmpl.minorCategory}</span>
                                  <h4 style={{ margin: '4px 0 0', color: 'var(--accent)' }}>{tmpl.name}</h4>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-sm btn-ghost" onClick={() => {
                                  document.getElementById('newUnitName').value = tmpl.name || '';
                                  document.getElementById('newUnitMajor').value = tmpl.majorCategory || '육군';
                                  const minorSel = document.getElementById('newUnitMinor');
                                  minorSel.innerHTML = '';
                                  (minorCategoryMap[tmpl.majorCategory || '육군'] || []).forEach(m => {
                                    const opt = document.createElement('option');
                                    opt.value = m; opt.textContent = m;
                                    minorSel.appendChild(opt);
                                  });
                                  minorSel.value = tmpl.minorCategory || '';
                                  document.getElementById('newUnitDef').value = tmpl.defense || 0;
                                  document.getElementById('newUnitSpd').value = tmpl.speed || 0;
                                  document.getElementById('newUnitAtk').value = tmpl.attack || 0;
                                  document.getElementById('newUnitHp').value = tmpl.hp || 100;
                                  document.getElementById('newUnitWidth').value = tmpl.combatWidth || 1;
                                  document.getElementById('newUnitSlot').value = tmpl.slotSize || 0;
                                  document.getElementById('newUnitCarrier').value = tmpl.carrierCapacity || 0;
                                  document.getElementById('newUnitEffDur').value = tmpl.effectDuration || 0;
                                  document.getElementById('newUnitManpower').value = tmpl.manpowerCost || 0;
                                  document.getElementById('newUnitFuelType').value = tmpl.fuelType || 'none';
                                  document.getElementById('newUnitFuelAmt').value = tmpl.fuelPerTurn || 0;
                                  document.getElementById('newUnitSupply').value = tmpl.supplyConsumption || 0;
                                  document.getElementById('newUnitImage').value = tmpl.image || '';
                                  document.getElementById('newUnitWeapons').value = (tmpl.requiredWeapons || []).map(w => `${w.weaponName}:${w.amount}`).join(',');
                                  setEditingUnitId(tmpl.id);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}>수정</button>
                                <button className="btn btn-sm btn-danger" onClick={() => {
                                  if (!confirm('이 유닛 템플릿을 삭제하시겠습니까?')) return;
                                  saveGameSettings({ unitTemplates: unitTemplates.filter(t => t.id !== tmpl.id) });
                                }}>삭제</button>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                              <div>⚔️ 공격력: {tmpl.attack}</div>
                              <div>🛡️ 방어력: {tmpl.defense}</div>
                              <div>💨 속도: {tmpl.speed}</div>
                              <div>❤️ 체력: {tmpl.hp}</div>
                              <div>📐 전장너비: {tmpl.combatWidth}</div>
                              <div>👥 소모인력: {tmpl.manpowerCost?.toLocaleString()}</div>
                              <div>⛽ 연료: {tmpl.fuelType === 'none' ? '없음' : `${tmpl.fuelType} (${tmpl.fuelPerTurn}/턴)`}</div>
                              {tmpl.slotSize > 0 && <div>🚢 소모칸수: {tmpl.slotSize}</div>}
                              {tmpl.carrierCapacity > 0 && <div>✈️ 함재기: {tmpl.carrierCapacity}</div>}
                              {tmpl.effectDuration > 0 && <div>⏱️ 효과턴수: {tmpl.effectDuration}</div>}
                            </div>
                            {tmpl.requiredWeapons?.length > 0 && (
                              <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                🔧 소모군수품: {tmpl.requiredWeapons.map(w => `${w.weaponName}×${w.amount}`).join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAerialSession = () => {
    if (!selectedCountryId) {
      return <p style={{color: 'var(--text-muted)'}}>국가를 선택해주세요.</p>;
    }

    return (
      <div className="fade-in">
        <h2>✈️ 공중전 세션 설정</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
          각 국가별 공중전에서 사용할 전투기 유닛과 보급 한계를 설정합니다.
        </p>

        <div className="card" style={{ padding: '20px', marginBottom: '24px', border: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '16px' }}>🛩️ 공중전 세션 초기화</h4>
          
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>보급 한계 (총 보급량)</label>
              <input
                type="number"
                className="form-input"
                value={aerialSessionForm.supplyLimit}
                onChange={(e) => setAerialSessionForm(p => ({...p, supplyLimit: parseInt(e.target.value) || 0}))}
                placeholder="예: 1000"
              />
              <small style={{ color: 'var(--text-muted)' }}>
                이 수치를 초과하면 모든 전투기 능력치가 50%로 감소합니다.
              </small>
            </div>
          </div>

          <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={async () => {
            if (!selectedCountryId) {
              showToast('국가를 선택해주세요.', 'error');
              return;
            }

            try {
              // 현재 국가의 전투기 유닛 정보 가져오기 (economy에서)
              const ecoEntry = await getDataEntry('economy', selectedCountryId);
              const aircraftUnits = []; // TODO: unitTemplates 중 공군 전투기만 선택

              const session = createAerialCombatSession(
                selectedCountryId,
                aircraftUnits,
                aerialSessionForm.supplyLimit
              );

              await saveAerialCombatSession(selectedCountryId, session);
              showToast('공중전 세션이 초기화되었습니다.', 'success');
            } catch (err) {
              console.error(err);
              showToast('공중전 세션 초기화 실패', 'error');
            }
          }}>초기화</button>
        </div>

        {/* 테스트 플레이 UI */}
        <div style={{ marginTop: '32px', borderTop: '2px solid var(--border-color)', paddingTop: '24px' }}>
          <h3>🎮 테스트 플레이 (AI 상대)</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
            AI 상대와 공중전을 테스트할 수 있습니다.
          </p>

          {!testAerialGame ? (
            <button 
              className="btn btn-success"
              onClick={async () => {
                try {
                  // 전투기 유닛 더미 생성 (테스트용)
                  const testUnits = [
                    { id: 'fighter1', speed: 3, quantity: 5, supplyConsumption: 10, image: 'https://images.unsplash.com/photo-1542382257-80da358a9c39?w=300' },
                    { id: 'fighter2', speed: 2, quantity: 15, supplyConsumption: 15, image: 'https://images.unsplash.com/photo-1629838031359-577ba613b5fb?w=300' },
                    { id: 'fighter3', speed: 4, quantity: 5, supplyConsumption: 12, image: 'https://images.unsplash.com/photo-1559160581-4471b87a8bba?w=300' }
                  ];

                  const playerSession = createAerialCombatSession(selectedCountryId, testUnits, aerialSessionForm.supplyLimit);
                  const aiSession = createAerialCombatSession('ai_opponent', testUnits, aerialSessionForm.supplyLimit);

                  setTestAerialGame({
                    player: playerSession,
                    ai: aiSession,
                    round: 0,
                    gameStatus: 'playing' // 'playing', 'finished'
                  });
                  setTestGameLog([{ type: 'start', message: '공중전 시작!' }]);
                  showToast('테스트 게임이 시작되었습니다.', 'success');
                } catch (err) {
                  console.error(err);
                  showToast('테스트 게임 시작 실패', 'error');
                }
              }}
            >
              🎮 테스트 게임 시작
            </button>
          ) : (
            <div className="card" style={{ padding: '20px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* 플레이어 상태 */}
                <div style={{ border: '1px solid var(--border-color)', padding: '12px', borderRadius: '4px' }}>
                  <h4>👤 플레이어</h4>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <div>패 남음: {testAerialGame.player?.hand?.length || 0}</div>
                    <div>손실: {testAerialGame.player?.lost?.length || 0}</div>
                    <div>에이스: {testAerialGame.player?.aceCount || 0}</div>
                    <div>대공포: {testAerialGame.player?.antiAircraft?.length || 0}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '10px 0', marginTop: '10px' }}>
                    {testAerialGame.player?.hand?.map(c => <AerialCardUI key={c.cardId} card={c} />)}
                    {testAerialGame.player?.antiAircraft?.filter(c => c.status === 'hand').map(c => <AerialCardUI key={c.cardId} card={c} />)}
                  </div>
                </div>

                {/* AI 상태 */}
                <div style={{ border: '1px solid var(--primary)', padding: '12px', borderRadius: '4px', backgroundColor: 'rgba(124, 107, 240, 0.1)' }}>
                  <h4>🤖 AI</h4>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <div>패 남음: {testAerialGame.ai?.hand?.length || 0}</div>
                    <div>손실: {testAerialGame.ai?.lost?.length || 0}</div>
                    <div>에이스: {testAerialGame.ai?.aceCount || 0}</div>
                    <div>대공포: {testAerialGame.ai?.antiAircraft?.length || 0}</div>
                  </div>
                </div>
              </div>

              {/* 카드 선택 UI */}
              <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                <p style={{ marginBottom: '12px' }}>플레이어 선택:</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn btn-sm btn-primary"
                    onClick={async () => {
                      const playerCard = testAerialGame.player.hand[Math.floor(Math.random() * testAerialGame.player.hand.length)];
                      const aiCard = aiChooseCard(testAerialGame.ai, testAerialGame.player);
                      
                      const result = resolveAerialRound(playerCard, aiCard);
                      
                      // 카드 상태 업데이트 (간단한 버전)
                      if (result.attackerLost && playerCard) {
                        testAerialGame.player.hand = testAerialGame.player.hand.filter(c => c.cardId !== playerCard.cardId);
                        testAerialGame.player.lost.push(playerCard);
                      }
                      if (result.defenderLost && aiCard) {
                        testAerialGame.ai.hand = testAerialGame.ai.hand.filter(c => c.cardId !== aiCard.cardId);
                        testAerialGame.ai.lost.push(aiCard);
                      }

                      const log = {
                        type: 'round',
                        round: testAerialGame.round + 1,
                        playerCard: playerCard?.cardId,
                        aiCard: aiCard?.cardId,
                        result: result.description
                      };

                      setTestGameLog([...testGameLog, log]);
                      setTestAerialGame({
                        ...testAerialGame,
                        round: testAerialGame.round + 1,
                        gameStatus: testAerialGame.player.hand.length === 0 || testAerialGame.ai.hand.length === 0 ? 'finished' : 'playing'
                      });
                      showToast(`라운드 ${testAerialGame.round + 1}: ${result.description}`, 'info');
                    }}
                  >
                    🃏 카드 낸다
                  </button>
                  <button 
                    className="btn btn-sm"
                    onClick={() => {
                      const aiCard = aiChooseCard(testAerialGame.ai, testAerialGame.player);
                      const result = resolveAerialRound(null, aiCard);
                      
                      // AI 카드 소모 처리
                      if (result.defenderLost && aiCard) {
                        testAerialGame.ai.hand = testAerialGame.ai.hand.filter(c => c.cardId !== aiCard.cardId);
                        testAerialGame.ai.lost.push(aiCard);
                      }

                      const log = {
                        type: 'round',
                        round: testAerialGame.round + 1,
                        playerCard: null,
                        aiCard: aiCard?.cardId,
                        result: result.description
                      };

                      setTestGameLog([...testGameLog, log]);
                      setTestAerialGame({
                        ...testAerialGame,
                        round: testAerialGame.round + 1
                      });
                      showToast(`라운드 ${testAerialGame.round + 1}: ${result.description}`, 'info');
                    }}
                  >
                    💤 아낀다
                  </button>
                </div>
              </div>

              {/* 게임 로그 */}
              <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '20px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                {testGameLog.map((log, idx) => (
                  <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '4px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                    {log.type === 'start' && <span style={{ color: 'var(--success)' }}>✅ {log.message}</span>}
                    {log.type === 'round' && <span>라운드 {log.round}: {log.result}</span>}
                  </div>
                ))}
              </div>

              {/* 게임 상태 */}
              {testAerialGame.gameStatus === 'finished' && (
                <div style={{ padding: '12px', backgroundColor: 'rgba(255, 193, 7, 0.1)', borderRadius: '4px', marginBottom: '16px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                    🏁 게임 종료: {testAerialGame.player.hand.length > 0 ? '👤 플레이어 승리!' : '🤖 AI 승리!'}
                  </p>
                </div>
              )}

              {/* 종료 버튼 */}
              <button 
                className="btn btn-danger"
                onClick={() => {
                  setTestAerialGame(null);
                  setTestGameLog([]);
                  showToast('테스트 게임이 종료되었습니다.', 'info');
                }}
              >
                🛑 게임 종료
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="slide-up">
      <h2 style={{ marginBottom: '24px' }}>메인 대시보드</h2>
      
      <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '10px' }}>현재 턴</h3>
        <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '20px' }}>
          {gameState?.turn_name || '1턴'}
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          턴을 넘기면 모든 국가의 연구 기한이 감소하고 자원이 생산되며 GDP가 성장합니다.
        </p>
        <button 
          className="btn btn-primary btn-lg" 
          onClick={async () => {
            if(!confirm('정말 턴을 넘기시겠습니까? 진행 중인 모든 프로세스가 갱신됩니다.')) return;
            const newTurn = await advanceGameState();
            await processTurnEnd(newTurn.current_turn);
            loadGameState();
            showToast('턴이 종료되었습니다.');
          }}
          style={{ marginRight: '12px' }}
        >
          ⏭️ 턴 넘기기
        </button>
        <button 
          className="btn btn-secondary btn-lg" 
          onClick={async () => {
            if(!confirm('이전 턴 상태로 롤백하시겠습니까? 최근 넘긴 1개 턴만 롤백 가능합니다.')) return;
            const res = await rollbackTurn();
            if (res.success) {
              loadGameState();
              showToast('이전 턴으로 롤백되었습니다.');
            } else {
              showToast(res.error || '롤백 실패', 'error');
            }
          }}
          style={{ marginRight: '12px' }}
        >
          ↩️ 이전 턴 롤백
        </button>
        <button 
          className="btn btn-danger btn-lg" 
          onClick={async () => {
            if(!confirm('1턴으로 초기화하시겠습니까? 주의: 연구나 자원 등의 다른 데이터는 유지되며 턴 숫자만 1로 변경됩니다.')) return;
            const res = await resetToTurnOne();
            if (res.success) {
              loadGameState();
              showToast('1턴으로 초기화되었습니다.');
            } else {
              showToast(res.error || '초기화 실패', 'error');
            }
          }}
        >
          🔄 1턴으로 초기화
        </button>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="slide-up">
      <h2 style={{ marginBottom: '24px' }}>👥 유저 관리</h2>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID (Username)</th>
              <th>가입일</th>
              <th>역할</th>
              <th>배정 국가</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <select 
                    value={u.role} 
                    onChange={async (e) => {
                      await updateUserRole(u.id, e.target.value);
                      loadUsers();
                      showToast('권한이 변경되었습니다.');
                    }}
                    className="form-select"
                    style={{ padding: '4px', height: 'auto' }}
                  >
                    <option value="user">유저</option>
                    <option value="sub_admin">부관리자</option>
                    <option value="admin">최고관리자</option>
                  </select>
                </td>
                <td>
                  <select
                    value={u.assigned_country_id || ''}
                    onChange={async (e) => {
                      await assignCountryToUser(u.id, e.target.value);
                      loadUsers();
                      showToast('배정 국가가 변경되었습니다.');
                    }}
                    className="form-select"
                    style={{ padding: '4px', height: 'auto' }}
                  >
                    <option value="">-- 없음 --</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderResearch = () => { return <ErrorBoundary><RenderResearchInner /></ErrorBoundary>; };
  const RenderResearchInner = () => {
    const defaultCategories = ['지상군', '해군', '항공', '공학', '산업'];
    const eras = ['선사시대', '고대시대', '중세시대', '근세시대', '대혁명기', '빅토리안시대', '1차대전기', '2차대전기', '냉전기', '현대', '근미래'];
    
    return (
      <div className="slide-up">
        <h2 style={{ marginBottom: '24px' }}>🔬 연구 관리 (기술 트리)</h2>
        
        {/* 글로벌 시대 설정 */}
        <div className="card" style={{ padding: '20px', marginBottom: '24px', border: '1px solid var(--accent)' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', color: 'var(--accent)' }}>🌍 현재 글로벌 시대 설정</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
            유저들은 여기서 설정된 시대(혹은 그 이전 시대)의 기술까지만 연구할 수 있습니다.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              className="form-select"
              value={gameSettingsEntry?.data?.globalEra || '선사시대'}
              onChange={(e) => saveGameSettings({ globalEra: e.target.value })}
              style={{ width: '200px' }}
            >
              {eras.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>* 변경 즉시 모든 유저에게 적용됩니다.</span>
          </div>
        </div>

        {/* 글로벌 기술 트리 에디터 */}
        <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1.2rem' }}>글로벌 기술 트리 편집기</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>모든 국가가 공유하는 기술 항목과 단계(레벨)별 소모 턴 수를 정의합니다.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '20px' }}>
            {defaultCategories.map(cat => {
              const catTrees = (Array.isArray(techTrees) ? techTrees : []).filter(t => t && t.category === cat);
              if (catTrees.length === 0) return null;
              return (
                <div key={cat}>
                  <h3 style={{ borderBottom: '2px solid var(--accent)', paddingBottom: '8px', marginBottom: '16px' }}>{cat} 기술 트리</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {catTrees.map(tree => {
                      const idx = techTrees.findIndex(t => t.id === tree.id);
                      return (
                        <div key={tree.id} className="card" style={{ padding: '16px', background: 'var(--bg-glass)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            {editingTechTreeId === tree.id ? (
                              <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '16px' }}>
                                <select id={`editTreeCategory_${tree.id}`} className="form-select" defaultValue={tree.category}>
                                  {defaultCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input id={`editTreeName_${tree.id}`} className="form-input" defaultValue={tree.name} style={{ flex: 1 }} />
                                <button className="btn btn-sm btn-primary" onClick={() => {
                                  const newCat = document.getElementById(`editTreeCategory_${tree.id}`).value;
                                  const newName = document.getElementById(`editTreeName_${tree.id}`).value;
                                  if (newName) {
                                    const updated = techTrees.map(t => t.id === tree.id ? { ...t, category: newCat, name: newName } : t);
                                    saveGameSettings({ techTrees: updated });
                                    setEditingTechTreeId(null);
                                  }
                                }}>저장</button>
                                <button className="btn btn-sm" onClick={() => setEditingTechTreeId(null)}>취소</button>
                              </div>
                            ) : (
                              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', flex: 1 }}>
                                <span className="badge badge-accent" style={{ marginRight: '8px' }}>{tree.category}</span>
                                {tree.name}
                              </div>
                            )}
                            
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {editingTechTreeId !== tree.id && (
                                <button className="btn btn-sm btn-ghost" onClick={() => setEditingTechTreeId(tree.id)}>이름/카테고리 수정</button>
                              )}
                              <button className="btn btn-sm btn-danger" onClick={() => {
                                if (!confirm('이 기술 트리를 완전히 삭제하시겠습니까?')) return;
                                const newTrees = techTrees.filter((_, i) => i !== idx);
                                saveGameSettings({ techTrees: newTrees });
                              }}>트리 삭제</button>
                            </div>
                          </div>

                          {/* 단계 목록 (Table) */}
                          {tree.levels && tree.levels.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                              <table className="data-table" style={{ marginTop: '10px', marginBottom: '16px', fontSize: '0.9rem' }}>
                                <thead>
                                  <tr>
                                    <th>단계</th>
                                    <th>이름(소분류)</th>
                                    <th>시대</th>
                                    <th>소모 턴</th>
                                    <th>특수효과</th>
                                    <th>관리</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tree.levels.map((lvl, lIdx) => (
                                    <tr key={lIdx}>
                                      <td>{lvl.level}단계</td>
                                      {editingTechLevelId === `${tree.id}_${lIdx}` ? (
                                        <td colSpan="4">
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                          <input id={`editLvlName_${tree.id}_${lIdx}`} className="form-input" defaultValue={lvl.name} placeholder="이름" style={{ width: '150px' }} />
                                          <select id={`editLvlEra_${tree.id}_${lIdx}`} className="form-select" defaultValue={lvl.era || eras[0]} style={{ width: '120px' }}>
                                            {eras.map(e => <option key={e} value={e}>{e}</option>)}
                                          </select>
                                          <input id={`editLvlTurn_${tree.id}_${lIdx}`} type="number" className="form-input" defaultValue={lvl.turns} placeholder="턴" style={{ width: '80px' }} />
                                          <select id={`editLvlEffect_${tree.id}_${lIdx}`} className="form-select" defaultValue={lvl.effect || 'none'} style={{ width: '150px' }}>
                                            <option value="none">특수효과 없음</option>
                                            <option value="prevent_fail">연구실패 방지</option>
                                            <option value="research_speed">연구시간 50% 감소</option>
                                            <option value="unlock_special">특수유닛 해금</option>
                                            <option value="agri_boost">농수산 생산 10% 증가</option>
                                            <option value="heavy_boost">중공업 생산 10% 증가</option>
                                            <option value="light_boost">경공업 생산 10% 증가</option>
                                            <option value="mining_boost">자원 생산 10% 증가</option>
                                            <option value="radar_tech">레이더 기술 (전투)</option>
                                            <option value="penetration_boost">관통력 증가</option>
                                            <option value="antiair_boost">대공능력 증가</option>
                                            <option value="observation_boost">관측력 증가</option>
                                          </select>
                                          <input id={`editLvlVal_${tree.id}_${lIdx}`} type="number" className="form-input" defaultValue={lvl.effectValue || 0} placeholder="효과값" style={{ width: '70px' }} />
                                        </div>
                                      </td>
                                    ) : (
                                      <>
                                        <td>{lvl.name}</td>
                                        <td>{lvl.era || '-'}</td>
                                        <td>{lvl.turns}</td>
                                        <td>
                                          {lvl.effect !== 'none' ? (
                                            <span style={{ color: 'var(--primary)' }}>{lvl.effect} ({lvl.effectValue || 0})</span>
                                          ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>없음</span>
                                          )}
                                        </td>
                                      </>
                                    )}
                                    <td>
                                      {editingTechLevelId === `${tree.id}_${lIdx}` ? (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <button className="btn btn-sm btn-primary" onClick={() => {
                                            const name = document.getElementById(`editLvlName_${tree.id}_${lIdx}`).value;
                                            const era = document.getElementById(`editLvlEra_${tree.id}_${lIdx}`).value;
                                            const turns = parseInt(document.getElementById(`editLvlTurn_${tree.id}_${lIdx}`).value);
                                            const effect = document.getElementById(`editLvlEffect_${tree.id}_${lIdx}`).value;
                                            const effectValue = parseInt(document.getElementById(`editLvlVal_${tree.id}_${lIdx}`).value) || 0;
                                            if (turns > 0 && name) {
                                              const newTrees = [...techTrees];
                                              newTrees[idx].levels[lIdx] = { ...newTrees[idx].levels[lIdx], name, era, turns, effect, effectValue };
                                              saveGameSettings({ techTrees: newTrees });
                                              setEditingTechLevelId(null);
                                            } else {
                                              showToast('이름과 턴 수를 확인하세요.', 'error');
                                            }
                                          }}>저장</button>
                                          <button className="btn btn-sm" onClick={() => setEditingTechLevelId(null)}>취소</button>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <button className="btn btn-sm btn-ghost" onClick={() => setEditingTechLevelId(`${tree.id}_${lIdx}`)}>수정</button>
                                          <button className="btn btn-sm btn-danger" onClick={() => {
                                            if(!confirm('이 단계를 삭제하시겠습니까? 이후 단계들의 번호가 하나씩 당겨집니다.')) return;
                                            const newTrees = [...techTrees];
                                            newTrees[idx].levels.splice(lIdx, 1);
                                            newTrees[idx].levels.forEach((l, i) => l.level = i + 1); // 재정렬
                                            saveGameSettings({ techTrees: newTrees });
                                          }}>삭제</button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            </div>
                          ) : (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>아직 등록된 단계가 없습니다.</p>
                          )}

                          {/* 새 단계 추가 폼 */}
                          <div className="form-inline" style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px dashed var(--border-color)', flexWrap: 'wrap' }}>
                            <input id={`levelName_${tree.id}`} type="text" className="form-input" placeholder="새 소분류 이름" style={{ width: '150px' }} />
                            <select id={`levelEra_${tree.id}`} className="form-select" style={{ width: '120px' }}>
                              {eras.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                            <input id={`levelTurn_${tree.id}`} type="number" className="form-input" placeholder="턴 수" style={{ width: '80px' }} />
                            <select id={`levelEffect_${tree.id}`} className="form-select" style={{ width: '150px' }}>
                              <option value="none">특수효과 없음</option>
                              <option value="prevent_fail">연구실패 방지</option>
                              <option value="research_speed">연구시간 50% 감소</option>
                              <option value="unlock_special">특수유닛 해금</option>
                              <option value="agri_boost">농수산 생산 10% 증가</option>
                              <option value="heavy_boost">중공업 생산 10% 증가</option>
                              <option value="light_boost">경공업 생산 10% 증가</option>
                              <option value="mining_boost">자원 생산 10% 증가</option>
                              <option value="radar_tech">레이더 기술 (전투)</option>
                              <option value="penetration_boost">관통력 증가</option>
                              <option value="antiair_boost">대공능력 증가</option>
                              <option value="observation_boost">관측력 증가</option>
                            </select>
                            <input id={`levelEffectValue_${tree.id}`} type="number" className="form-input" placeholder="효과값" style={{ width: '70px' }} title="관통력/대공/관측력 증가량" />
                            <button className="btn btn-sm btn-secondary" onClick={() => {
                              const name = document.getElementById(`levelName_${tree.id}`).value;
                              const turns = parseInt(document.getElementById(`levelTurn_${tree.id}`).value);
                              const effect = document.getElementById(`levelEffect_${tree.id}`).value;
                              const era = document.getElementById(`levelEra_${tree.id}`).value;
                              const effectValue = parseInt(document.getElementById(`levelEffectValue_${tree.id}`).value) || 0;
                              if (turns > 0 && name) {
                                const newTrees = [...techTrees];
                                const newLevel = newTrees[idx].levels.length + 1;
                                newTrees[idx].levels.push({ level: newLevel, name, turns, effect, era, effectValue });
                                saveGameSettings({ techTrees: newTrees });
                                document.getElementById(`levelName_${tree.id}`).value = '';
                                document.getElementById(`levelTurn_${tree.id}`).value = '';
                                document.getElementById(`levelEffect_${tree.id}`).value = 'none';
                                document.getElementById(`levelEra_${tree.id}`).value = eras[0];
                                document.getElementById(`levelEffectValue_${tree.id}`).value = '';
                              } else {
                                showToast('이름과 턴 수를 모두 입력하세요.', 'error');
                              }
                            }}>➕ {tree.levels ? tree.levels.length + 1 : 1}단계 추가</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="form-inline" style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <select id="newTreeCategory" className="form-select" style={{ width: 'auto' }}>
              {defaultCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input id="newTreeName" className="form-input" placeholder="새 기술 이름 (예: 보병 장비)" style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={() => {
              const cat = document.getElementById('newTreeCategory').value;
              const name = document.getElementById('newTreeName').value;
              if (name && !techTrees.find(t => t.name === name)) {
                const newTree = { id: Date.now().toString(), category: cat, name, levels: [] };
                saveGameSettings({ techTrees: [...techTrees, newTree] });
                document.getElementById('newTreeName').value = '';
              } else {
                showToast('이름을 입력하거나 중복되지 않게 해주세요.', 'error');
              }
            }}>새 기술 트리 추가</button>
          </div>
        </div>

        {/* 국가별 연구 현황 및 할당 */}
        <div className="form-group">
          <label className="form-label">국가 선택하여 연구 진행하기</label>
          <select
            className="form-select"
            value={selectedCountryId}
            onChange={(e) => {
              setSelectedCountryId(e.target.value);
              if (e.target.value) loadResearches(e.target.value);
            }}
          >
            <option value="">-- 국가를 선택하세요 --</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {selectedCountryId && (
          <div className="admin-form-section">
            <h3 className="admin-form-title">국가 연구 상태 및 다음 단계 진행</h3>
            {(Array.isArray(techTrees) ? techTrees : []).length === 0 ? <p>먼저 위에서 기술 트리를 정의하세요.</p> : (
              <div className="card-grid card-grid-2">
                {(Array.isArray(techTrees) ? techTrees : []).filter(t => t).map(tree => {
                  // 현재 국가가 이 기술에 대해 가진 연구 기록 필터링
                  const countryResearches = researches.filter(r => r.name === tree.name);
                  
                  // 가장 높은 단계의 진행중/대기중/실패한 연구 확인
                  const activeResearch = countryResearches.find(r => r.status === 'in_progress' || r.status === 'queued' || r.status === 'failed');
                  
                  // 완료된 연구 중 가장 높은 단계 확인
                  const completedResearches = countryResearches.filter(r => r.status === 'completed');
                  const highestCompletedLevel = completedResearches.length > 0 
                    ? Math.max(...completedResearches.map(r => r.level)) 
                    : 0;

                  const nextLevelIndex = highestCompletedLevel; // 0-indexed in array
                  const nextLevelData = (Array.isArray(tree.levels) ? tree.levels : [])[nextLevelIndex];

                  return (
                    <div key={tree.id} className="card" style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                        <span className="badge badge-accent" style={{ marginRight: '8px' }}>{tree.category}</span>
                        {tree.name}
                      </div>
                      
                      <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        현재 완료된 단계: {highestCompletedLevel > 0 ? ((Array.isArray(tree.levels) ? tree.levels : [])[highestCompletedLevel - 1]?.name || `Lv.${highestCompletedLevel}`) : '없음'}
                      </div>

                      {activeResearch ? (
                        <div style={{ padding: '12px', background: activeResearch.status === 'failed' ? 'rgba(248,113,113,0.1)' : 'var(--bg-glass)', border: activeResearch.status === 'failed' ? '1px solid var(--error)' : 'none', borderRadius: '8px' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <strong>[{activeResearch.status === 'failed' ? '실패함' : '진행 중'}] {(Array.isArray(tree.levels) ? tree.levels : [])[activeResearch.level - 1]?.name || `Lv.${activeResearch.level}`}</strong> 
                            {activeResearch.status !== 'failed' && ` (남은 턴: ${activeResearch.remaining_turns})`}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {activeResearch.status === 'failed' ? (
                              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                                await updateResearch(activeResearch.id, { status: 'in_progress', remaining_turns: (Array.isArray(tree.levels) ? tree.levels : [])[activeResearch.level - 1]?.turns || 5 });
                                loadResearches(selectedCountryId);
                                showToast('연구를 재시작합니다.');
                              }}>🔄 재시작 (턴 초기화)</button>
                            ) : (
                              <select className="form-select" value={activeResearch.status} onChange={async (e) => {
                                await updateResearch(activeResearch.id, { status: e.target.value });
                                loadResearches(selectedCountryId);
                              }} style={{ padding: '4px', height: 'auto', flex: 1 }}>
                                <option value="queued">대기중</option>
                                <option value="in_progress">진행중</option>
                                <option value="completed">강제 완료</option>
                              </select>
                            )}
                            <button className="btn btn-sm btn-danger" onClick={async () => {
                              await deleteResearch(activeResearch.id);
                              loadResearches(selectedCountryId);
                            }}>취소/삭제</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {nextLevelData ? (
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={async () => {
                              await createResearch({
                                country_id: selectedCountryId,
                                category: tree.category,
                                name: tree.name,
                                level: nextLevelData.level,
                                required_turns: nextLevelData.turns,
                                remaining_turns: nextLevelData.turns,
                                status: 'in_progress', // 바로 진행 상태로
                              });
                              loadResearches(selectedCountryId);
                              showToast(`${nextLevelData.name || `Lv.${nextLevelData.level}`} 연구가 시작되었습니다.`);
                            }}>
                              🚀 다음 연구: {nextLevelData.name || `Lv.${nextLevelData.level}`} ({nextLevelData.turns}턴)
                            </button>
                          ) : (
                            <div style={{ padding: '12px', textAlign: 'center', background: 'var(--bg-glass)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                              모든 단계 연구 완료
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 이전 기록 삭제 등 관리 기능 */}
                      {highestCompletedLevel > 0 && (
                        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select id={`techSendTarget_${tree.id || idx}`} className="form-select" style={{ flex: 1 }}>
                              <option value="">-- 기술을 제공할 국가 선택 --</option>
                              {countries.filter(c => c.id !== selectedCountryId).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button className="btn btn-sm btn-secondary" onClick={async () => {
                              const targetCountryId = document.getElementById(`techSendTarget_${tree.id || idx}`).value;
                              if (!targetCountryId) return showToast('제공할 국가를 선택하세요.', 'error');
                              
                              if (!confirm(`정말 Lv.${highestCompletedLevel} 기술을 제공하시겠습니까?`)) return;
                              const result = await transferTech(targetCountryId, tree.name, highestCompletedLevel, true);
                              if (result.success) {
                                showToast('기술 제공이 완료되었습니다.');
                              } else {
                                showToast(result.error || '기술 제공에 실패했습니다.', 'error');
                              }
                            }}>🎁 기술 제공하기</button>
                            
                            {!activeResearch && (
                              <button className="btn btn-sm btn-ghost" onClick={async () => {
                                if(!confirm('가장 최근에 완료된 연구 단계를 취소하시겠습니까?')) return;
                                const target = completedResearches.find(r => r.level === highestCompletedLevel);
                                if(target) {
                                  await deleteResearch(target.id);
                                  loadResearches(selectedCountryId);
                                }
                              }} style={{ marginLeft: 'auto' }}>이전 단계 완료 취소</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderResources = () => {
    const resourceTypes = [
      { key: 'wood', label: '목재' },
      { key: 'steel', label: '강철' },
      { key: 'coal', label: '석탄' },
      { key: 'oil', label: '석유' },
      { key: 'chromium', label: '크롬' },
      { key: 'tungsten', label: '텅스텐' },
      { key: 'aluminum', label: '알루미늄' },
      { key: 'rubber', label: '고무' },
      { key: 'sulfur', label: '유황' },
      { key: 'food', label: '식료품' },
      { key: 'consumer_goods', label: '소비재' }
    ];

    return (
      <div className="slide-up">
        <h2 style={{ marginBottom: '24px' }}>📦 자원 관리</h2>
        <div className="form-group">
          <label className="form-label">국가 선택</label>
          <select
            className="form-select"
            value={selectedCountryId}
            onChange={(e) => {
              setSelectedCountryId(e.target.value);
              if (e.target.value) loadResources(e.target.value);
            }}
          >
            <option value="">-- 국가를 선택하세요 --</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {selectedCountryId && (
          <div className="admin-form-section">
            <h3 className="admin-form-title">국가 자원 보유량 및 생산량</h3>
            <div className="card-grid card-grid-2">
              {resourceTypes.map(rt => {
                const rsc = resources.find(r => r.resource_type === rt.key) || { amount: 0, production_per_turn: 0 };
                return (
                  <div key={rt.key} className="card" style={{ padding: '16px' }}>
                    <h4 style={{ marginBottom: '12px' }}>{rt.label}</h4>
                    <div className="form-row">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">보유량</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          defaultValue={rsc.amount} 
                          onBlur={async (e) => {
                            await upsertResource(selectedCountryId, rt.key, Number(e.target.value), Number(rsc.production_per_turn));
                            loadResources(selectedCountryId);
                          }}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">생산량 (턴당)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          defaultValue={rsc.production_per_turn} 
                          onBlur={async (e) => {
                            await upsertResource(selectedCountryId, rt.key, Number(rsc.amount), Number(e.target.value));
                            loadResources(selectedCountryId);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMapEditor = () => (
    <div className="slide-up">
      <h2 style={{ marginBottom: '24px' }}>🗺️ 지도 색칠</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
        지도의 각 지역을 클릭하여 색칠하세요. 모든 경계선(진한선·연한선)이 인식됩니다.
        경계 감도 슬라이더로 인식 민감도를 조절할 수 있습니다.
      </p>
      <MapEditor
        editable={true}
        savedImageData={mapData?.image_data}
        baseMapDataUrl={baseMapDataUrl}
        onBaseMapUpload={handleBaseMapUpload}
        onSave={handleSaveMap}
        legend={countries.map((c) => ({ name: c.name, color: c.color }))}
      />
    </div>
  );

  // ==================== AUTH GATE ====================
  if (!admin) {
    return (
      <>
        <div className="page-content">
          <div className="password-gate">
            <div className="card card-glass password-gate-card" style={{ padding: '48px 32px' }}>
              <div className="password-gate-icon">🛡️</div>
              <h2 className="password-gate-title">관리자 전용</h2>
              <p className="password-gate-desc">관리자 비밀번호를 입력하세요.</p>
              <button className="btn btn-primary btn-lg" onClick={() => setShowLogin(true)} style={{ width: '100%' }}>
                🔑 로그인
              </button>
            </div>
          </div>
        </div>
        {showLogin && (
          <LoginModal
            type="admin"
            onClose={() => setShowLogin(false)}
            onSuccess={() => {
              setShowLogin(false);
              setAdmin(true);
              loadCountries();
            }}
          />
        )}
      </>
    );
  }

  const sidebarItems = [
    { id: 'management', label: '🎛️ 관리 패널' },
    { id: 'dashboard', label: '📊 대시보드 (턴)' },
    { id: 'users', label: '👥 유저 관리' },
    { id: 'countries', label: '🏴 국가 관리' },
    { id: 'history', label: '📜 역사' },
    { id: 'geography', label: '🗻 지리' },
    { id: 'country-info', label: '📊 국가별 정보' },
    { id: 'research', label: '🔬 연구 관리' },
    { id: 'blueprints', label: '🛠️ 무기 청사진' },
    { id: 'formations', label: '🎖️ 편제 관리' },
    { id: 'aerial', label: '✈️ 공중전 설정' },
    { id: 'resources', label: '📦 자원 관리' },
    { id: 'map', label: '🗺️ 지도 색칠' },
  ];

  return (
    <div className="fade-in">
      <div className="admin-panel">
        <div className="admin-sidebar">
          <div className="admin-sidebar-title">관리 메뉴</div>
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              className={`admin-sidebar-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="admin-content">
          {activeSection === 'management' && renderManagement()}
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'users' && renderUsers()}
          {activeSection === 'countries' && renderCountries()}
          {activeSection === 'history' && renderHistory()}
          {activeSection === 'geography' && renderGeography()}
          {activeSection === 'country-info' && renderCountryInfo()}
          {activeSection === 'research' && renderResearch()}
          {activeSection === 'blueprints' && renderBlueprints()}
          {activeSection === 'formations' && renderUnitTemplates()}
          {activeSection === 'aerial' && renderAerialSession()}
          {activeSection === 'resources' && renderResources()}
          {activeSection === 'map' && renderMapEditor()}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Country Row Component ====================
function CountryRow({ country, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(country.name);
  const [password, setPassword] = useState(country.password);
  const [color, setColor] = useState(country.color || '#cccccc');

  const handleSave = () => {
    onUpdate(country.id, { name, password, color });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="card" style={{ padding: '16px' }}>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">국가명</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">비밀번호</label>
            <input className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">색상</label>
            <div className="form-inline">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer' }} />
            </div>
          </div>
          <div className="btn-group">
            <button className="btn btn-sm btn-primary" onClick={handleSave}>저장</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="country-color-dot" style={{ backgroundColor: color, width: '16px', height: '16px' }} />
        <span style={{ fontWeight: 600 }}>{country.name}</span>
      </div>
      <div className="btn-group">
        <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>✏️ 편집</button>
        <button className="btn btn-sm btn-danger" onClick={() => onDelete(country.id, country.name)}>🗑️</button>
      </div>
    </div>
  );
}
