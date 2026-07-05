import { useState, useCallback } from 'react'
import ProblemInput from './components/ProblemInput'
import SolutionDisplay from './components/SolutionDisplay'
import { useTransformer } from './hooks/useTransformer'
import { usePyodide } from './hooks/usePyodide'
import './App.css'

export default function App() {
  const transformer = useTransformer()
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

      const pyodidePromise = pyodide.init()

      await transformer.init()
      transformer.setStatus('generating')

      const generatedCode = await transformer.generateCode({
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
  }, [transformer, pyodide])

  const handleRetry = useCallback(() => {
    setPhase('input')
    setCode('')
    setResult(null)
    setError(null)
    transformer.reset()
  }, [transformer])

  const isLoading = phase === 'loading'

  return (
    <div className="app">
      <header className="app-header">
        <h1>🤖 AI Math Solver</h1>
        <p className="subtitle">
          Gemma 4 + Pyodide 기반 브라우저 내장 AI 계산기
        </p>
      </header>

      <main className="app-main">
        <ProblemInput onSubmit={handleSolve} disabled={isLoading} />

        {(phase === 'loading' || phase === 'result') && code && (
          <div className="code-stream">
            <div className="code-stream-header">
              <span>🐍 생성된 코드</span>
              {phase === 'loading' && <span className="streaming-dot" />}
            </div>
            <pre className="code-stream-content"><code>{code}</code></pre>
          </div>
        )}

        {isLoading && !code && (
          <div className="loading-bar">
            <div className="loading-indeterminate" />
            <p className="loading-text">{transformer.progress || pyodide.progress || '처리 중...'}</p>
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
          Gemma 4 E2B (ONNX) + Pyodide + React
        </p>
      </footer>
    </div>
  )
}
