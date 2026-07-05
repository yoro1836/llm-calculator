import { useState, useCallback, useRef } from 'react'
import { Wllama, LoggerWithoutDebug } from '../vendor/wllama.js'

const QWEN_REPO = 'unsloth/Qwen3.5-0.8B-GGUF'
const QWEN_FILE = 'Qwen3.5-0.8B-UD-Q3_K_XL.gguf'
const QWEN_MMPROJ_FILE = 'mmproj-BF16.gguf'

const VIBE_REPO = 'prithivMLmods/VibeThinker-3B-GGUF'
const VIBE_FILE = 'VibeThinker-3B.Q4_K_M.gguf'

const CONFIG_PATHS = {
  'single-thread/wllama.wasm': '/wllama/single-thread.wasm',
  'multi-thread/wllama.wasm': '/wllama/multi-thread.wasm',
}

function createWllamaInstance() {
  return new Wllama(CONFIG_PATHS, {
    logger: LoggerWithoutDebug,
    parallelDownloads: 4,
  })
}

async function loadAndDownload(mm, url, config) {
  const model = await mm.getModelOrDownload(url, config)
  return model.open()
}

export function useWllama() {
  const wllamaRef = useRef(null)
  const qwenRef = useRef(null)
  const [stage, setStage] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [errorInfo, setErrorInfo] = useState(null)

  const downloadProgressRef = useRef(null)

  const setDownloadProgress = useCallback(({ loaded, total }) => {
    const pct = Math.round((loaded / total) * 100)
    downloadProgressRef.current?.(pct)
  }, [])

  const stageRef = useRef('idle')

  const setStageSync = useCallback((s) => {
    stageRef.current = s
    setStage(s)
  }, [])

  const solve = useCallback(async ({ text, imageData, onToken }) => {
    try {
      // --- Stage 1: Load Qwen, translate Korean → English ---
      setStageSync('loading-qwen')
      setProgress('Qwen3.5 번역 모델 로딩 중...')

      const qwen = createWllamaInstance()
      qwenRef.current = qwen

      downloadProgressRef.current = (pct) => setProgress(`Qwen3.5 다운로드 중... ${pct}%`)
      const modelUrl = `https://huggingface.co/${QWEN_REPO}/resolve/main/${QWEN_FILE}`
      const modelBlobs = await loadAndDownload(qwen.modelManager, modelUrl, { progressCallback: setDownloadProgress })
      downloadProgressRef.current = null

      setProgress('mmproj 시각 모듈 다운로드 중...')
      downloadProgressRef.current = (pct) => setProgress(`mmproj 다운로드 중... ${pct}%`)
      const mmprojUrl = `https://huggingface.co/${QWEN_REPO}/resolve/main/${QWEN_MMPROJ_FILE}`
      const mmprojBlobs = await loadAndDownload(qwen.modelManager, mmprojUrl, { progressCallback: setDownloadProgress })
      downloadProgressRef.current = null

      setProgress('Qwen3.5 모델 로딩 중...')
      await qwen.loadModel(modelBlobs, { n_ctx: 512, n_batch: 64, mmprojBlob: mmprojBlobs[0] })

      setStageSync('translating')
      setProgress('한국어→영어 번역 중...')

      const userMsg = imageData && text
        ? `Translate the following Korean math problem to English. The user also provided an image of the problem (image analysis not supported by WASM). Use only the Korean text. Return ONLY the English description.\n\nKorean: ${text}`
        : `Translate the following Korean math problem to English. Return ONLY the English translation, no explanations.\n\nKorean: ${text || ''}`

      const translateMessages = [{ role: 'user', content: userMsg }]
      const englishPrompt = (await qwen.createChatCompletion(
        translateMessages,
        { max_tokens: 512, temperature: 0.1 }
      )).trim()

      // Unload Qwen
      setProgress('Qwen3.5 메모리 해제 중...')
      await qwen.exit()

      // --- Stage 2: Load VibeThinker, generate Python code ---
      setStageSync('loading-vibe')
      setProgress('VibeThinker 수학 모델 로딩 중...')

      const vibe = createWllamaInstance()
      downloadProgressRef.current = (pct) => setProgress(`VibeThinker 다운로드 중... ${pct}%`)
      const vibeUrl = `https://huggingface.co/${VIBE_REPO}/resolve/main/${VIBE_FILE}`
      await vibe.loadModelFromUrl(vibeUrl, { n_ctx: 2048, progressCallback: setDownloadProgress })
      downloadProgressRef.current = null

      wllamaRef.current = vibe
      setStageSync('generating')
      setProgress(null)

      const systemPrompt = `You are a math expert. Solve the given math problem and output ONLY valid Python code.
The code must:
1. Store the final answer in a variable called "answer"
2. Store the step-by-step solution (in Korean) in a variable called "solution"
3. Use print() to output both: print(solution); print("ANSWER:", answer)
4. Use only standard Python libraries
5. Handle edge cases with try/except
6. Output ONLY the raw Python code, no markdown fences or explanations`

      let fullCode = ''
      const vibeMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: englishPrompt },
      ]
      const streamResponse = await vibe.createChatCompletion(
        vibeMessages,
        { max_tokens: 1024, temperature: 0.1, stream: true }
      )

      for await (const chunk of streamResponse) {
        fullCode = chunk.currentText || fullCode + (chunk.piece || '')
        onToken?.(fullCode)
      }

      let code = fullCode.trim()
      const codeMatch = code.match(/```(?:python)?\s*\n([\s\S]*?)```/)
      if (codeMatch) code = codeMatch[1].trim()

      await vibe.exit()
      wllamaRef.current = null

      setStageSync('ready')
      setProgress(null)
      return code
    } catch (err) {
      const failedAt = stageRef.current
      console.error(`Wllama error (stage: ${failedAt}):`, err)
      if (qwenRef.current) {
        try { qwenRef.current.exit() } catch {}
        qwenRef.current = null
      }
      if (wllamaRef.current) {
        try { wllamaRef.current.exit() } catch {}
        wllamaRef.current = null
      }
      setErrorInfo({ stage: failedAt, message: err.message || String(err) })
      setStageSync('error')
      setProgress(null)
      throw err
    }
  }, [setStageSync])

  const reset = useCallback(() => {
    if (wllamaRef.current) {
      try { wllamaRef.current.exit() } catch {}
      wllamaRef.current = null
    }
    setStage('idle')
    setProgress(null)
    setErrorInfo(null)
  }, [])

  return { stage, progress, errorInfo, solve, reset }
}
