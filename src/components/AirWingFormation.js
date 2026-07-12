'use client';

import { useMemo, useState } from 'react';

export default function AirWingFormation({ militaryUnits, unitTemplates = [], airWings, generals, onUpdateAirWings }) {
  const [editingWing, setEditingWing] = useState(null);

  const airUnits = useMemo(() => {
    return militaryUnits.filter((u) => {
      const tmpl = unitTemplates.find((t) => t.id == u.templateId);
      const major = tmpl?.majorCategory || u.majorCategory;
      return major === '공군';
    });
  }, [militaryUnits, unitTemplates]);

  const availableAircraft = useMemo(() => {
    if (!editingWing) return airUnits;
    return airUnits.filter((u) => !airWings.some((w) => w.id !== editingWing.id && (w.unitIds || []).includes(u.id)));
  }, [editingWing, airUnits, airWings]);

  const airCommanders = useMemo(() => {
    return (generals || []).filter((g) => (g.category || '').includes('공군') || (g.role || '').includes('공군') || (g.role || '').includes('비행'));
  }, [generals]);

  const getUnitName = (unitId) => {
    const u = militaryUnits.find((mu) => mu.id === unitId);
    if (!u) return '알 수 없는 항공기';
    const tmpl = unitTemplates.find((t) => t.id == u.templateId);
    return u.customName || tmpl?.name || u.name || unitId;
  };

  const saveWing = async () => {
    if (!editingWing) return;
    const normalized = {
      ...editingWing,
      unitIds: editingWing.unitIds || [],
      commanderId: editingWing.commanderId || null
    };
    const next = editingWing.id.startsWith('new_')
      ? [...airWings, { ...normalized, id: 'air_wing_' + Date.now() }]
      : airWings.map((w) => (w.id === editingWing.id ? normalized : w));
    await onUpdateAirWings(next);
    setEditingWing(null);
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>비행단 편제 (공군 전용)</h3>
        <button
          className="btn btn-success"
          onClick={() => setEditingWing({ id: 'new_' + Date.now(), name: '신규 비행단', commanderId: '', unitIds: [] })}
        >
          + 새 비행단
        </button>
      </div>

      {editingWing && (
        <div className="card" style={{ padding: '16px', marginBottom: '16px', background: 'var(--bg-secondary)' }}>
          <h4>{editingWing.id.startsWith('new_') ? '비행단 창설' : '비행단 수정'}</h4>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <input
              className="form-input"
              value={editingWing.name}
              onChange={(e) => setEditingWing({ ...editingWing, name: e.target.value })}
              placeholder="비행단 이름"
            />
            <select
              className="form-select"
              value={editingWing.commanderId || ''}
              onChange={(e) => setEditingWing({ ...editingWing, commanderId: e.target.value })}
            >
              <option value="">-- 비행단 지휘관 선택 --</option>
              {airCommanders.map((g) => (
                <option key={g.id} value={g.id}>{g.name} (AI Lv.{g.aiLevel || 1})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <strong>소속 항공기 ({editingWing.unitIds?.length || 0})</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {(editingWing.unitIds || []).map((uid) => (
                <span
                  key={uid}
                  className="badge"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setEditingWing({ ...editingWing, unitIds: (editingWing.unitIds || []).filter((x) => x !== uid) })}
                >
                  {getUnitName(uid)} ✕
                </span>
              ))}
              {(editingWing.unitIds || []).length === 0 && <span style={{ color: 'var(--text-muted)' }}>배정된 항공기 없음</span>}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong>배치 가능 공군 유닛 (공군만)</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {availableAircraft.map((u) => (
                <button
                  key={u.id}
                  className="btn btn-sm"
                  disabled={(editingWing.unitIds || []).includes(u.id)}
                  onClick={() => setEditingWing({ ...editingWing, unitIds: [...(editingWing.unitIds || []), u.id] })}
                >
                  + {getUnitName(u.id)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-success" onClick={saveWing}>저장</button>
            <button className="btn" onClick={() => setEditingWing(null)}>취소</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '10px' }}>
        {(airWings || []).map((w) => (
          <div key={w.id} className="card" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{w.name}</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  지휘관: {generals.find((g) => g.id === w.commanderId)?.name || '없음'} | 항공기: {(w.unitIds || []).length}기
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-sm" onClick={() => setEditingWing({ ...w, unitIds: w.unitIds || [], commanderId: w.commanderId || '' })}>✏️</button>
                <button className="btn btn-sm btn-danger" onClick={() => onUpdateAirWings((airWings || []).filter((x) => x.id !== w.id))}>🗑️</button>
              </div>
            </div>
          </div>
        ))}
        {(airWings || []).length === 0 && <div style={{ color: 'var(--text-muted)' }}>생성된 비행단이 없습니다.</div>}
      </div>
    </div>
  );
}
