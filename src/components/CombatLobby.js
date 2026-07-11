'use client';

import React, { useState, useEffect } from 'react';
import { getDataEntry, upsertDataEntry, getCountries } from '@/lib/store';
import LandCombatBoard from '@/components/LandCombatBoard';

export default function CombatLobby({ countryId, militaryUnits, corps, armies, generals, admin, countryStats }) {
  const [maps, setMaps] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  
  // Create Session Form
  const [showCreate, setShowCreate] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedMapId, setSelectedMapId] = useState('');
  const [supplyLimit, setSupplyLimit] = useState(10);
  const [opponentId, setOpponentId] = useState('');
  const [selectedArmyId, setSelectedArmyId] = useState('');

  // Supply Limit Negotiation
  const [editingSupplyFor, setEditingSupplyFor] = useState(null);
  const [newSupplyLimit, setNewSupplyLimit] = useState('');

  useEffect(() => {
    loadLobbyData();
    const interval = setInterval(loadLobbyData, 5000); // Poll for sessions
    return () => clearInterval(interval);
  }, []);

  const loadLobbyData = async () => {
    try {
      const mapEntry = await getDataEntry('combat_maps', 'global');
      if (mapEntry?.data?.maps) setMaps(mapEntry.data.maps);

      const sessionEntry = await getDataEntry('combat_sessions', 'global');
      if (sessionEntry?.data?.sessions) setSessions(sessionEntry.data.sessions);
      
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
            // Convert to field unit format
            myUnits.push({
              ...u,
              x: 0, // Default deploy position
              y: 0,
              status: 'field',
              owner: countryId,
              corpsId: c.id,
              aiLevel: generals.find(g => g.id === c.commanderId)?.aiLevel || 1,
              isHQ: false
            });
          }
        });
      }
    });

    // Add HQ
    myUnits.push({
      id: 'hq_' + countryId,
      name: '야전사령부',
      subCategory: 'HQ',
      x: 0,
      y: 0,
      status: 'field',
      owner: countryId,
      isHQ: true,
      hp: 100
    });

    const newSession = {
      id: 'session_' + Date.now(),
      name: sessionName,
      mapId: selectedMapId,
      supplyLimit: parseInt(supplyLimit) || 10,
      host: countryId,
      opponent: opponentId || 'AI',
      status: 'waiting',
      players: {
        [countryId]: {
          armyId: selectedArmyId,
          ready: true,
          units: myUnits,
          stats: countryStats
        }
      },
      board: maps.find(m => m.id === selectedMapId)?.board,
      createdAt: new Date().toISOString()
    };

    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', 'global', { sessions: updatedSessions });
    
    setShowCreate(false);
    alert('전투 세션이 생성되었습니다. 상대방의 수락을 기다립니다.');
  };

  const handleJoinSession = async (session) => {
    if (session.battleMode === 'siege' && session.status === 'defense_prep') {
      const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
      if (isTeam1) {
        return alert('현재 수비측(방어팀)이 전선을 사전 배치 중입니다. 관리자가 침공을 허가할 때까지 대기해주세요.');
      }
    }

    if (!selectedArmyId) {
      return alert('참여하기 전 투입할 야전군을 선택해주세요.');
    }

    const army = armies.find(a => a.id === selectedArmyId);
    if (!army) return alert('야전군을 찾을 수 없습니다.');
    
    const myUnits = [];
    army.corpsIds.forEach(cid => {
      const c = corps.find(co => co.id === cid);
      if (c) {
        c.units.forEach(uid => {
          const u = militaryUnits.find(mu => mu.id === uid);
          if (u) {
            const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
            const startX = isTeam1 ? 0 : 19;
            myUnits.push({
              ...u,
              x: startX,
              y: startX,
              status: 'standby', // Starts in standby for manual deployment
              supplyConsumption: u.supplyConsumption || 1,
              owner: countryId,
              corpsId: c.id,
              aiLevel: generals.find(g => g.id === c.commanderId)?.aiLevel || 1,
              isHQ: false
            });
          }
        });
      }
    });

    const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
    const startX = isTeam1 ? 0 : 19;

    myUnits.push({
      id: 'hq_' + countryId,
      name: '야전사령부',
      subCategory: 'HQ',
      x: startX,
      y: startX,
      status: 'standby', // Starts in standby for manual deployment
      owner: countryId,
      isHQ: true,
      hp: 100,
      supplyConsumption: 0 // HQ costs 0 supply
    });

    const updatedSession = { ...session };
    
    // In team battles, the armyId is already pre-assigned by the admin, but we update the units
    if (!updatedSession.players[countryId]) {
      updatedSession.players[countryId] = {};
    }
    
    updatedSession.players[countryId] = {
      ...updatedSession.players[countryId],
      armyId: selectedArmyId,
      ready: true,
      units: myUnits,
      stats: countryStats
    };

    // If 1v1, it starts when opponent joins. For team battles, it's always playing as soon as one person joins or admin created it.
    if (!session.isTeamBattle) {
      updatedSession.status = 'playing';
    }

    // Combine units for the board
    updatedSession.units = [
      ...Object.values(updatedSession.players).filter(p => p.ready).flatMap(p => p.units || [])
    ];

    const updatedSessions = sessions.map(s => s.id === session.id ? updatedSession : s);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', 'global', { sessions: updatedSessions });
    
    setActiveSession(updatedSession);
  };

  const handleDeleteSession = async (sessionId) => {
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', 'global', { sessions: updatedSessions });
  };

  const handleUpdateSupply = async (session) => {
    const parsedLimit = parseInt(newSupplyLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) return alert('유효한 보급 한계를 입력하세요.');
    
    const updatedSession = { ...session, supplyLimit: parsedLimit };
    const updatedSessions = sessions.map(s => s.id === session.id ? updatedSession : s);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', 'global', { sessions: updatedSessions });
    setEditingSupplyFor(null);
  };

  if (activeSession) {
    return (
      <div>
        <button className="btn btn-secondary" style={{ marginBottom: '16px' }} onClick={() => setActiveSession(null)}>
          ⬅️ 로비로 돌아가기
        </button>
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
             await upsertDataEntry('combat_sessions', 'global', { sessions: updatedSessions });
             setActiveSession(updatedSession);
          }}
        />
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
              <label className="form-label">상대방 (선택)</label>
              <select className="form-select" value={opponentId} onChange={e => setOpponentId(e.target.value)}>
                <option value="">누구나 (또는 AI)</option>
                {countries.filter(c => c.id !== countryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
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
                        {s.supplyLimit}
                        {s.status === 'waiting' && !isTeamBattle && (
                          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', marginLeft: '4px' }} onClick={() => { setEditingSupplyFor(s.id); setNewSupplyLimit(s.supplyLimit); }}>✏️</button>
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
                  {s.status === 'waiting' && isHost && !isTeamBattle && !isPlaying && (
                    <button className="btn btn-primary" onClick={() => setActiveSession(s)}>⚔️ 입장 (대기/AI 플레이)</button>
                  )}
                  {(admin || isHost) && (
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
