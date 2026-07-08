'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getMapData, getCountries, getDataEntry } from '@/lib/store';
import { isAdmin } from '@/lib/auth';

const MapEditor = dynamic(() => import('@/components/MapEditor'), { ssr: false });

export default function MapPage() {
  const [mapData, setMapData] = useState(null);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);

  const [baseMapDataUrl, setBaseMapDataUrl] = useState(null);

  useEffect(() => {
    setAdmin(isAdmin());
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [map, ctrs, baseImgEntry] = await Promise.all([
        getMapData(), 
        getCountries(),
        getDataEntry('map_base_image')
      ]);
      setMapData(map);
      setCountries(ctrs);
      if (baseImgEntry?.data?.base64) {
        setBaseMapDataUrl(baseImgEntry.data.base64);
      }
    } catch (err) {
      console.error('Failed to load map data:', err);
    }
    setLoading(false);
  };

  const legend = countries.map((c) => ({ name: c.name, color: c.color }));

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>지도를 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="page-content fade-in">
      <div className="section-header">
        <h1 className="section-title">
          <span className="icon">🗺️</span>
          지도
        </h1>
        <span className="badge badge-teal">🔓 전체 공개</span>
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.95rem' }}>
        {admin
          ? '관리자 모드: 지도를 클릭하여 지역을 색칠할 수 있습니다.'
          : '국가별 영토 현황을 확인하세요. 관리자만 색칠할 수 있습니다.'}
      </p>

      <MapEditor
        editable={false}
        savedImageData={mapData?.image_data}
        baseMapDataUrl={baseMapDataUrl}
        legend={legend}
      />

      {admin && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <a href="/admin" className="btn btn-primary">
            🎨 관리자 페이지에서 지도 색칠하기
          </a>
        </div>
      )}
    </div>
  );
}
