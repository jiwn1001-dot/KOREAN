'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TILE_TYPES, createLandBoard } from '@/lib/landCombat';

const TILE_COLORS = {
  [TILE_TYPES.NORMAL]: '#2d3748', // 짙은 회색
  [TILE_TYPES.ROUGH]: '#8b7355', // 험지 (갈색)
  [TILE_TYPES.MOUNTAIN]: '#64748b', // 산 (슬레이트)
  [TILE_TYPES.WATER]: '#0ea5e9', // 물 (파란색)
  [TILE_TYPES.FORTRESS]: '#22c55e', // 요새 (초록색)
  [TILE_TYPES.ULTIMATE_FORTRESS]: '#10b981', // 궁극의 요새 (에메랄드)
  [TILE_TYPES.PEAK]: '#f1f5f9', // 꼭대기 (흰색)
};

export default function CombatMapEditor({ maps, onSaveMap, onDeleteMap }) {
  const [board, setBoard] = useState(createLandBoard());
  const [selectedBrush, setSelectedBrush] = useState(TILE_TYPES.NORMAL);
  const [isPainting, setIsPainting] = useState(false);
  const [mapName, setMapName] = useState('');
  const [editingMapId, setEditingMapId] = useState(null);

  const handleMouseDown = (x, y) => {
    setIsPainting(true);
    paintTile(x, y);
  };

  const handleMouseEnter = (x, y) => {
    if (isPainting) {
      paintTile(x, y);
    }
  };

  const handleMouseUp = () => {
    setIsPainting(false);
  };

  const paintTile = (x, y) => {
    setBoard(prev => {
      const newBoard = [...prev];
      newBoard[y] = [...newBoard[y]];
      newBoard[y][x] = { ...newBoard[y][x], type: selectedBrush };
      return newBoard;
    });
  };

  const handleSave = () => {
    if (!mapName) return alert('맵 이름을 입력하세요.');
    onSaveMap({
      id: editingMapId || 'map_' + Date.now(),
      name: mapName,
      board
    });
    setMapName('');
    setEditingMapId(null);
    setBoard(createLandBoard());
  };

  const loadMap = (mapData) => {
    setBoard(mapData.board);
    setMapName(mapData.name);
    setEditingMapId(mapData.id);
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <h3 style={{ marginBottom: '16px' }}>20x20 육전 맵 에디터</h3>
      
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* 브러시 및 저장 패널 */}
        <div style={{ flex: 1, minWidth: '300px' }}>
          <h4 style={{ marginBottom: '12px' }}>타일 브러시 선택</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '24px' }}>
            {Object.entries(TILE_TYPES).map(([key, label]) => (
              <button 
                key={key} 
                className={`btn btn-sm ${selectedBrush === label ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px',
                  border: selectedBrush === label ? '2px solid white' : 'none'
                }}
                onClick={() => setSelectedBrush(label)}
              >
                <div style={{ width: '16px', height: '16px', backgroundColor: TILE_COLORS[label], border: '1px solid #000' }}></div>
                {label}
              </button>
            ))}
          </div>

          <h4 style={{ marginBottom: '12px' }}>맵 저장</h4>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="맵 이름" 
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-success" onClick={handleSave}>
              {editingMapId ? '수정 저장' : '새로 저장'}
            </button>
          </div>

          <h4 style={{ marginBottom: '12px' }}>저장된 맵 목록</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {maps.map(m => (
              <div key={m.id} className="card" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{m.name}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-sm" onClick={() => loadMap(m)}>✏️</button>
                  <button className="btn btn-sm btn-danger" onClick={() => onDeleteMap(m.id)}>🗑️</button>
                </div>
              </div>
            ))}
            {maps.length === 0 && <p style={{ color: 'var(--text-muted)' }}>저장된 맵이 없습니다.</p>}
          </div>
        </div>

        {/* 20x20 캔버스 */}
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center' }}>
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(20, 24px)', 
              gridTemplateRows: 'repeat(20, 24px)',
              gap: '1px',
              backgroundColor: '#1e293b',
              padding: '1px',
              border: '2px solid var(--border-color)',
              userSelect: 'none'
            }}
            onMouseLeave={handleMouseUp}
          >
            {board.map((row, y) => (
              row.map((tile, x) => (
                <div 
                  key={`${x}-${y}`}
                  onMouseDown={() => handleMouseDown(x, y)}
                  onMouseEnter={() => handleMouseEnter(x, y)}
                  onMouseUp={handleMouseUp}
                  style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: TILE_COLORS[tile.type] || TILE_COLORS[TILE_TYPES.NORMAL],
                    cursor: 'crosshair',
                  }}
                  title={`(${x}, ${y}) - ${tile.type}`}
                />
              ))
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
