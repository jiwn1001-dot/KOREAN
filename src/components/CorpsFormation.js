'use client';

import { useState } from 'react';

export default function CorpsFormation({ countryId, militaryUnits, corps, armies, generals, onUpdateCorps, onUpdateArmies }) {
  const [activeTab, setActiveTab] = useState('corps');
  const [editingCorps, setEditingCorps] = useState(null);
  const [editingArmy, setEditingArmy] = useState(null);

  // 선택되지 않은 유닛 필터링 (다른 군단에 없는 유닛)
  const availableUnits = militaryUnits.filter(u => {
    return !corps.some(c => c.id !== editingCorps?.id && c.units.includes(u.id));
  });

  const availableCorps = corps.filter(c => {
    return !armies.some(a => a.id !== editingArmy?.id && a.corpsIds.includes(c.id));
  });

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button className={`btn ${activeTab === 'corps' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('corps')}>
          군단 편성
        </button>
        <button className={`btn ${activeTab === 'army' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('army')}>
          야전군 편성
        </button>
      </div>

      {activeTab === 'corps' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>군단 목록</h3>
            <button className="btn btn-success" onClick={() => setEditingCorps({ id: 'new_' + Date.now(), name: '새 군단', commanderId: '', units: [] })}>
              + 새 군단 창설
            </button>
          </div>

          {editingCorps && (
            <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <h4>{editingCorps.id.startsWith('new') ? '군단 창설' : '군단 수정'}</h4>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <input 
                  type="text" 
                  value={editingCorps.name} 
                  onChange={e => setEditingCorps({...editingCorps, name: e.target.value})}
                  className="input" 
                  placeholder="군단 이름"
                />
                <select 
                  className="input" 
                  value={editingCorps.commanderId}
                  onChange={e => setEditingCorps({...editingCorps, commanderId: e.target.value})}
                >
                  <option value="">-- 장군 선택 --</option>
                  {generals.map(g => (
                    <option key={g.id} value={g.id}>{g.name} (AI Lv: {g.aiLevel})</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <h5>소속 유닛 (최대 5개): {editingCorps.units.length}/5</h5>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: '40px', padding: '8px', border: '1px dashed var(--border-color)' }}>
                  {editingCorps.units.map(uid => {
                    const u = militaryUnits.find(mu => mu.id === uid);
                    return (
                      <div key={uid} style={{ padding: '4px 8px', backgroundColor: 'var(--primary)', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                           onClick={() => setEditingCorps({...editingCorps, units: editingCorps.units.filter(id => id !== uid)})}>
                        {u?.name || '알 수 없는 유닛'} (클릭해제)
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h5>배치 가능 유닛</h5>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '200px', overflowY: 'auto' }}>
                  {availableUnits.map(u => (
                    <button 
                      key={u.id}
                      className="btn btn-sm"
                      disabled={editingCorps.units.length >= 5 || editingCorps.units.includes(u.id)}
                      onClick={() => setEditingCorps({...editingCorps, units: [...editingCorps.units, u.id]})}
                    >
                      + {u.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" onClick={() => {
                  const updated = editingCorps.id.startsWith('new') 
                    ? [...corps, { ...editingCorps, id: 'corps_' + Date.now() }]
                    : corps.map(c => c.id === editingCorps.id ? editingCorps : c);
                  onUpdateCorps(updated);
                  setEditingCorps(null);
                }}>저장</button>
                <button className="btn" onClick={() => setEditingCorps(null)}>취소</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {corps.map(c => {
              const commander = generals.find(g => g.id === c.commanderId);
              return (
                <div key={c.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0 }}>{c.name}</h4>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-sm" onClick={() => setEditingCorps(c)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => {
                        if(confirm('삭제하시겠습니까?')) onUpdateCorps(corps.filter(x => x.id !== c.id));
                      }}>🗑️</button>
                    </div>
                  </div>
                  <p style={{ margin: '8px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    지휘관: {commander ? `${commander.name} (Lv.${commander.aiLevel})` : '없음'}
                  </p>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {c.units.map(uid => {
                      const u = militaryUnits.find(mu => mu.id === uid);
                      return <span key={uid} style={{ fontSize: '0.8rem', padding: '2px 6px', background: 'var(--bg-body)', borderRadius: '4px' }}>{u?.name}</span>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'army' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>야전군 목록</h3>
            <button className="btn btn-success" onClick={() => setEditingArmy({ id: 'new_' + Date.now(), name: '새 야전군', corpsIds: [] })}>
              + 새 야전군 창설
            </button>
          </div>

          {editingArmy && (
            <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <h4>{editingArmy.id.startsWith('new') ? '야전군 창설' : '야전군 수정'}</h4>
              <div style={{ marginBottom: '12px' }}>
                <input 
                  type="text" 
                  value={editingArmy.name} 
                  onChange={e => setEditingArmy({...editingArmy, name: e.target.value})}
                  className="input" 
                  placeholder="야전군 이름"
                />
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <h5>소속 군단: {editingArmy.corpsIds.length}개</h5>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: '40px', padding: '8px', border: '1px dashed var(--border-color)' }}>
                  {editingArmy.corpsIds.map(cid => {
                    const c = corps.find(co => co.id === cid);
                    return (
                      <div key={cid} style={{ padding: '4px 8px', backgroundColor: 'var(--primary)', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                           onClick={() => setEditingArmy({...editingArmy, corpsIds: editingArmy.corpsIds.filter(id => id !== cid)})}>
                        {c?.name || '알 수 없는 군단'} (클릭해제)
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h5>배치 가능 군단</h5>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {availableCorps.map(c => (
                    <button 
                      key={c.id}
                      className="btn btn-sm"
                      onClick={() => setEditingArmy({...editingArmy, corpsIds: [...editingArmy.corpsIds, c.id]})}
                    >
                      + {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" onClick={() => {
                  const updated = editingArmy.id.startsWith('new') 
                    ? [...armies, { ...editingArmy, id: 'army_' + Date.now() }]
                    : armies.map(a => a.id === editingArmy.id ? editingArmy : a);
                  onUpdateArmies(updated);
                  setEditingArmy(null);
                }}>저장</button>
                <button className="btn" onClick={() => setEditingArmy(null)}>취소</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {armies.map(a => (
              <div key={a.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0 }}>{a.name}</h4>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-sm" onClick={() => setEditingArmy(a)}>✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => {
                      if(confirm('삭제하시겠습니까?')) onUpdateArmies(armies.filter(x => x.id !== a.id));
                    }}>🗑️</button>
                  </div>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {a.corpsIds.map(cid => {
                    const c = corps.find(co => co.id === cid);
                    return <span key={cid} style={{ fontSize: '0.85rem', padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: '4px' }}>{c?.name}</span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
