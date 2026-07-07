'use client';

import { useState, useEffect } from 'react';
import { getDataEntry, getAllImages } from '@/lib/store';
import { isAdmin } from '@/lib/auth';

export default function GeographyPage() {
  const [entry, setEntry] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    setAdmin(isAdmin());
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await getDataEntry('geography');
      setEntry(data);
      if (data) {
        const imgs = await getAllImages(data.id);
        setImages(imgs);
      }
    } catch (err) {
      console.error('Failed to load geography:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>지리 정보를 불러오는 중...</span>
      </div>
    );
  }

  const geoData = entry?.data || { mountains: [], rivers: [], plains: [] };
  const categories = [
    { key: 'mountains', title: '산', icon: '⛰️', items: geoData.mountains || [] },
    { key: 'rivers', title: '강', icon: '🏞️', items: geoData.rivers || [] },
    { key: 'plains', title: '평야', icon: '🌾', items: geoData.plains || [] },
  ];

  return (
    <div className="page-content fade-in">
      <div className="section-header">
        <h1 className="section-title">
          <span className="icon">🗻</span>
          지리
        </h1>
        <span className="badge badge-teal">🔓 전체 공개</span>
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '0.95rem' }}>
        한반도에 위치한 주요 산, 강, 평야 정보입니다.
      </p>

      {admin && (
        <div style={{ marginBottom: '20px' }}>
          <a href="/admin" className="btn btn-sm btn-secondary">
            ⚙️ 관리자 페이지에서 편집
          </a>
        </div>
      )}

      {/* Images */}
      {images.length > 0 && (
        <div className="image-gallery" style={{ marginBottom: '32px' }}>
          {images.map((img) => (
            <div key={img.id} className="image-gallery-item">
              <img src={img.url} alt={img.caption || '지리 이미지'} />
              {img.caption && (
                <div className="image-overlay">
                  <span className="image-caption">{img.caption}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Geography Categories */}
      {categories.map((cat) => (
        <div key={cat.key} className="geo-category">
          <h2 className="geo-category-title">
            <span>{cat.icon}</span>
            {cat.title}
            <span className="badge badge-accent" style={{ marginLeft: '8px' }}>
              {cat.items.length}개
            </span>
          </h2>

          {cat.items.length === 0 ? (
            <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                등록된 {cat.title} 정보가 없습니다
              </span>
            </div>
          ) : (
            <div className="geo-list">
              {cat.items.map((item, idx) => (
                <div key={idx} className="geo-item">
                  <span className="geo-item-icon">{cat.icon}</span>
                  <div>
                    <div className="geo-item-name">{item.name}</div>
                    {item.description && (
                      <div className="geo-item-desc">{item.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {categories.every((c) => c.items.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">🌍</div>
          <div className="empty-state-text">아직 등록된 지리 정보가 없습니다</div>
          <div className="empty-state-sub">관리자가 산, 강, 평야 정보를 등록하면 여기에 표시됩니다</div>
        </div>
      )}
    </div>
  );
}
