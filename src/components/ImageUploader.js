'use client';

import { useRef, useState } from 'react';

export default function ImageUploader({ onUpload, multiple = true }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    fileArray.forEach((file) => {
      if (file.type.startsWith('image/')) {
        onUpload(file);
      }
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  return (
    <div
      className={`image-uploader ${dragOver ? 'drag-over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="image-uploader-icon">📷</div>
      <div className="image-uploader-text">
        클릭하거나 이미지를 드래그하여 업로드
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
