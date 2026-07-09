'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function UnitTreePage() {
  const [unitTemplates, setUnitTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUnitTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('data_entries')
          .select('data')
          .eq('category', 'game_settings')
          .is('country_id', null)
          .single();
          
        if (error) throw error;
        if (data && data.data && data.data.unitTemplates) {
          setUnitTemplates(data.data.unitTemplates);
        }
      } catch (err) {
        console.error('Failed to load unit templates:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUnitTemplates();
  }, []);

  // Group by Major Category -> Minor Category
  const groupedUnits = {};
  unitTemplates.forEach(tmpl => {
    if (!groupedUnits[tmpl.majorCategory]) {
      groupedUnits[tmpl.majorCategory] = {};
    }
    if (!groupedUnits[tmpl.majorCategory][tmpl.minorCategory]) {
      groupedUnits[tmpl.majorCategory][tmpl.minorCategory] = [];
    }
    groupedUnits[tmpl.majorCategory][tmpl.minorCategory].push(tmpl);
  });

  return (
    <div className="fade-in">
      <header className="header">
        <Link href="/" className="back-link">← 메인으로</Link>
        <h1 className="header-title">⚔️ 유닛 계통도 (유닛 트리)</h1>
        <div style={{ width: '80px' }}></div>
      </header>

      <div className="container" style={{ maxWidth: '1200px' }}>
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>유닛 트리를 불러오는 중...</span>
          </div>
        ) : unitTemplates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚔️</div>
            <div className="empty-state-text">등록된 유닛 템플릿이 없습니다.</div>
          </div>
        ) : (
          <div className="content-section" style={{ background: 'var(--bg-glass)', padding: '24px', borderRadius: '12px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>모의전 세계관의 모든 유닛 편제와 장비를 군종별로 한눈에 조회합니다.</p>
            
            <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
              <div style={{ minWidth: '800px', display: 'flex', gap: '24px' }}>
                {Object.keys(groupedUnits).map(major => (
                  <div key={major} style={{ flex: 1, minWidth: '350px', background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <h3 style={{ borderBottom: '2px solid var(--accent)', paddingBottom: '10px', marginBottom: '16px', color: 'var(--accent)' }}>
                      {major}
                    </h3>
                    
                    {Object.keys(groupedUnits[major]).map(minor => (
                      <div key={minor} style={{ marginBottom: '20px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '12px', color: 'var(--primary)', borderLeft: '4px solid var(--primary)', paddingLeft: '8px' }}>
                          {minor}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '12px', position: 'relative' }}>
                          {/* Vertical Line for tree visual */}
                          <div style={{ position: 'absolute', left: '0', top: '0', bottom: '10px', width: '2px', background: 'var(--border-color)' }}></div>
                          
                          {groupedUnits[major][minor].map(tmpl => (
                            <div key={tmpl.id} style={{ 
                              position: 'relative', background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', 
                              padding: '12px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'center'
                            }}>
                              {/* Connector horizontal line */}
                              <div style={{ position: 'absolute', left: '-12px', top: '50%', width: '12px', height: '2px', background: 'var(--border-color)' }}></div>
                              
                              {tmpl.image ? (
                                <img src={tmpl.image} alt={tmpl.name} style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                              ) : (
                                <div style={{ width: '64px', height: '64px', background: 'var(--bg-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  NO IMG
                                </div>
                              )}
                              
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>{tmpl.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                  <div>⚔️ {tmpl.attack} | 🛡️ {tmpl.defense}</div>
                                  <div>💨 {tmpl.speed} | ❤️ {tmpl.hp}</div>
                                  <div>👥 인력: {tmpl.manpowerCost?.toLocaleString()}</div>
                                  <div>📦 보급: {tmpl.supplyConsumption || 0}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
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
