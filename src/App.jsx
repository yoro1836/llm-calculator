import { useState, useCallback } from 'react'
import ProblemInput from './components/ProblemInput'
import SolutionDisplay from './components/SolutionDisplay'
import { useWllama } from './hooks/useWllama'
import { usePyodide } from './hooks/usePyodide'
import './App.css'

const STAGE_LABELS = {
  'loading-qwen': 'Qwen3.5 번역 모델 로딩 중...',
  'translating': '한국어 → 영어 번역 중...',
  'loading-vibe': 'VibeThinker 수학 모델 로딩 중...',
  'generating': 'Python 코드 생성 중...',
}

export default function App() {
  const wllama = useWllama()
  const pyodide = usePyodide()

  const [phase, setPhase] = useState('input')
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleSolve = useCallback(async ({ text, imageData }) => {
    try {
      setPhase('loading')
      setError(null)
      setCode('')
      setResult(null)

      // Start Pyodide init in parallel (caches the worker)
      const pyodidePromise = pyodide.init()

      // Two-stage pipeline: translate (Qwen) → generate (VibeThinker)
      const generatedCode = await wllama.solve({
        text,
        imageData,
        onToken: (partial) => setCode(partial),
      })

      await pyodidePromise

      const execResult = await pyodide.runCode(generatedCode)
      setResult(execResult)
      setPhase('result')
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
      setPhase('error')
    }
  }, [wllama, pyodide])

  const handleRetry = useCallback(() => {
    setPhase('input')
    setCode('')
    setResult(null)
    setError(null)
    wllama.reset()
  }, [wllama])

  const isWorking = phase === 'loading'
  const stageLabel = STAGE_LABELS[wllama.stage]

  return (
    <div className="app">
      <header className="app-header">
        <h1>🤖 AI Math Solver</h1>
        <p className="subtitle">
          Qwen3.5 → VibeThinker-3B → Pyodide 기반 브라우저 내장 AI 계산기
        </p>
      </header>

      <main className="app-main">
        <ProblemInput onSubmit={handleSolve} disabled={isWorking} />

        {(isWorking || phase === 'result') && code && (
          <div className="code-stream">
            <div className="code-stream-header">
              <span>🐍 생성된 코드</span>
              {wllama.stage === 'generating' && <span className="streaming-dot" />}
            </div>
            <pre className="code-stream-content"><code>{code}</code></pre>
          </div>
        )}

        {isWorking && !code && (
          <div className="loading-bar">
            <div className="loading-indeterminate" />
            <p className="loading-text">{wllama.progress || stageLabel || pyodide.progress || '처리 중...'}</p>
          </div>
        )}

        {isWorking && code && pyodide.status === 'loading' && (
          <div className="loading-bar">
            <div className="loading-indeterminate" />
            <p className="loading-text">{pyodide.progress || 'Pyodide 로딩 중...'}</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={handleRetry}>다시 시도</button>
          </div>
        )}

        <SolutionDisplay
          result={result}
          code={code}
          onRetry={phase === 'result' || phase === 'error' ? handleRetry : null}
        />
      </main>

      <footer className="app-footer">
        <p>
          모든 처리는 브라우저에서 로컬로 실행됩니다.
          모델 다운로드에 시간이 소요될 수 있습니다 (최초 1회).
        </p>
        <p className="footer-tech">
          Qwen3.5-0.8B + VibeThinker-3B (GGUF / wllama) + Pyodide + React
        </p>
      </footer>
    </div>
  )
}
