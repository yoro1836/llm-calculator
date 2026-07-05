import ReactMarkdown from 'react-markdown'

export default function SolutionDisplay({ explanation, onRetry }) {
  if (!explanation) {
    return (
      <div className="solution-placeholder">
        <div className="placeholder-icon">🧮</div>
        <p>수학 문제를 입력하고 풀이를 시작하세요</p>
        <p className="placeholder-hint">
          AI가 문제를 분석하고 풀이 과정과 정답을 보여줍니다.
        </p>
      </div>
    )
  }

  return (
    <div className="solution-display">
      <div className="solution-section">
        <h3>📖 풀이 결과</h3>
        <div className="solution-content">
          <ReactMarkdown>{explanation}</ReactMarkdown>
        </div>
      </div>

      {onRetry && (
        <button className="btn btn-secondary retry-btn" onClick={onRetry}>
          🔄 다시 풀기
        </button>
      )}
    </div>
  )
}
