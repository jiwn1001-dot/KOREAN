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
  const rows = Math.max(3, Math.ceil(Math.sqrt(totalSeats) / 2.5)); 
  const width = 400;
  const height = 220;
  const cx = width / 2;
  const cy = height - 20;
  const maxRadius = 180;
  const minRadius = 60;
  const dotSize = Math.max(2.5, Math.min(7, 120 / rows * 0.4));

  const positions = [];
  const dotsPerRow = [];
  let remainingDots = totalSeats;
  
  for (let r = 0; r < rows; r++) {
    const fraction = (r + 1) / ((rows * (rows + 1)) / 2);
    let count = Math.round(totalSeats * fraction);
    if (r === rows - 1) count = remainingDots;
    remainingDots -= count;
    dotsPerRow.push(count);
  }

  for (let r = 0; r < rows; r++) {
    const rowRadius = minRadius + ((maxRadius - minRadius) * (r / Math.max(1, rows - 1)));
    const count = dotsPerRow[r];
    
    for (let i = 0; i < count; i++) {
      const angle = Math.PI - (Math.PI * (i / Math.max(1, count - 1)));
      const x = cx + rowRadius * Math.cos(angle);
      const y = cy - rowRadius * Math.sin(angle);
      
      positions.push({ x, y, angle, r });
    }
  }

  // Sort positions by angle (left to right) and then by row to cluster them as slices
  positions.sort((a, b) => {
    if (Math.abs(b.angle - a.angle) > 0.001) {
      return b.angle - a.angle;
    }
    return a.r - b.r;
  });

  const dotPositions = positions.map((pos, idx) => ({
    ...pos,
    ...dots[idx]
  }));

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '500px' }}>
        {dotPositions.map((dot, idx) => (
          dot.partyName && (
            <circle
              key={idx}
              cx={dot.x}
              cy={dot.y}
              r={dotSize}
              fill={dot.color}
              opacity={0.9}
            >
              <title>{dot.partyName}</title>
            </circle>
          )
        ))}
        <text x={cx} y={cy - 10} textAnchor="middle" fill="var(--text-primary)" fontSize="24" fontWeight="bold">
          {totalSeats}
        </text>
        <text x={cx} y={cy + 15} textAnchor="middle" fill="var(--text-muted)" fontSize="13">
          총 의석
        </text>
      </svg>
    </div>
  );
}
