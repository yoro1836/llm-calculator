import { useState, useCallback } from 'react'
import ProblemInput from './components/ProblemInput'
import SolutionDisplay from './components/SolutionDisplay'
import { useWllama } from './hooks/useWllama'
import './App.css'

const STAGE_LABELS = {
  'translate': '한국어 → 영어 번역 중...',
  'solve': 'VibeThinker 문제 풀이 중...',
  'finalize': '최종 해설 작성 중...',
}

const STAGE_DISPLAY = {
  'translate': '① Qwen3.5 번역',
  'solve': '② VibeThinker 풀이',
  'finalize': '③ Qwen3.5 해설',
}

export default function App() {
  const wllama = useWllama()
  const { stage: wllamaStage, progress: wllamaProgress, errorInfo: wllamaError } = wllama

  const [phase, setPhase] = useState('input')
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState(null)

  const handleSolve = useCallback(async ({ text, imageData }) => {
    try {
      setPhase('loading')
      setError(null)
      setExplanation('')

      await wllama.solve({
        text,
        imageData,
        onToken: (partial) => setExplanation(partial),
      })

      setPhase('result')
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
      setPhase('error')
    }
  }, [wllama])

  const handleRetry = useCallback(() => {
    setPhase('input')
    setExplanation('')
    setError(null)
    wllama.reset()
  }, [wllama])

  const isWorking = phase === 'loading'
  const stageLabel = STAGE_LABELS[wllamaStage]

  return (
    <div className="app">
      <header className="app-header">
        <h1>🤖 AI Math Solver</h1>
        <p className="subtitle">
          Qwen3.5 + VibeThinker-3B 기반 브라우저 내장 AI 계산기
        </p>
      </header>

      <main className="app-main">
        <ProblemInput onSubmit={handleSolve} disabled={isWorking} />

        {isWorking && explanation && (
          <div className="explanation-stream">
            <div className="explanation-header">
              <span>📝 해설</span>
              <span className="streaming-dot" />
            </div>
            <div className="explanation-content">{explanation}</div>
          </div>
        )}

        {isWorking && !explanation && (
          <div className="loading-bar">
            <div className="loading-indeterminate" />
            <p className="loading-text">{wllamaProgress || stageLabel || '처리 중...'}</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <div className="error-header">
              <span className="error-icon">⚠️</span>
              <span className="error-stage">
                {wllamaError ? `${STAGE_DISPLAY[wllamaError.stage] || wllamaError.stage} 실패` : '오류 발생'}
              </span>
            </div>
            <pre className="error-message">{error}</pre>
            <button className="retry-btn" onClick={handleRetry}>다시 시도</button>
          </div>
        )}

        <SolutionDisplay
          explanation={explanation}
          onRetry={phase === 'result' || phase === 'error' ? handleRetry : null}
        />
      </main>

      <footer className="app-footer">
        <p>
          모든 처리는 브라우저에서 로컬로 실행됩니다.
          모델 다운로드에 시간이 소요될 수 있습니다 (최초 1회).
        </p>
        <p className="footer-tech">
          Qwen3.5-0.8B + VibeThinker-3B (GGUF / wllama) + React
        </p>
      </footer>
    </div>
  )
}
