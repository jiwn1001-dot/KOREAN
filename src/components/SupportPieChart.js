'use client';

import React from 'react';

/**
 * 정당별 지지율에 따라 원그래프(파이 차트)를 그리는 컴포넌트
 * @param {Array<{name: string, supportRate: number, color: string}>} parties
 */
export default function SupportPieChart({ parties = [] }) {
  // Filter out parties with no support
  const validParties = parties.filter(p => Number(p.supportRate) > 0);
  
  const total = validParties.reduce((sum, p) => sum + Number(p.supportRate), 0);
  
  if (total === 0) {
    return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>지지율 정보가 없습니다.</div>;
  }

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="100%" height="100%" viewBox="0 0 120 120" style={{ maxWidth: '200px', transform: 'rotate(-90deg)' }}>
        {validParties.map((party, idx) => {
          const value = Number(party.supportRate);
          const strokeDasharray = `${(value / total) * circumference} ${circumference}`;
          const strokeDashoffset = -currentOffset;
          currentOffset += (value / total) * circumference;

          return (
            <circle
              key={idx}
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke={party.color || 'var(--accent)'}
              strokeWidth="20"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
            >
              <title>{`${party.name} (${((value / total) * 100).toFixed(1)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
        {validParties.map((party, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: party.color || 'var(--accent)', borderRadius: '50%' }}></span>
            <span style={{ color: 'var(--text-secondary)' }}>{party.name} ({Number(party.supportRate).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
