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
  const [supplyLimit, setSupplyLimit] = useState(10);
  
  // Team 1 & Team 2: { countryId, armyId }[]
  const [team1, setTeam1] = useState([]);
  const [team2, setTeam2] = useState([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [countries]);

  const loadData = async () => {
    const sessionEntry = await getDataEntry('combat_sessions', 'global');
    if (sessionEntry?.data?.sessions) setSessions(sessionEntry.data.sessions);

    const mapEntry = await getDataEntry('combat_maps', 'global');
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
    const newEntry = { countryId: defaultCountry, armyId: '' };
    if (teamNum === 1) setTeam1([...team1, newEntry]);
    else setTeam2([...team2, newEntry]);
  };

  const handleUpdateTeam = (teamNum, index, field, value) => {
    if (teamNum === 1) {
      const newTeam = [...team1];
      newTeam[index][field] = value;
      if (field === 'countryId') newTeam[index].armyId = ''; // Reset army if country changes
      setTeam1(newTeam);
    } else {
      const newTeam = [...team2];
      newTeam[index][field] = value;
      if (field === 'countryId') newTeam[index].armyId = '';
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
    
    for (const t of [...team1, ...team2]) {
      if (!t.armyId) return alert(`국가(${t.countryId})의 투입 야전군이 선택되지 않았습니다.`);
    }

    const newSession = {
      id: 'session_' + Date.now(),
      name: sessionName,
      mapId: selectedMapId,
      supplyLimit: parseInt(supplyLimit),
      host: team1[0].countryId, // 첫 번째 국가가 방장 역할 (팀 리더)
      opponent: team2[0].countryId,
      status: 'waiting', 
      players: {}, // 각 국가의 정보가 들어감
      board: maps.find(m => m.id === selectedMapId)?.board,
      units: [], // 유닛은 각 유저가 접속했을 때 로딩되거나 여기서 계산. 로비에서 알아서 병합됨.
      isTeamBattle: true,
      team1: team1.map(t => t.countryId),
      team2: team2.map(t => t.countryId),
      createdAt: new Date().toISOString()
    };

    // 각 팀 멤버들의 players 데이터 초기화 (유닛 데이터는 각 유저가 전투로비 진입시 채워지게 됨)
    [...team1, ...team2].forEach(t => {
      newSession.players[t.countryId] = {
        armyId: t.armyId,
        ready: false, // 유저가 개별적으로 준비 완료(입장) 해야 함
        units: [],
        stats: { penetration: 0, antiAir: 0, vision: 0 } // 접속 시 갱신됨
      };
    });

    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', 'global', { sessions: updatedSessions });
    
    alert('팀전 세션 강제 배정이 완료되었습니다.');
    setSessionName('');
    setTeam1([]);
    setTeam2([]);
  };

  const handleDeleteSession = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    await upsertDataEntry('combat_sessions', 'global', { sessions: updated });
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
          <label className="form-label">전투 맵 선택</label>
          <select className="form-select" value={selectedMapId} onChange={e => setSelectedMapId(e.target.value)}>
            <option value="">-- 맵 선택 --</option>
            {maps.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">보급 한계</label>
          <input type="number" className="form-input" value={supplyLimit} onChange={e => setSupplyLimit(e.target.value)} />
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
              <select className="form-select" value={t.armyId} onChange={e => handleUpdateTeam(1, idx, 'armyId', e.target.value)}>
                <option value="">- 야전군 선택 -</option>
                {fieldArmiesMap[t.countryId]?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
              <select className="form-select" value={t.armyId} onChange={e => handleUpdateTeam(2, idx, 'armyId', e.target.value)}>
                <option value="">- 야전군 선택 -</option>
                {fieldArmiesMap[t.countryId]?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
          <div key={s.id} className="card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{s.name}</strong> ({s.isTeamBattle ? '팀전' : '1vs1'}) | 맵: {maps.find(m => m.id === s.mapId)?.name}
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSession(s.id)}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}
