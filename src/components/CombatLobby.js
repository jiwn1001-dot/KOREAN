'use client';

import React, { useState, useEffect } from 'react';
import { getDataEntry, upsertDataEntry, getCountries } from '@/lib/store';
import { deployAIUnits } from '@/lib/landCombat';
import LandCombatBoard from '@/components/LandCombatBoard';
import NavalCombatBoard from '@/components/NavalCombatBoard';

function cloneUnitForAI(unit, aiOwnerId, isTeam1, aiLevel = 2) {
  const uniqueId = `${unit.id || 'unit'}_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    ...unit,
    id: uniqueId,
    owner: aiOwnerId,
    status: 'standby',
    x: isTeam1 ? 0 : 19,
    y: unit.y !== undefined ? unit.y : 10,
    corpsId: unit.corpsId ? `AI_${unit.corpsId}` : 'AI_corps',
    aiLevel,
    isHQ: unit.isHQ || false,
    hp: unit.hp || unit.maxHp || 100,
    maxHp: unit.maxHp || unit.hp || 100,
    vision: unit.vision || 0,
    supplyConsumption: unit.supplyConsumption || 1,
    attack: unit.attack || 0,
    defense: unit.defense || 0,
    speed: unit.speed || 0,
    majorCategory: unit.majorCategory || unit.subCategory || '육군',
    minorCategory: unit.minorCategory || unit.subCategory || '보병',
    subCategory: unit.subCategory || '보병'
  };
}

function buildAIUnitsFromArmy(units, aiOwnerId, isTeam1, aiLevel = 2) {
  return units.map(unit => cloneUnitForAI(unit, aiOwnerId, isTeam1, aiLevel));
}

function buildAIPlayerData(sourceUnits, isTeam1) {
  return {
    armyId: null,
    ready: true,
    isAI: true,
    orders: [],
    skills: [],
    stats: { penetration: 0, antiAir: 0, vision: 0 },
    units: buildAIUnitsFromArmy(sourceUnits, 'AI', isTeam1, 2)
  };
}

export default function CombatLobby({ countryId, militaryUnits, corps, armies, navalFleets = [], generals, admin, countryStats, unitTemplates = [] }) {
  const [maps, setMaps] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  
  // Create Session Form
  const [showCreate, setShowCreate] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedMapId, setSelectedMapId] = useState('');
  const [sessionMode, setSessionMode] = useState('human_vs_ai');
  const [supplyLimit, setSupplyLimit] = useState(10);
  const [opponentId, setOpponentId] = useState('');
  const [selectedArmyId, setSelectedArmyId] = useState('');
  const [selectedFleetId, setSelectedFleetId] = useState('');
  const [allowNavalBombardment, setAllowNavalBombardment] = useState(false);

  const buildUnitsFromFleet = (fleet, session = null) => {
    const myUnits = [];
    (fleet?.shipIds || []).forEach(uid => {
      const u = militaryUnits.find(mu => mu.id === uid);
      if (!u) return;
      const tmpl = unitTemplates.find(t => t.id === u.templateId) || {};
      const major = tmpl.majorCategory || u.majorCategory;
      if (major !== '해군') return;

      const isTeam1 = session
        ? (session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId))
        : true;
      const startX = isTeam1 ? 0 : 19;

      myUnits.push({
        ...u,
        name: u.customName || tmpl.name || u.name || '함선',
        image: tmpl.image || u.image || null,
        attack: u.attack || tmpl.attack || 0,
        defense: u.defense || tmpl.defense || 0,
        speed: u.speed || tmpl.speed || 0,
        maxHp: u.maxHp || u.hp || tmpl.hp || 100,
        hp: u.hp || u.maxHp || tmpl.hp || 100,
        vision: (u.vision || tmpl.vision || 0) + (countryStats?.vision || 0),
        supplyConsumption: u.supplyConsumption || tmpl.supplyConsumption || 1,
        majorCategory: '해군',
        minorCategory: tmpl.minorCategory || u.minorCategory,
        subCategory: tmpl.subCategory || u.subCategory,
        slotCount: tmpl.slotCount || u.slotCount || 1,
        x: startX,
        y: startX,
        status: 'standby',
        owner: countryId,
        fleetId: fleet.id,
        aiLevel: generals.find(g => g.id === fleet.admiralId)?.aiLevel || 1
      });
    });

    return myUnits;
  };

  // Supply Limit Negotiation
  const [editingSupplyFor, setEditingSupplyFor] = useState(null);
  const [newSupplyLimit, setNewSupplyLimit] = useState('');

  useEffect(() => {
    loadLobbyData();
    const interval = setInterval(loadLobbyData, 5000); // Poll for sessions
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeSession && sessions.length > 0) {
      const updated = sessions.find(s => s.id === activeSession.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(activeSession)) {
        setActiveSession(updated);
      }
    }
  }, [sessions]);

  const loadLobbyData = async () => {
    try {
      const mapEntry = await getDataEntry('combat_maps', null);
      if (mapEntry?.data?.maps) setMaps(mapEntry.data.maps);

      const cSessions = await getDataEntry('combat_sessions');
      const latestSessions = cSessions?.data?.sessions || [];
      setSessions(latestSessions);
      
      // Update activeSession with real-time data
      if (activeSession) {
         const updatedActive = latestSessions.find(s => s.id === activeSession.id);
         if (updatedActive) {
            setActiveSession(updatedActive);
         }
      }
      
      const clist = await getCountries();
      setCountries(clist || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName || !selectedMapId || !selectedArmyId) {
      return alert('세션 이름, 맵, 그리고 투입할 야전군을 모두 선택해주세요.');
    }
    
    // Find the deployed army and its corps/units
    const army = armies.find(a => a.id === selectedArmyId);
    if (!army) return alert('야전군을 찾을 수 없습니다.');
    
    const myUnits = [];
    army.corpsIds.forEach(cid => {
      const c = corps.find(co => co.id === cid);
      if (c) {
        c.units.forEach(uid => {
          const u = militaryUnits.find(mu => mu.id === uid);
          if (u) {
            const tmpl = unitTemplates.find(t => t.id === u.templateId) || {};
            myUnits.push({
              ...u,
              name: u.customName || tmpl.name || u.name || '유닛',
              image: tmpl.image || u.image || null,
              attack: u.attack || tmpl.attack || 0,
              defense: u.defense || tmpl.defense || 0,
              speed: u.speed || tmpl.speed || 0,
              hp: u.hp || tmpl.hp || 100,
              maxHp: u.maxHp || u.hp || tmpl.hp || 100,
              vision: u.vision || tmpl.vision || 0,
              supplyConsumption: u.supplyConsumption || tmpl.supplyConsumption || 1,
              majorCategory: tmpl.majorCategory || u.majorCategory || '육군',
              minorCategory: tmpl.minorCategory || u.minorCategory || tmpl.minorCategory || '보병',
              subCategory: tmpl.subCategory || u.subCategory || '보병',
              x: 0,
              y: 0,
              status: 'standby',
              owner: countryId,
              corpsId: c.id,
              aiLevel: generals.find(g => g.id === c.commanderId)?.aiLevel || 1,
              isHQ: false
            });
          }
        });
      }
    });

    myUnits.push({
      id: 'hq_' + countryId,
      name: '야전사령부',
      subCategory: 'HQ',
      x: 0,
      y: 0,
      status: 'standby',
      owner: countryId,
      isHQ: true,
      hp: 100,
      maxHp: 100,
      vision: countryStats?.vision || 0,
      supplyConsumption: 0
    });

    const hostIsAI = sessionMode === 'ai_vs_ai';
    const finalOpponent = sessionMode === 'ai_vs_ai'
      ? 'AI'
      : (opponentId === 'AI' ? 'AI' : (opponentId || (sessionMode === 'human_vs_ai' ? 'AI' : null)));
    const isAIEnemy = finalOpponent === 'AI';
    const aiPlayer = isAIEnemy ? buildAIPlayerData(myUnits, false) : null;

    const hostPlayerData = {
      armyId: selectedArmyId,
      ready: hostIsAI ? true : false,
      isAI: hostIsAI,
      orders: [],
      skills: [],
      units: hostIsAI ? buildAIUnitsFromArmy(myUnits, countryId, true, 2) : myUnits,
      stats: countryStats
    };

    const newSession = {
      id: 'session_' + Date.now(),
      name: sessionName,
      mapId: selectedMapId,
      supplyLimitTeam1: parseInt(supplyLimit) || 10,
      supplyLimitTeam2: parseInt(supplyLimit) || 10,
      host: countryId,
      opponent: finalOpponent,
      sessionMode,
      allowNavalBombardment,
      status: (sessionMode === 'human_vs_human' || (sessionMode === 'human_vs_ai' && !isAIEnemy))
        ? 'waiting'
        : 'deployment',
      phase: undefined,
      players: {
        [countryId]: hostPlayerData,
        ...(isAIEnemy ? { AI: aiPlayer } : {})
      },
      board: maps.find(m => m.id === selectedMapId)?.board,
      units: isAIEnemy ? [...hostPlayerData.units, ...aiPlayer.units] : [...hostPlayerData.units],
      createdAt: new Date().toISOString()
    };

    if (sessionMode === 'ai_vs_ai') {
      const deployedUnits = deployAIUnits(newSession.units, { ...newSession, armies, generals }, null);
      newSession.units = deployedUnits;
      newSession.players[countryId].units = deployedUnits.filter(u => u.owner === countryId);
      if (newSession.players.AI) {
        newSession.players.AI.units = deployedUnits.filter(u => u.owner === 'AI');
      }
      newSession.status = 'playing';
      newSession.phase = 'combat';
      newSession.turn = 1;
      newSession.players[countryId].ready = true;
      if (newSession.players.AI) newSession.players.AI.ready = true;
    }

    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
    
    setShowCreate(false);
    if (sessionMode === 'ai_vs_ai') {
      alert('AI 대 AI 세션이 생성되었습니다. 즉시 전투를 개시할 수 있습니다.');
    } else {
      alert('전투 세션이 생성되었습니다. 상대방의 수락을 기다립니다.');
    }
  };

  const handleJoinSession = async (session) => {
    if (session.battleMode === 'siege' && session.status === 'defense_prep') {
      const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
      if (isTeam1) {
        return alert('현재 수비측(방어팀)이 전선을 사전 배치 중입니다. 관리자가 침공을 허가할 때까지 대기해주세요.');
      }
    }

    const isNavalSession = session.sessionCategory === 'naval';
    if (!isNavalSession && !selectedArmyId) {
      return alert('참여하기 전 투입할 야전군을 선택해주세요.');
    }
    if (isNavalSession && !selectedFleetId) {
      return alert('해전 참여 전 투입할 함대를 선택해주세요.');
    }

    let myUnits = [];
    if (isNavalSession) {
      const fleet = navalFleets.find(f => f.id === selectedFleetId);
      if (!fleet) return alert('함대를 찾을 수 없습니다.');
      myUnits = buildUnitsFromFleet(fleet, session);
    } else {
      const army = armies.find(a => a.id === selectedArmyId);
      if (!army) return alert('야전군을 찾을 수 없습니다.');

      army.corpsIds.forEach(cid => {
        const c = corps.find(co => co.id === cid);
        if (c) {
          c.units.forEach(uid => {
            const u = militaryUnits.find(mu => mu.id === uid);
            if (u) {
              const tmpl = unitTemplates.find(t => t.id === u.templateId) || {};
              const isAir = tmpl.majorCategory === '공군';
              if (session.sessionCategory === 'bombing' && !isAir) return;
              if (session.sessionCategory === 'land' && tmpl.majorCategory !== '육군' && !isAir) return;

              const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
              const startX = isTeam1 ? 0 : 19;
              myUnits.push({
                ...u,
                name: u.customName || tmpl.name || '알 수 없는 유닛',
                image: tmpl.image || null,
                attack: tmpl.attack || 0,
                defense: tmpl.defense || 0,
                speed: tmpl.speed || 0,
                maxHp: tmpl.hp || 100,
                hp: tmpl.hp || 100,
                vision: (tmpl.vision || 0) + (countryStats?.vision || 0),
                supplyConsumption: tmpl.supplyConsumption || 1,
                majorCategory: tmpl.majorCategory,
                minorCategory: tmpl.minorCategory,
                subCategory: tmpl.subCategory,
                x: startX,
                y: startX,
                status: 'standby',
                owner: countryId,
                corpsId: c.id,
                aiLevel: generals.find(g => g.id === c.commanderId)?.aiLevel || 1,
                isHQ: false
              });
            }
          });
        }
      });
    }

    const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
    const startX = isTeam1 ? 0 : 19;

    if (!isNavalSession) {
      myUnits.push({
        id: 'hq_' + countryId,
        name: '야전사령부',
        subCategory: 'HQ',
        x: startX,
        y: startX,
        status: 'standby',
        owner: countryId,
        isHQ: true,
        hp: 100,
        vision: (countryStats?.vision || 0),
        supplyConsumption: 0
      });
    }

    const updatedSession = { ...session };
    
    // In team battles, the armyId is already pre-assigned by the admin, but we update the units
    if (!updatedSession.players[countryId]) {
      updatedSession.players[countryId] = {};
    }
    
    updatedSession.players[countryId] = {
      ...updatedSession.players[countryId],
      armyId: isNavalSession ? null : selectedArmyId,
      fleetId: isNavalSession ? selectedFleetId : null,
      ready: false,
      orders: [],
      units: myUnits,
      stats: countryStats
    };

    // If 1v1, it goes to deployment when opponent joins. For team battles, it goes to deployment as well.
    if (!session.isTeamBattle) {
      updatedSession.status = 'deployment';
    } else {
      updatedSession.status = 'deployment';
    }

    // Combine units for the board (기존 보드 유닛 유지 + 내 새 유닛 추가)
    updatedSession.units = [
      ...(session.units || []),
      ...myUnits
    ];

    const updatedSessions = sessions.map(s => s.id === session.id ? updatedSession : s);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
    
    setActiveSession(updatedSession);
  };

  const handleDeleteSession = async (sessionId) => {
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
  };

  const handleUpdateSupply = async (session) => {
    const parsedLimit = parseInt(newSupplyLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) return alert('유효한 보급 한계를 입력하세요.');
    
    const updatedSession = { ...session, supplyLimitTeam1: parsedLimit, supplyLimitTeam2: parsedLimit };
    const updatedSessions = sessions.map(s => s.id === session.id ? updatedSession : s);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
    setEditingSupplyFor(null);
  };

  if (activeSession) {
    return (
      <div>
        <button className="btn btn-secondary" style={{ marginBottom: '16px' }} onClick={() => setActiveSession(null)}>
          ⬅️ 로비로 돌아가기
        </button>
        {activeSession.sessionCategory === 'naval' ? (
          <NavalCombatBoard
            countryId={countryId}
            initialSession={activeSession}
            onSaveSession={async (updatedData) => {
              const updatedSession = { ...activeSession, ...updatedData };
              const updatedSessions = sessions.map(s => s.id === activeSession.id ? updatedSession : s);
              setSessions(updatedSessions);
              await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
              setActiveSession(updatedSession);
            }}
          />
        ) : (
          <LandCombatBoard 
            countryId={countryId} 
            militaryUnits={militaryUnits} 
            corps={corps} 
            armies={armies} 
            generals={generals}
            initialSession={activeSession}
            onSaveSession={async (updatedData) => {
               const updatedSession = { ...activeSession, ...updatedData };
               const updatedSessions = sessions.map(s => s.id === activeSession.id ? updatedSession : s);
               setSessions(updatedSessions);
               await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
               setActiveSession(updatedSession);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>⚔️ 전투 로비</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '취소' : '➕ 세션 만들기'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ padding: '16px', marginBottom: '24px', backgroundColor: 'var(--bg-glass)' }}>
          <h3 style={{ marginBottom: '16px' }}>새 전투 방 생성</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">세션 이름</label>
              <input type="text" className="form-input" value={sessionName} onChange={e => setSessionName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">맵 선택</label>
              <select className="form-select" value={selectedMapId} onChange={e => setSelectedMapId(e.target.value)}>
                <option value="">-- 맵 선택 --</option>
                {maps.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">전투 타입</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label><input type="radio" name="sessionMode" value="human_vs_human" checked={sessionMode === 'human_vs_human'} onChange={() => setSessionMode('human_vs_human')} /> 유저 vs 유저</label>
                <label><input type="radio" name="sessionMode" value="human_vs_ai" checked={sessionMode === 'human_vs_ai'} onChange={() => setSessionMode('human_vs_ai')} /> 유저 vs AI</label>
                <label><input type="radio" name="sessionMode" value="ai_vs_ai" checked={sessionMode === 'ai_vs_ai'} onChange={() => setSessionMode('ai_vs_ai')} /> AI vs AI</label>
              </div>
            </div>
            {sessionMode !== 'ai_vs_ai' && (
              <div className="form-group">
                <label className="form-label">상대방 (선택)</label>
                <select className="form-select" value={opponentId} onChange={e => setOpponentId(e.target.value)}>
                  <option value="">누구나 (또는 AI)</option>
                  <option value="AI">AI 자동 상대</option>
                  {countries.filter(c => c.id !== countryId).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">보급 한계</label>
              <input type="number" className="form-input" value={supplyLimit} onChange={e => setSupplyLimit(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">투입할 야전군 (필수)</label>
            <select className="form-select" value={selectedArmyId} onChange={e => setSelectedArmyId(e.target.value)}>
              <option value="">-- 내 야전군 선택 --</option>
              {armies.map(a => (
                <option key={a.id} value={a.id}>{a.name} (소속 군단: {a.corpsIds.length}개)</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">해전 참여용 함대 (선택)</label>
            <select className="form-select" value={selectedFleetId} onChange={e => setSelectedFleetId(e.target.value)}>
              <option value="">-- 내 함대 선택 --</option>
              {navalFleets.map(f => (
                <option key={f.id} value={f.id}>{f.name} (선박: {(f.shipIds || []).length}척)</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">특수 룰 (관리자 옵션)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="allowNaval" checked={allowNavalBombardment} onChange={e => setAllowNavalBombardment(e.target.checked)} />
              <label htmlFor="allowNaval">해안포격 스킬 허용</label>
            </div>
          </div>
          <button className="btn btn-success" onClick={handleCreateSession}>방 만들기</button>
        </div>
      )}

      {!showCreate && (
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label className="form-label">미리 투입할 야전군 선택 (참여용)</label>
          <select className="form-select" value={selectedArmyId} onChange={e => setSelectedArmyId(e.target.value)}>
            <option value="">-- 내 야전군 선택 --</option>
            {armies.map(a => (
              <option key={a.id} value={a.id}>{a.name} (소속 군단: {a.corpsIds.length}개)</option>
            ))}
          </select>
          <label className="form-label" style={{ marginTop: '10px' }}>미리 투입할 함대 선택 (해전 참여용)</label>
          <select className="form-select" value={selectedFleetId} onChange={e => setSelectedFleetId(e.target.value)}>
            <option value="">-- 내 함대 선택 --</option>
            {navalFleets.map(f => (
              <option key={f.id} value={f.id}>{f.name} (선박: {(f.shipIds || []).length}척)</option>
            ))}
          </select>
        </div>
      )}

      <h3>대기 중인 전투</h3>
      {sessions.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>현재 진행 중이거나 대기 중인 세션이 없습니다.</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
          {sessions.filter(s => s.isActive !== false).map(s => {
            const hostName = countries.find(c => c.id === s.host)?.name || s.host;
            const oppName = s.opponent && s.opponent !== 'AI' ? countries.find(c => c.id === s.opponent)?.name || s.opponent : '누구나 (또는 AI)';
            const mapName = maps.find(m => m.id === s.mapId)?.name || '알 수 없는 맵';
            
            const isHost = s.host === countryId;
            const isTeamBattle = s.isTeamBattle;
            const isTeam1 = isTeamBattle ? s.team1.includes(countryId) : (s.host === countryId);
            const isTeam2 = isTeamBattle ? s.team2.includes(countryId) : (s.opponent === countryId);
            const isAssigned = isTeam1 || isTeam2;
            const isOpponent = s.opponent === countryId || !s.opponent;
            
            // 입장 허용 조건 판단
            let canJoin = false;
            let waitingMessage = '';
            
            if (!s.players[countryId]?.ready && (isOpponent || isAssigned)) {
              if (s.battleMode === 'siege' && s.status === 'defense_prep') {
                if (isTeam2) canJoin = true; // 수비측은 사전배치를 위해 진입 가능
                else waitingMessage = '대기 중 (수비측 사전 배치 중)'; // 공격측 대기
              } else if (s.status === 'waiting') {
                canJoin = true;
              } else if (isTeamBattle) {
                canJoin = true;
              }
            }
            
            const isPlaying = s.players[countryId]?.ready;

            return (
              <div key={s.id} className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: isPlaying ? '4px solid var(--success)' : '4px solid var(--warning)' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0' }}>{s.name} <span className={`badge ${isPlaying ? 'badge-success' : 'badge-warning'}`}>{isPlaying ? '진행/참여 중' : '대기 중'}</span></h4>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isTeamBattle ? '팀전 (다대다)' : `방장: ${hostName} vs 상대: ${oppName}`} | 맵: {mapName} | 보급 한계:{' '}
                    {editingSupplyFor === s.id ? (
                      <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <input type="number" value={newSupplyLimit} onChange={e => setNewSupplyLimit(e.target.value)} style={{ width: '60px', padding: '2px 4px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid #475569', borderRadius: '4px' }} />
                        <button className="btn btn-success" style={{ padding: '2px 6px', fontSize: '0.8rem', minWidth: 'auto' }} onClick={() => handleUpdateSupply(s)}>✔️</button>
                        <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.8rem', minWidth: 'auto' }} onClick={() => setEditingSupplyFor(null)}>❌</button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        T1(공격): {s.supplyLimitTeam1 || s.supplyLimit || 10} / T2(수비): {s.supplyLimitTeam2 || s.supplyLimit || 10}
                        {s.status === 'waiting' && !isTeamBattle && (
                          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', marginLeft: '4px' }} onClick={() => { setEditingSupplyFor(s.id); setNewSupplyLimit(s.supplyLimitTeam1 || s.supplyLimit); }}>✏️</button>
                        )}
                      </span>
                    )}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {waitingMessage && (
                    <span style={{ color: 'var(--warning)', fontSize: '0.9rem', marginRight: '8px' }}>⏳ {waitingMessage}</span>
                  )}
                  {isPlaying && (
                    <button className="btn btn-primary" onClick={() => setActiveSession(s)}>⚔️ 전투 입장</button>
                  )}
                  {canJoin && (
                    <button className="btn btn-success" onClick={() => handleJoinSession(s)}>
                      {s.battleMode === 'siege' && s.status === 'defense_prep' ? '방어 준비 (사전 배치)' : '입장하기 (부대 투입)'}
                    </button>
                  )}
                  {(isHost && !isPlaying && (s.sessionMode === 'ai_vs_ai' || (s.status === 'waiting' && !isTeamBattle))) && (
                    <button className="btn btn-primary" onClick={() => setActiveSession(s)}>
                      ⚔️ 입장 {s.sessionMode === 'ai_vs_ai' ? '(AI 대 AI)' : '(대기/AI 플레이)'}
                    </button>
                  )}
                  {admin && (
                    <button className="btn btn-danger" onClick={() => handleDeleteSession(s.id)}>삭제</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
