'use client';

import React from 'react';

/**
 * 정당별 의석수 합계에 따라 아치(반원) 모양으로 원(점)들을 배치하는 컴포넌트
 * @param {Array<{name: string, seats: number, color: string}>} parties
 */
export default function ParliamentArch({ parties = [] }) {
  const totalSeats = parties.reduce((sum, p) => sum + (Number(p.seats) || 0), 0);

  if (totalSeats === 0) {
    return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>의석 정보가 없습니다.</div>;
  }

  // Create an array of dots representing each seat, colored by party
  const dots = [];
  parties.forEach(party => {
    const seats = Number(party.seats) || 0;
    for (let i = 0; i < seats; i++) {
      dots.push({
        partyName: party.name,
        color: party.color || 'var(--accent)',
      });
    }
  });

  // Calculate positions for an arch (half-circle)
  // To make it look like a parliament, we arrange them in concentric semi-circles
  const rows = Math.max(3, Math.ceil(Math.sqrt(totalSeats) / 2)); 
  const width = 300;
  const height = 160;
  const cx = width / 2;
  const cy = height - 10;
  const maxRadius = 140;
  const minRadius = 40;
  const dotSize = Math.max(3, Math.min(8, 200 / rows));

  let currentDotIndex = 0;
  const dotPositions = [];

  // Distribute dots across rows
  const dotsPerRow = [];
  let remainingDots = totalSeats;
  
  for (let r = 0; r < rows; r++) {
    // Outer rows get more dots
    const fraction = (r + 1) / ((rows * (rows + 1)) / 2);
    let count = Math.round(totalSeats * fraction);
    if (r === rows - 1) count = remainingDots; // Last row takes the rest
    remainingDots -= count;
    dotsPerRow.push(count);
  }

  for (let r = 0; r < rows; r++) {
    const rowRadius = minRadius + ((maxRadius - minRadius) * (r / Math.max(1, rows - 1)));
    const count = dotsPerRow[r];
    
    for (let i = 0; i < count; i++) {
      if (currentDotIndex >= dots.length) break;
      
      // Angle from 180 degrees (PI) to 0 degrees
      const angle = Math.PI - (Math.PI * (i / Math.max(1, count - 1)));
      const x = cx + rowRadius * Math.cos(angle);
      const y = cy - rowRadius * Math.sin(angle);
      
      dotPositions.push({
        x, y,
        ...dots[currentDotIndex]
      });
      currentDotIndex++;
    }
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '400px' }}>
        {dotPositions.map((dot, idx) => (
          <circle
            key={idx}
            cx={dot.x}
            cy={dot.y}
            r={dotSize}
            fill={dot.color}
            opacity={0.8}
          >
            <title>{dot.partyName}</title>
          </circle>
        ))}
        <text x={cx} y={cy - 10} textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="bold">
          {totalSeats}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-muted)" fontSize="12">
          총 의석
        </text>
      </svg>
    </div>
  );
}
