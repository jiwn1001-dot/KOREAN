'use client';

import { useState, useEffect, useCallback } from 'react';
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
  getResources, upsertResource
} from '@/lib/store';
import { processTurnEnd, rollbackTurn, resetToTurnOne } from '@/lib/gameLogic';
import LoginModal from '@/components/LoginModal';

const MapEditor = dynamic(() => import('@/components/MapEditor'), { ssr: false });

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
    heavyIndustry: { value: '', unit: '' },
    lightIndustry: { value: '', unit: '' },
    agriculture: { value: '', unit: '' },
    resources: { value: '', unit: '' },
    commerce: { value: '', unit: '' },
    customFields: [],
  });
  const [economyImages, setEconomyImages] = useState([]);
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
        heavyIndustry: { value: '', unit: '' },
        lightIndustry: { value: '', unit: '' },
        agriculture: { value: '', unit: '' },
        resources: { value: '', unit: '' },
        commerce: { value: '', unit: '' },
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
    else if (activeSection === 'research') {
      loadCountries();
      loadTechTrees();
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

  const loadTechTrees = async () => {
    try {
      const entry = await getDataEntry('game_settings');
      if (entry && entry.data?.techTrees) {
        setTechTrees(entry.data.techTrees);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const saveTechTrees = async (newTrees) => {
    try {
      await upsertDataEntry('game_settings', null, { techTrees: newTrees });
      setTechTrees(newTrees);
      showToast('기술 트리가 저장되었습니다.');
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
        </div>
      </div>

      {/* Parties */}
      <div className="admin-form-section">
        <h3 className="admin-form-title">
          🗳️ 정당
          <span className="badge badge-accent" style={{ marginLeft: '8px' }}>
            {(politicsData.parties || []).length}개
          </span>
        </h3>
        {(politicsData.parties || []).map((party, idx) => (
          <div key={idx} className="card" style={{ padding: '16px', marginBottom: '12px' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">정당명</label>
                <input
                  className="form-input"
                  value={party.name || ''}
                  onChange={(e) => {
                    const parties = [...politicsData.parties];
                    parties[idx] = { ...parties[idx], name: e.target.value };
                    setPoliticsData((p) => ({ ...p, parties }));
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
                    const parties = [...politicsData.parties];
                    parties[idx] = { ...parties[idx], seats: e.target.value };
                    setPoliticsData((p) => ({ ...p, parties }));
                  }}
                  placeholder="0"
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
                    const parties = [...politicsData.parties];
                    parties[idx] = { ...parties[idx], supportRate: e.target.value };
                    setPoliticsData((p) => ({ ...p, parties }));
                  }}
                  placeholder="0.0"
                />
              </div>
              <div className="form-group" style={{ width: '80px' }}>
                <label className="form-label">색상</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="color"
                    value={party.color || '#cccccc'}
                    onChange={(e) => {
                      const parties = [...politicsData.parties];
                      parties[idx] = { ...parties[idx], color: e.target.value };
                      setPoliticsData((p) => ({ ...p, parties }));
                    }}
                    style={{ width: '100%', height: '36px', padding: '0', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                  />
                </div>
              </div>
            </div>
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">정당 로고/이미지 URL (선택)</label>
                <input
                  className="form-input"
                  value={party.image || ''}
                  onChange={(e) => {
                    const parties = [...politicsData.parties];
                    parties[idx] = { ...parties[idx], image: e.target.value };
                    setPoliticsData((p) => ({ ...p, parties }));
                  }}
                  placeholder="이미지 URL"
                />
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => {
                setPoliticsData((p) => ({
                  ...p,
                  parties: p.parties.filter((_, i) => i !== idx),
                }));
              }}>✕ 삭제</button>
            </div>
          </div>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => {
          setPoliticsData((p) => ({
            ...p,
            parties: [...(p.parties || []), { name: '', seats: 0, supportRate: 0, color: '#cccccc' }],
          }));
        }}>➕ 정당 추가</button>
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
    const fields = [
      { key: 'heavyIndustry', label: '🏭 중공업' },
      { key: 'lightIndustry', label: '🧵 경공업' },
      { key: 'agriculture', label: '🌾 농업' },
      { key: 'resources', label: '⛏️ 자원' },
      { key: 'commerce', label: '🏪 상업' },
    ];

    return (
      <div className="slide-up">
        <div className="admin-form-section">
          <h3 className="admin-form-title">💰 경제 지표</h3>
          {fields.map(({ key, label }) => (
            <div key={key} className="form-row" style={{ marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{label}</label>
                <input
                  className="form-input"
                  value={economyData[key]?.value || ''}
                  onChange={(e) => setEconomyData((p) => ({
                    ...p, [key]: { ...p[key], value: e.target.value },
                  }))}
                  placeholder="수치 또는 설명"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">단위</label>
                <input
                  className="form-input"
                  value={economyData[key]?.unit || ''}
                  onChange={(e) => setEconomyData((p) => ({
                    ...p, [key]: { ...p[key], unit: e.target.value },
                  }))}
                  placeholder="단위 (예: 억원, 톤...)"
                />
              </div>
            </div>
          ))}
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

  const renderResearch = () => {
    const defaultCategories = ['지상군', '해군', '항공', '공학', '산업'];
    const eras = ['선사시대', '고대시대', '중세시대', '근세시대', '대혁명기', '빅토리안시대', '1차대전기', '2차대전기', '냉전기', '현대', '근미래'];
    
    return (
      <div className="slide-up">
        <h2 style={{ marginBottom: '24px' }}>🔬 연구 관리 (기술 트리)</h2>
        
        {/* 글로벌 기술 트리 에디터 */}
        <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1.2rem' }}>글로벌 기술 트리 편집기</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>모든 국가가 공유하는 기술 항목과 단계(레벨)별 소모 턴 수를 정의합니다.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            {techTrees.map((tree, idx) => (
              <div key={tree.id} className="card" style={{ padding: '16px', background: 'var(--bg-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                    <span className="badge badge-accent" style={{ marginRight: '8px' }}>{tree.category}</span>
                    {tree.name}
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => {
                    const newTrees = techTrees.filter((_, i) => i !== idx);
                    saveTechTrees(newTrees);
                  }}>기술 트리 삭제</button>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {tree.levels.map((lvl, lIdx) => (
                    <span key={lIdx} className="badge" style={{ padding: '6px 10px', fontSize: '0.85rem' }}>
                      {lvl.name || `${lvl.level}단계`} (턴: {lvl.turns}) {lvl.era && <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>[{lvl.era}]</span>} {lvl.effect && lvl.effect !== 'none' && <span style={{ color: 'var(--primary)', marginLeft: '4px' }}>[{lvl.effect}]</span>}
                    </span>
                  ))}
                </div>
                
                <div className="form-inline">
                  <input id={`levelName_${tree.id}`} type="text" className="form-input" placeholder="소분류 이름 (예: 1936년형)" style={{ width: '180px' }} />
                  <input id={`levelTurn_${tree.id}`} type="number" className="form-input" placeholder="소모 턴 수" style={{ width: '100px' }} />
                  <select id={`levelEra_${tree.id}`} className="form-select" style={{ width: '120px' }}>
                    {eras.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
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
                  </select>
                  <button className="btn btn-sm btn-secondary" onClick={() => {
                    const name = document.getElementById(`levelName_${tree.id}`).value;
                    const turns = parseInt(document.getElementById(`levelTurn_${tree.id}`).value);
                    const effect = document.getElementById(`levelEffect_${tree.id}`).value;
                    const era = document.getElementById(`levelEra_${tree.id}`).value;
                    if (turns > 0 && name) {
                      const newTrees = [...techTrees];
                      const newLevel = newTrees[idx].levels.length + 1;
                      newTrees[idx].levels.push({ level: newLevel, name, turns, effect, era });
                      saveTechTrees(newTrees);
                      document.getElementById(`levelName_${tree.id}`).value = '';
                      document.getElementById(`levelTurn_${tree.id}`).value = '';
                      document.getElementById(`levelEffect_${tree.id}`).value = 'none';
                      document.getElementById(`levelEra_${tree.id}`).value = eras[0];
                    } else {
                      showToast('이름과 턴 수를 모두 입력하세요.', 'error');
                    }
                  }}>➕ 다음 단계 추가 (Lv.{tree.levels.length + 1})</button>
                  {tree.levels.length > 0 && (
                    <button className="btn btn-sm btn-ghost" onClick={() => {
                      const newTrees = [...techTrees];
                      newTrees[idx].levels.pop();
                      saveTechTrees(newTrees);
                    }}>마지막 단계 삭제</button>
                  )}
                </div>
              </div>
            ))}
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
                saveTechTrees([...techTrees, newTree]);
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
            {techTrees.length === 0 ? <p>먼저 위에서 기술 트리를 정의하세요.</p> : (
              <div className="card-grid card-grid-2">
                {techTrees.map(tree => {
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
                  const nextLevelData = tree.levels[nextLevelIndex];

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
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {activeResearch.status === 'failed' ? (
                              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                                await updateResearch(activeResearch.id, { status: 'in_progress', remaining_turns: tree.levels[activeResearch.level - 1]?.turns || 5 });
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
                            <select id={`techSendTarget_${tree.id}`} className="form-select" style={{ flex: 1 }}>
                              <option value="">-- 기술을 제공할 국가 선택 --</option>
                              {countries.filter(c => c.id !== selectedCountryId).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button className="btn btn-sm btn-secondary" onClick={async () => {
                              const targetCountryId = document.getElementById(`techSendTarget_${tree.id}`).value;
                              if (!targetCountryId) return showToast('제공할 국가를 선택하세요.', 'error');
                              
                              if (!confirm(`정말 Lv.${highestCompletedLevel} 기술을 제공하시겠습니까?`)) return;
                              
                              // 대상 국가에 해당 기술이 이미 더 높은 레벨로 있는지 확인
                              const { data: targetResearches } = await supabase.from('researches').select('level').eq('country_id', targetCountryId).eq('name', tree.name).eq('status', 'completed');
                              const targetMaxLevel = targetResearches && targetResearches.length > 0 ? Math.max(...targetResearches.map(r => r.level)) : 0;
                              
                              if (targetMaxLevel >= highestCompletedLevel) {
                                return showToast('상대 국가가 이미 같거나 더 높은 단계의 기술을 보유하고 있습니다.', 'error');
                              }
                              
                              await createResearch({
                                country_id: targetCountryId,
                                category: tree.category,
                                name: tree.name,
                                level: highestCompletedLevel,
                                required_turns: 0,
                                remaining_turns: 0,
                                status: 'completed',
                              });
                              showToast('기술 제공이 완료되었습니다.');
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
      { key: 'food', label: '식료품' }
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
    { id: 'dashboard', label: '📊 대시보드 (턴)' },
    { id: 'users', label: '👥 유저 관리' },
    { id: 'countries', label: '🏴 국가 관리' },
    { id: 'history', label: '📜 역사' },
    { id: 'geography', label: '🗻 지리' },
    { id: 'country-info', label: '📊 국가별 정보' },
    { id: 'research', label: '🔬 연구 관리' },
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
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'users' && renderUsers()}
          {activeSection === 'countries' && renderCountries()}
          {activeSection === 'history' && renderHistory()}
          {activeSection === 'geography' && renderGeography()}
          {activeSection === 'country-info' && renderCountryInfo()}
          {activeSection === 'research' && renderResearch()}
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
