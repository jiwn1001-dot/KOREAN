'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function TechTreePage() {
  const [techTrees, setTechTrees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTechTrees = async () => {
      try {
        const { data, error } = await supabase
          .from('data_entries')
          .select('data')
          .eq('category', 'game_settings')
          .is('country_id', null)
          .single();
          
        if (error) throw error;
        if (data && data.data && data.data.techTrees) {
          setTechTrees(data.data.techTrees);
        }
      } catch (err) {
        console.error('Failed to load tech trees:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTechTrees();
  }, []);

  // 1. Group techTrees by Category
  const treesByCategory = {};
  techTrees.forEach(tree => {
    if (!treesByCategory[tree.category]) treesByCategory[tree.category] = [];
    treesByCategory[tree.category].push(tree);
  });

  // 2. Determine distinct eras
  const allEras = new Set();
  techTrees.forEach(tree => {
    (tree.levels || []).forEach(lvl => {
      if (lvl.era) allEras.add(lvl.era);
    });
  });
  const erasOrder = ['선사시대', '고대시대', '중세시대', '근세시대', '대혁명기', '빅토리안시대', '1차대전기', '2차대전기', '냉전기', '현대', '근미래'];
  const sortedEras = Array.from(allEras).sort((a, b) => {
    const idxA = erasOrder.indexOf(a);
    const idxB = erasOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="fade-in">
      <header className="header">
        <Link href="/" className="back-link">← 메인으로</Link>
        <h1 className="header-title">🌳 전체 기술 계통도 (테크트리)</h1>
        <div style={{ width: '80px' }}></div>
      </header>

      <div className="container" style={{ maxWidth: '1200px' }}>
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>기술 트리를 불러오는 중...</span>
          </div>
        ) : techTrees.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🌳</div>
            <div className="empty-state-text">등록된 기술 트리가 없습니다.</div>
          </div>
        ) : (
          <div className="content-section" style={{ background: 'var(--bg-glass)', padding: '24px', borderRadius: '12px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>모의전 세계관의 모든 기술 항목을 시대별로 한눈에 조회합니다.</p>
            
            <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
              <div style={{ minWidth: '800px' }}>
                {/* Header: Eras */}
                <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: '16px' }}>
                  <div style={{ width: '150px', flexShrink: 0, fontWeight: 'bold', padding: '10px' }}>분류</div>
                  {sortedEras.map(era => (
                    <div key={era} style={{ flex: 1, minWidth: '150px', fontWeight: 'bold', textAlign: 'center', padding: '10px', borderLeft: '1px solid var(--border-color)' }}>
                      {era}
                    </div>
                  ))}
                </div>

                {/* Rows: Categories & Trees */}
                {Object.keys(treesByCategory).map(category => (
                  <div key={category} style={{ marginBottom: '24px' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.1rem', marginBottom: '8px', borderBottom: '1px dashed var(--border-color)', paddingBottom: '4px' }}>
                      [{category}]
                    </div>
                    {treesByCategory[category].map(tree => (
                      <div key={tree.id} style={{ display: 'flex', marginBottom: '16px', position: 'relative' }}>
                        <div style={{ width: '150px', flexShrink: 0, padding: '10px 10px 10px 0', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                          {tree.name}
                        </div>
                        
                        {/* Tree Nodes mapped to Era columns */}
                        {sortedEras.map((era, index) => {
                          const eraLevels = (tree.levels || []).filter(lvl => lvl.era === era);
                          return (
                            <div key={era} style={{ flex: 1, minWidth: `${Math.max(150, (eraLevels?.length || 1) * 160)}px`, padding: '0 10px', position: 'relative', display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
                              {/* Horizontal Line connecting nodes */}
                              {index > 0 && <div style={{ position: 'absolute', left: '-50%', top: '50%', width: '100%', height: '2px', background: 'var(--border-color)', zIndex: 0 }}></div>}
                              
                              {eraLevels.length > 0 ? (
                                eraLevels.map((levelData, lIdx) => (
                                  <div key={lIdx} style={{ 
                                    position: 'relative', zIndex: 1, flex: 1,
                                    background: 'var(--bg-glass)', border: '1px solid var(--accent)', 
                                    padding: '10px', borderRadius: '6px', textAlign: 'center', 
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontSize: '0.85rem'
                                  }}>
                                    <div style={{ fontWeight: 'bold' }}>{levelData.name}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>
                                      Lv.{levelData.level} | {levelData.turns}턴
                                    </div>
                                    {levelData.effect !== 'none' && (
                                      <div style={{ color: 'var(--teal)', fontSize: '0.7rem', marginTop: '4px' }}>
                                        ✨ 효과: {levelData.effect} {levelData.effectValue > 0 ? `(+${levelData.effectValue})` : ''}
                                      </div>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>-</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
