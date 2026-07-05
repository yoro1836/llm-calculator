import { useState, useRef, useCallback } from 'react'

export default function ProblemInput({ onSubmit, disabled }) {
  const [text, setText] = useState('')
  const [imageData, setImageData] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [inputMode, setInputMode] = useState('text')
  const fileRef = useRef(null)

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target.result
      setImageData(data)
      setImagePreview(data)
      setText(file.name.replace(/\.[^/.]+$/, ''))
    }
    reader.readAsDataURL(file)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!text.trim() && !imageData) return
    onSubmit({ text: text.trim(), imageData })
  }, [text, imageData, onSubmit])

  const handleClear = useCallback(() => {
    setText('')
    setImageData(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <div className="problem-input">
      <div className="input-tabs">
        <button
          className={`tab ${inputMode === 'text' ? 'active' : ''}`}
          onClick={() => setInputMode('text')}
        >
          📝 텍스트 입력
        </button>
        <button
          className={`tab ${inputMode === 'image' ? 'active' : ''}`}
          onClick={() => setInputMode('image')}
        >
          🖼️ 이미지 업로드
        </button>
      </div>

      {inputMode === 'text' ? (
        <textarea
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="수학 문제를 입력하세요... (예: 2x^2 + 3x - 5 = 0의 해를 구하시오)"
          rows={6}
          disabled={disabled}
        />
      ) : (
        <div className="image-upload-area">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          {imagePreview ? (
            <div className="image-preview">
              <img src={imagePreview} alt="문제 이미지" />
              <button className="clear-image-btn" onClick={() => {
                setImageData(null)
                setImagePreview(null)
                if (fileRef.current) fileRef.current.value = ''
              }}>×</button>
            </div>
          ) : (
            <button
              className="upload-btn"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
            >
              <span className="upload-icon">📤</span>
              <span>클릭하여 이미지 업로드</span>
              <span className="upload-hint">JPG, PNG, GIF</span>
            </button>
          )}
          {imagePreview && (
            <textarea
              className="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="추가 설명이나 질문을 입력하세요 (선택사항)"
              rows={2}
              disabled={disabled}
            />
          )}
        </div>
      )}

      <div className="input-actions">
        <span className="shortcut-hint">Ctrl+Enter 로 제출</span>
        <div className="action-buttons">
          <button
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={disabled || (!text && !imageData)}
          >
            초기화
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={disabled || (!text.trim() && !imageData)}
          >
            {disabled ? '처리 중...' : '풀이 시작'}
          </button>
        </div>
      </div>
    </div>
  )
}
