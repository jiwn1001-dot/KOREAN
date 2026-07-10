'use client';

import React from 'react';

export default function AerialCardUI({ card, onClick, isSelectable = false, isSelected = false }) {
  if (!card) return null;

  const getCardColor = () => {
    if (card.isAce) return '#ef4444'; // Red for ACE
    if (card.canBlock) return '#10b981'; // Green for AA
    return '#3b82f6'; // Blue for normal
  };

  const color = getCardColor();
  const label = card.isAce ? 'ACE' : (card.canBlock ? '대공포' : '일반');

  return (
    <div 
      onClick={() => isSelectable && onClick && onClick(card)}
      style={{
        border: `2px solid ${isSelected ? '#eab308' : color}`,
        backgroundColor: isSelected ? 'rgba(234, 179, 8, 0.2)' : 'rgba(30, 41, 59, 0.6)',
        borderRadius: '8px',
        padding: '12px',
        width: '120px',
        height: '160px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: isSelectable ? 'pointer' : 'default',
        transition: 'all 0.2s',
        boxShadow: isSelected ? '0 0 15px rgba(234, 179, 8, 0.5)' : 'none',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{label}</span>
        <span style={{ fontWeight: 'bold', color }}>{card.speed === Infinity ? '∞' : card.speed}</span>
      </div>
      
      {card.unitImage && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', margin: '8px 0' }}>
           <img src={card.unitImage} alt={card.unitName || 'unit'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}

      {!card.unitImage && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: '2rem' }}>{card.canBlock ? '🎯' : '✈️'}</span>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {card.unitName || (card.canBlock ? 'Anti-Air' : 'Fighter')}
      </div>
    </div>
  );
}
