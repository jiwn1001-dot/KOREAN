'use client';

import React, { useState, useEffect } from 'react';
import { getDataEntry, upsertDataEntry } from '@/lib/store';

export default function AdminCombatSessions({ countries }) {
  const [sessions, setSessions] = useState([]);
  const [maps, setMaps] = useState([]);
  const [fieldArmiesMap, setFieldArmiesMap] = useState({}); // { countryId: [armies] }

  // Form State
  const [sessionName, setSessionName] = useState('');
  const [selectedMapId, setSelectedMapId] = useState('');
  const [supplyLimitTeam1, setSupplyLimitTeam1] = useState(10);
  const [supplyLimitTeam2, setSupplyLimitTeam2] = useState(10);
  const [sessionCategory, setSessionCategory] = useState('land'); // land, naval, bombing
  const [battleMode, setBattleMode] = useState('encounter'); // encounter, siege
  const [allowNavalBombardment, setAllowNavalBombardment] = useState(false);
  const [allowAirTeam1, setAllowAirTeam1] = useState(true);
  const [allowAirTeam2, setAllowAirTeam2] = useState(true);
  
  // Team 1 & Team 2: { countryId, armyId }[]
  const [team1, setTeam1] = useState([]);
  const [team2, setTeam2] = useState([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [countries]);

  const loadData = async () => {
    const sessionEntry = await getDataEntry('combat_sessions', null);
    if (sessionEntry?.data?.sessions) setSessions(sessionEntry.data.sessions);

    const mapEntry = await getDataEntry('combat_maps', null);
    if (mapEntry?.data?.maps) setMaps(mapEntry.data.maps);

    const fArmies = {};
    for (const c of countries) {
      const armyEntry = await getDataEntry('field_armies', c.id);
      fArmies[c.id] = armyEntry?.data?.armies || [];
    }
    setFieldArmiesMap(fArmies);
  };

  const handleAddToTeam = (teamNum) => {
    const defaultCountry = countries[0]?.id;
    if (!defaultCountry) return;
    const newEntry = { countryId: defaultCountry };
    if (teamNum === 1) setTeam1([...team1, newEntry]);
    else setTeam2([...team2, newEntry]);
  };

  const handleUpdateTeam = (teamNum, index, field, value) => {
    if (teamNum === 1) {
      const newTeam = [...team1];
      newTeam[index][field] = value;
      setTeam1(newTeam);
    } else {
      const newTeam = [...team2];
      newTeam[index][field] = value;
      setTeam2(newTeam);
    }
  };

  const handleRemoveFromTeam = (teamNum, index) => {
    if (teamNum === 1) {
      setTeam1(team1.filter((_, i) => i !== index));
    } else {
      setTeam2(team2.filter((_, i) => i !== index));
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName || !selectedMapId) return alert('세션 이름과 맵을 지정하세요.');
    if (team1.length === 0 || team2.length === 0) return alert('각 팀에 최소 한 명 이상의 국가가 배정되어야 합니다.');

    const newSession = {
      id: 'session_' + Date.now(),
      name: sessionName,
      mapId: selectedMapId,
      supplyLimitTeam1: parseInt(supplyLimitTeam1),
      supplyLimitTeam2: parseInt(supplyLimitTeam2),
      sessionCategory,
      battleMode,
      allowNavalBombardment,
      allowAirTeam1,
      allowAirTeam2,
      host: team1[0].countryId, // 첫 번째 국가가 방장 역할 (팀 리더)
      opponent: team2[0].countryId,
      status: battleMode === 'siege' ? 'defense_prep' : 'waiting', // 방어전은 사전배치 페이즈 대기
      players: {}, // 각 국가의 정보가 들어감
      board: maps.find(m => m.id === selectedMapId)?.board,
      units: [], // 유닛은 각 유저가 접속했을 때 로딩되거나 여기서 계산. 로비에서 알아서 병합됨.
      isTeamBattle: true,
      team1: team1.map(t => t.countryId),
      team2: team2.map(t => t.countryId),
      createdAt: new Date().toISOString(),
      isActive: true // 기본적으로 세션은 활성화 상태로 생성됨
    };

    // 각 팀 멤버들의 players 데이터 초기화 (유닛 데이터 및 야전군은 유저가 로비에서 입장시 세팅)
    [...team1, ...team2].forEach(t => {
      newSession.players[t.countryId] = {
        armyId: null,
        isAI: false,
        ready: false, // 유저가 개별적으로 준비 완료(입장) 해야 함
        orders: [],
        skills: [],
        units: [],
        stats: { penetration: 0, antiAir: 0, vision: 0 } // 접속 시 갱신됨
      };
    });

    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
    
    alert('팀전 세션 강제 배정이 완료되었습니다.');
    setSessionName('');
    setTeam1([]);
    setTeam2([]);
  };

  const handleTriggerInvasion = async (id) => {
    if (!confirm('수비측의 사전 배치가 모두 끝났습니까? 공격측의 침공을 허용(개시)하시겠습니까?')) return;
    const updated = sessions.map(s => {
      if (s.id === id) return { ...s, status: 'waiting' }; // waiting으로 바꿔 공격측 접속 허용
      return s;
    });
    setSessions(updated);
    await upsertDataEntry('combat_sessions', null, { sessions: updated });
    alert('침공이 개시되었습니다! 이제 공격측 유저들이 세션에 합류할 수 있습니다.');
  };

  const handleDeleteSession = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    await upsertDataEntry('combat_sessions', null, { sessions: updated });
  };

  const handleToggleActiveSession = async (id, currentStatus) => {
    const updated = sessions.map(s => {
      if (s.id === id) return { ...s, isActive: !currentStatus };
      return s;
    });
    setSessions(updated);
    await upsertDataEntry('combat_sessions', null, { sessions: updated });
  };

  const handleUpdatePlayerControl = async (sessionId, playerId, controlMode) => {
    const isAIControl = controlMode === 'ai' || playerId === 'AI';
    const updated = sessions.map(s => {
      if (s.id !== sessionId) return s;

      const nextPlayers = { ...(s.players || {}) };
      const prevPlayer = nextPlayers[playerId] || {};

      nextPlayers[playerId] = {
        ...prevPlayer,
        isAI: isAIControl,
        ready: isAIControl ? true : false,
        orders: isAIControl ? [] : (prevPlayer.orders || []),
        skills: isAIControl ? [] : (prevPlayer.skills || [])
      };

      return { ...s, players: nextPlayers };
    });

    setSessions(updated);
    await upsertDataEntry('combat_sessions', null, { sessions: updated });
  };

  const getCountryName = (id) => {
    if (id === 'AI') return 'AI';
    return countries.find(c => c.id === id)?.name || id;
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <h2>⚔️ 지상전 세션 강제 배정 (팀전/다대다)</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>관리자 권한으로 양측 팀을 구성하여 전투 세션을 강제 생성합니다.</p>
      
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">세션 이름</label>
          <input type="text" className="form-input" value={sessionName} onChange={e => setSessionName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">전장 카테고리</label>
          <select className="form-select" value={sessionCategory} onChange={e => setSessionCategory(e.target.value)}>
            <option value="land">지상전 (육전)</option>
            <option value="naval">해전</option>
            <option value="bombing">폭격전</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">전투 타입</label>
          <select className="form-select" value={battleMode} onChange={e => setBattleMode(e.target.value)}>
            <option value="encounter">조우전 (공격 vs 공격)</option>
            <option value="siege">방어/공성전 (공격 vs 수비)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">전투 맵 (전선)</label>
          <select className="form-select" value={selectedMapId} onChange={e => setSelectedMapId(e.target.value)}>
            <option value="">-- 맵 선택 --</option>
            {maps.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Team 1 보급 한계</label>
          <input type="number" className="form-input" value={supplyLimitTeam1} onChange={e => setSupplyLimitTeam1(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Team 2 보급 한계</label>
          <input type="number" className="form-input" value={supplyLimitTeam2} onChange={e => setSupplyLimitTeam2(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">특수 룰</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <input type="checkbox" id="adminAllowNaval" checked={allowNavalBombardment} onChange={e => setAllowNavalBombardment(e.target.checked)} />
            <label htmlFor="adminAllowNaval">해안포격 스킬 허용</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <input type="checkbox" id="adminAllowAirT1" checked={allowAirTeam1} onChange={e => setAllowAirTeam1(e.target.checked)} />
            <label htmlFor="adminAllowAirT1">Team 1 공군 사용 허용</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" id="adminAllowAirT2" checked={allowAirTeam2} onChange={e => setAllowAirTeam2(e.target.checked)} />
            <label htmlFor="adminAllowAirT2">Team 2 공군 사용 허용</label>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
        {/* Team 1 */}
        <div className="card" style={{ padding: '16px', border: '1px solid var(--accent)' }}>
          <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Team 1 (공격 측 - 좌측 배치)</h3>
          {team1.map((t, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <select className="form-select" value={t.countryId} onChange={e => handleUpdateTeam(1, idx, 'countryId', e.target.value)}>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn btn-sm btn-danger" onClick={() => handleRemoveFromTeam(1, idx)}>X</button>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => handleAddToTeam(1)}>+ 국가 추가</button>
        </div>

        {/* Team 2 */}
        <div className="card" style={{ padding: '16px', border: '1px solid var(--danger)' }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: '16px' }}>Team 2 (방어 측 - 우측 배치)</h3>
          {team2.map((t, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <select className="form-select" value={t.countryId} onChange={e => handleUpdateTeam(2, idx, 'countryId', e.target.value)}>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn btn-sm btn-danger" onClick={() => handleRemoveFromTeam(2, idx)}>X</button>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => handleAddToTeam(2)}>+ 국가 추가</button>
        </div>
      </div>

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <button className="btn btn-primary btn-lg" onClick={handleCreateSession}>강제 배정 및 세션 생성</button>
      </div>

      <hr style={{ margin: '32px 0', borderColor: 'var(--border-color)' }} />
      
      <h3>생성된 전체 세션 목록</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sessions.map(s => (
          <div key={s.id} className="card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{marginRight:'8px'}}>{s.name}</strong> 
              <span style={{color:'var(--accent)'}}>[{s.sessionCategory === 'land' ? '육전' : s.sessionCategory === 'naval' ? '해전' : '폭격전'}]</span> 
              <span style={{color:'var(--danger)', marginLeft:'4px'}}>[{s.battleMode === 'siege' ? '방어전' : '조우전'}]</span> | 
              맵: {maps.find(m => m.id === s.mapId)?.name} | 
              보급(T1/T2): {s.supplyLimitTeam1 || s.supplyLimit} / {s.supplyLimitTeam2 || s.supplyLimit}
              
              {s.winner && (
                <span style={{ color: 'var(--success)', marginLeft: '16px', fontWeight: 'bold' }}>
                  🏆 승리자: {countries.find(c => c.id === s.winner)?.name || s.winner}
                </span>
              )}

              {s.battleMode === 'siege' && s.status === 'defense_prep' && (
                <button className="btn btn-sm btn-warning" style={{marginLeft:'16px'}} onClick={() => handleTriggerInvasion(s.id)}>🔥 침공 개시 (공격측 진입 허용)</button>
              )}

              {s.players && Object.keys(s.players).length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>조작 주체:</span>
                  {Object.entries(s.players).map(([playerId, playerData]) => {
                    const fixedAI = playerId === 'AI';
                    const selectedMode = (playerData?.isAI || fixedAI) ? 'ai' : 'user';
                    return (
                      <span
                        key={`${s.id}_${playerId}`}
                        style={{
                          display: 'inline-flex',
                          gap: '6px',
                          alignItems: 'center',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '4px 8px'
                        }}
                      >
                        <span style={{ fontSize: '0.8rem' }}>{getCountryName(playerId)}</span>
                        <select
                          className="form-select"
                          style={{ padding: '2px 6px', minWidth: '96px', fontSize: '0.8rem' }}
                          value={selectedMode}
                          disabled={fixedAI}
                          onChange={(e) => handleUpdatePlayerControl(s.id, playerId, e.target.value)}
                        >
                          <option value="user">유저 조작</option>
                          <option value="ai">AI 조작</option>
                        </select>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className={`btn btn-sm ${s.isActive === false ? 'btn-secondary' : 'btn-success'}`}
                onClick={() => handleToggleActiveSession(s.id, s.isActive !== false)}
              >
                {s.isActive === false ? '🔴 비활성화' : '🟢 활성화됨'}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSession(s.id)}>삭제</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
