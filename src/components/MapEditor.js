'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

export default function MapEditor({ editable = false, savedImageData = null, onSave = null, legend = [] }) {
  const canvasRef = useRef(null);
  const boundaryMaskRef = useRef(null);
  const originalImageRef = useRef(null);
  const [color, setColor] = useState('#ff6b6b');
  const [threshold, setThreshold] = useState(195);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [tool, setTool] = useState('fill'); // 'fill', 'erase', or 'eyedropper'

  // Load the base map image and create boundary mask
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      initCanvas(img);
    };
    img.onerror = () => {
      console.error('Failed to load map image');
      setLoading(false);
    };
    img.src = '/map.png';
  }, []);

  const initCanvas = useCallback((img) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    // Draw original image to get pixel data for boundary mask
    ctx.drawImage(img, 0, 0);
    const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Create boundary mask from original image
    createBoundaryMask(originalData);

    // If we have saved data, load it on top
    if (savedImageData) {
      const savedImg = new Image();
      savedImg.crossOrigin = 'anonymous';
      savedImg.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(savedImg, 0, 0);
        setLoading(false);
      };
      savedImg.onerror = () => {
        // If saved image fails, keep original
        setLoading(false);
      };
      savedImg.src = savedImageData;
    } else {
      setLoading(false);
    }
  }, [savedImageData]);

  // Watch for savedImageData changes after initial load
  useEffect(() => {
    if (originalImageRef.current && canvasRef.current) {
      initCanvas(originalImageRef.current);
    }
  }, [savedImageData, initCanvas]);

  // Recreate boundary mask when threshold changes
  useEffect(() => {
    if (!originalImageRef.current || !canvasRef.current) return;

    const tempCanvas = document.createElement('canvas');
    const img = originalImageRef.current;
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    const originalData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    createBoundaryMask(originalData);
  }, [threshold]);

  const createBoundaryMask = (imageData) => {
    const { width, height, data } = imageData;
    const mask = new Uint8Array(width * height);

    for (let i = 0; i < mask.length; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      // Luminance calculation
      const luminance = r * 0.299 + g * 0.587 + b * 0.114;
      // If pixel is dark enough or transparent, it's a boundary
      mask[i] = (luminance < threshold && a > 50) ? 1 : 0;
    }

    boundaryMaskRef.current = { mask, width, height };
  };

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 255, b: 255 };
  };

  const floodFill = (startX, startY, fillRgb) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { mask, width, height } = boundaryMaskRef.current;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Check if we're clicking on a boundary
    const startIdx = startY * width + startX;
    if (mask[startIdx] === 1) return; // Clicked on a boundary, do nothing

    // Get the color we're replacing
    const pIdx = startIdx * 4;
    const targetR = data[pIdx];
    const targetG = data[pIdx + 1];
    const targetB = data[pIdx + 2];

    // If already the fill color, skip
    if (targetR === fillRgb.r && targetG === fillRgb.g && targetB === fillRgb.b) return;

    // Save state for undo
    saveUndoState();

    // BFS flood fill
    const visited = new Uint8Array(width * height);
    const queue = [startX, startY];
    let head = 0;

    // Pre-allocate a larger queue
    const maxQueueSize = width * height * 2;

    while (head < queue.length) {
      const x = queue[head++];
      const y = queue[head++];

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const pixelIdx = y * width + x;
      if (visited[pixelIdx]) continue;
      if (mask[pixelIdx] === 1) continue;

      visited[pixelIdx] = 1;

      const i = pixelIdx * 4;
      const cr = data[i];
      const cg = data[i + 1];
      const cb = data[i + 2];

      // Check color similarity with target (tolerance for anti-aliased edges)
      const diff = Math.abs(cr - targetR) + Math.abs(cg - targetG) + Math.abs(cb - targetB);
      if (diff > 80) continue; // Too different from target color

      // Fill pixel
      data[i] = fillRgb.r;
      data[i + 1] = fillRgb.g;
      data[i + 2] = fillRgb.b;
      data[i + 3] = 255;

      // Add neighbors
      if (queue.length < maxQueueSize) {
        queue.push(x + 1, y);
        queue.push(x - 1, y);
        queue.push(x, y + 1);
        queue.push(x, y - 1);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const saveUndoState = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack((prev) => {
      const newStack = [...prev, imageData];
      if (newStack.length > 20) newStack.shift();
      return newStack;
    });
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const prev = undoStack[undoStack.length - 1];
    ctx.putImageData(prev, 0, 0);
    setUndoStack((s) => s.slice(0, -1));
  };

  const resetMap = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    saveUndoState();
    ctx.drawImage(originalImageRef.current, 0, 0);
  };

  const handleCanvasClick = (e) => {
    if (!editable || !boundaryMaskRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

    if (tool === 'eyedropper') {
      const ctx = canvas.getContext('2d');
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const hex = '#' + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1);
      setColor(hex);
      setTool('fill');
      return;
    }

    if (tool === 'erase') {
      // Erase = fill with white
      floodFill(x, y, { r: 255, g: 255, b: 255 });
    } else {
      const rgb = hexToRgb(color);
      floodFill(x, y, rgb);
    }
  };

  const handleSave = async () => {
    if (!onSave || !canvasRef.current) return;
    setSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      await onSave(dataUrl);
    } catch (err) {
      console.error('Failed to save map:', err);
    }
    setSaving(false);
  };

  const zoomIn = () => setZoom((z) => Math.min(z + 0.2, 3));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.2, 0.3));
  const zoomReset = () => setZoom(1);

  return (
    <div className="map-container">
      {editable && (
        <div className="map-toolbar">
          <div className="map-toolbar-group">
            <button
              className={`btn btn-sm ${tool === 'fill' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTool('fill')}
              title="채우기 도구"
            >
              🪣 채우기
            </button>
            <button
              className={`btn btn-sm ${tool === 'erase' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTool('erase')}
              title="지우개"
            >
              🧹 지우기
            </button>
            <button
              className={`btn btn-sm ${tool === 'eyedropper' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTool('eyedropper')}
              title="스포이드 (색 추출)"
            >
              💉 색 추출
            </button>
          </div>

          <div className="map-toolbar-divider" />

          <div className="map-toolbar-group">
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>색상:</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="map-color-preview"
              title="색상 선택"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) {
                  setColor(e.target.value);
                }
              }}
              className="form-input"
              style={{ width: '90px', padding: '6px 8px', fontSize: '0.82rem' }}
              placeholder="#ff6b6b"
            />
          </div>

          <div className="map-toolbar-divider" />

          <div className="map-toolbar-group">
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>경계 감도:</label>
            <input
              type="range"
              min="100"
              max="240"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ width: '100px' }}
              title={`경계 감도: ${threshold}`}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: '28px' }}>
              {threshold}
            </span>
          </div>

          <div className="map-toolbar-divider" />

          <div className="map-toolbar-group">
            <button className="btn btn-sm btn-ghost" onClick={zoomOut} title="축소">
              ➖
            </button>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', minWidth: '45px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="btn btn-sm btn-ghost" onClick={zoomIn} title="확대">
              ➕
            </button>
            <button className="btn btn-sm btn-ghost" onClick={zoomReset} title="원래 크기">
              ↺
            </button>
          </div>

          <div className="map-toolbar-divider" />

          <div className="map-toolbar-group">
            <button
              className="btn btn-sm btn-ghost"
              onClick={undo}
              disabled={undoStack.length === 0}
              title="실행 취소"
            >
              ↩ 되돌리기
            </button>
            <button className="btn btn-sm btn-danger" onClick={resetMap} title="초기화">
              🔄 초기화
            </button>
          </div>

          <div style={{ flex: 1 }} />

          <button
            className="btn btn-sm btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '저장 중...' : '💾 지도 저장'}
          </button>
        </div>
      )}

      <div className="map-canvas-wrapper">
        {loading && (
          <div className="loading">
            <div className="spinner" />
            <span>지도를 불러오는 중...</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            display: loading ? 'none' : 'block',
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            cursor: editable ? (tool === 'eyedropper' ? 'copy' : (tool === 'fill' ? 'crosshair' : 'cell')) : 'default',
            imageRendering: zoom > 1.5 ? 'pixelated' : 'auto',
          }}
        />
      </div>

      {legend && legend.length > 0 && (
        <div className="map-legend">
          <div className="map-legend-title">범례</div>
          <div className="map-legend-items">
            {legend.map((item, i) => (
              <div key={i} className="map-legend-item">
                <div
                  className="map-legend-color"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
