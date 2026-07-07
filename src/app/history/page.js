'use client';

import { useState, useEffect } from 'react';
import { getDataEntry, getAllImages } from '@/lib/store';
import { isAdmin } from '@/lib/auth';

export default function HistoryPage() {
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
      const data = await getDataEntry('history');
      setEntry(data);
      if (data) {
        const imgs = await getAllImages(data.id);
        setImages(imgs);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>역사 정보를 불러오는 중...</span>
      </div>
    );
  }

  const content = entry?.data?.content || '';

  return (
    <div className="page-content fade-in">
      <div className="section-header">
        <h1 className="section-title">
          <span className="icon">📜</span>
          역사
        </h1>
        <span className="badge badge-teal">🔓 전체 공개</span>
      </div>

      {admin && (
        <div style={{ marginBottom: '20px' }}>
          <a href="/admin" className="btn btn-sm btn-secondary">
            ⚙️ 관리자 페이지에서 편집
          </a>
        </div>
      )}

      {/* Top Images */}
      {images.length > 0 && (
        <div className="image-gallery" style={{ marginBottom: '24px' }}>
          {images.map((img) => (
            <div key={img.id} className="image-gallery-item">
              <img src={img.url} alt={img.caption || '역사 이미지'} />
              {img.caption && (
                <div className="image-overlay">
                  <span className="image-caption">{img.caption}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="card card-glass">
        <div className="card-body">
          {content ? (
            <div className="content-text">{content}</div>
          ) : (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon">📝</div>
              <div className="empty-state-text">아직 작성된 역사 정보가 없습니다</div>
              <div className="empty-state-sub">관리자가 역사 내용을 등록하면 여기에 표시됩니다</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
