import ReactMarkdown from 'react-markdown'

export default function SolutionDisplay({ result, code, onRetry }) {
  if (!result && !code) {
    return (
      <div className="solution-placeholder">
        <div className="placeholder-icon">🧮</div>
        <p>수학 문제를 입력하고 풀이를 시작하세요</p>
        <p className="placeholder-hint">
          AI가 문제를 분석하고 Python 코드를 작성해 실행한 후,<br />
          풀이 과정과 정답을 보여줍니다.
        </p>
      </div>
    )
  }

  return (
    <div className="solution-display">
      {result && (
        <div className="solution-section">
          <h3>📖 풀이 과정</h3>
          <div className="solution-content">
            <ReactMarkdown>{result.solution}</ReactMarkdown>
          </div>
        </div>
      )}

      {result?.answer && (
        <div className="answer-section">
          <h3>✅ 정답</h3>
          <div className="answer-content">
            <ReactMarkdown>{result.answer}</ReactMarkdown>
          </div>
        </div>
      )}

      {result?.output && !result.answer && (
        <div className="answer-section">
          <h3>✅ 실행 결과</h3>
          <pre className="output-block">{result.output}</pre>
        </div>
      )}

      {code && (
        <details className="code-section" open={false}>
          <summary>
            <h3>🔍 생성된 Python 코드</h3>
          </summary>
          <pre className="code-block">
            <code>{code}</code>
          </pre>
        </details>
      )}

      {onRetry && (
        <button className="btn btn-secondary retry-btn" onClick={onRetry}>
          🔄 다시 풀기
        </button>
      )}
    </div>
  )
}
