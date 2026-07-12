'use client';

import { useMemo, useState } from 'react';

export default function FleetFormation({ countryId, militaryUnits, unitTemplates = [], fleets, admirals, onUpdateFleets }) {
  const [editingFleet, setEditingFleet] = useState(null);

  const navalUnits = useMemo(() => {
    return militaryUnits.filter(u => {
      const tmpl = unitTemplates.find(t => t.id === u.templateId);
      const major = tmpl?.majorCategory || u.majorCategory;
      return major === '해군';
    });
  }, [militaryUnits, unitTemplates]);

  const availableShips = useMemo(() => {
    if (!editingFleet) return navalUnits;
    return navalUnits.filter(u => !fleets.some(f => f.id !== editingFleet.id && (f.shipIds || []).includes(u.id)));
  }, [editingFleet, fleets, navalUnits]);

  const navyAdmirals = useMemo(() => {
    return admirals.filter(g => (g.category || '').includes('해군') || (g.role || '').includes('제독'));
  }, [admirals]);

  const getShipName = (shipId) => {
    const u = militaryUnits.find(mu => mu.id === shipId);
    if (!u) return '알 수 없는 선박';
    const tmpl = unitTemplates.find(t => t.id === u.templateId);
    return u.customName || tmpl?.name || u.name || shipId;
  };

  const saveFleet = async () => {
    if (!editingFleet) return;
    const normalized = {
      ...editingFleet,
      shipIds: editingFleet.shipIds || [],
      manualControlIds: (editingFleet.manualControlIds || []).slice(0, 5),
      flagshipId: editingFleet.flagshipId || null
    };
    const next = editingFleet.id.startsWith('new_')
      ? [...fleets, { ...normalized, id: 'fleet_' + Date.now() }]
      : fleets.map(f => (f.id === editingFleet.id ? normalized : f));
    await onUpdateFleets(next);
    setEditingFleet(null);
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>함대 편성 (유닛-함대)</h3>
        <button className="btn btn-success" onClick={() => setEditingFleet({ id: 'new_' + Date.now(), name: '신규 함대', admiralId: '', shipIds: [], manualControlIds: [], flagshipId: null })}>
          + 새 함대
        </button>
      </div>

      {editingFleet && (
        <div className="card" style={{ padding: '16px', marginBottom: '16px', background: 'var(--bg-secondary)' }}>
          <h4>{editingFleet.id.startsWith('new_') ? '함대 창설' : '함대 수정'}</h4>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <input
              className="form-input"
              value={editingFleet.name}
              onChange={(e) => setEditingFleet({ ...editingFleet, name: e.target.value })}
              placeholder="함대 이름"
            />
            <select
              className="form-select"
              value={editingFleet.admiralId || ''}
              onChange={(e) => setEditingFleet({ ...editingFleet, admiralId: e.target.value })}
            >
              <option value="">-- 제독 선택 --</option>
              {navyAdmirals.map(g => (
                <option key={g.id} value={g.id}>{g.name} (AI Lv.{g.aiLevel || 1})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <strong>소속 선박 ({editingFleet.shipIds?.length || 0})</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {(editingFleet.shipIds || []).map(sid => (
                <span key={sid} className="badge" style={{ cursor: 'pointer' }} onClick={() => setEditingFleet({ ...editingFleet, shipIds: (editingFleet.shipIds || []).filter(x => x !== sid), manualControlIds: (editingFleet.manualControlIds || []).filter(x => x !== sid), flagshipId: editingFleet.flagshipId === sid ? null : editingFleet.flagshipId })}>
                  {getShipName(sid)} ✕
                </span>
              ))}
              {(editingFleet.shipIds || []).length === 0 && <span style={{ color: 'var(--text-muted)' }}>배정된 선박 없음</span>}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong>배치 가능 해군 유닛</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {availableShips.map(u => (
                <button
                  key={u.id}
                  className="btn btn-sm"
                  disabled={(editingFleet.shipIds || []).includes(u.id)}
                  onClick={() => setEditingFleet({ ...editingFleet, shipIds: [...(editingFleet.shipIds || []), u.id] })}
                >
                  + {getShipName(u.id)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong>제독 직할 (최대 5척)</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {(editingFleet.shipIds || []).map(sid => {
                const selected = (editingFleet.manualControlIds || []).includes(sid);
                return (
                  <button
                    key={sid}
                    className={`btn btn-sm ${selected ? 'btn-primary' : ''}`}
                    onClick={() => {
                      const cur = editingFleet.manualControlIds || [];
                      if (selected) {
                        setEditingFleet({ ...editingFleet, manualControlIds: cur.filter(x => x !== sid), flagshipId: editingFleet.flagshipId === sid ? null : editingFleet.flagshipId });
                        return;
                      }
                      if (cur.length >= 5) return;
                      setEditingFleet({ ...editingFleet, manualControlIds: [...cur, sid] });
                    }}
                  >
                    {getShipName(sid)}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong>기함</strong>
            <select
              className="form-select"
              value={editingFleet.flagshipId || ''}
              onChange={(e) => setEditingFleet({ ...editingFleet, flagshipId: e.target.value || null })}
            >
              <option value="">-- 기함 선택 --</option>
              {(editingFleet.manualControlIds || []).map(sid => (
                <option key={sid} value={sid}>{getShipName(sid)}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-success" onClick={saveFleet}>저장</button>
            <button className="btn" onClick={() => setEditingFleet(null)}>취소</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '10px' }}>
        {fleets.map(f => (
          <div key={f.id} className="card" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{f.name}</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  제독: {admirals.find(g => g.id === f.admiralId)?.name || '없음'} | 선박: {(f.shipIds || []).length}척
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-sm" onClick={() => setEditingFleet({ ...f, shipIds: f.shipIds || [], manualControlIds: f.manualControlIds || [], flagshipId: f.flagshipId || null })}>✏️</button>
                <button className="btn btn-sm btn-danger" onClick={() => onUpdateFleets(fleets.filter(x => x.id !== f.id))}>🗑️</button>
              </div>
            </div>
          </div>
        ))}
        {fleets.length === 0 && <div style={{ color: 'var(--text-muted)' }}>생성된 함대가 없습니다.</div>}
      </div>
    </div>
  );
}
