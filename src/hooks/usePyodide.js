import { useState, useCallback, useRef } from 'react'

export function usePyodide() {
  const pyodideRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(null)

  const init = useCallback(async () => {
    if (pyodideRef.current) {
      setStatus('ready')
      return pyodideRef.current
    }

    setStatus('loading')
    setProgress('Pyodide (Python 인터프리터) 로딩 중...')

    const { loadPyodide } = await import('pyodide')
    const pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
    })

    pyodideRef.current = pyodide
    setStatus('ready')
    setProgress(null)
    return pyodide
  }, [])

  const runCode = useCallback(async (code) => {
    const pyodide = pyodideRef.current
    if (!pyodide) throw new Error('Pyodide not initialized')

    setStatus('running')
    setProgress('Python 코드 실행 중...')

    try {
      pyodide.runPython(`
import sys
from io import StringIO

_old_stdout = sys.stdout
sys.stdout = StringIO()
      `)

      pyodide.runPython(code)

      const output = pyodide.runPython(`
_output = sys.stdout.getvalue()
sys.stdout = _old_stdout
_output
      `)

      setStatus('ready')
      setProgress(null)

      return { output, answer: extractAnswer(output), solution: extractSolution(output) }
    } catch (err) {
      setStatus('error')
      setProgress(`Python 실행 오류: ${err.message}`)
      return { output: '', answer: `오류: ${err.message}`, solution: '' }
    }
  }, [])

  return {
    status,
    progress,
    init,
    runCode,
  }
}

function extractAnswer(output) {
  const match = output.match(/ANSWER:\s*(.+)/)
  return match ? match[1].trim() : ''
}

function extractSolution(output) {
  const lines = output.split('\n')
  const answerIdx = lines.findIndex(l => l.startsWith('ANSWER:'))
  if (answerIdx === -1) return output
  return lines.slice(0, answerIdx).join('\n').trim()
}
