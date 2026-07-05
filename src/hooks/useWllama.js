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
  const [stage, setStage] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [errorInfo, setErrorInfo] = useState(null)
  const stageRef = useRef('idle')
  const downloadProgressRef = useRef(null)

  const setDownloadProgress = useCallback(({ loaded, total }) => {
    const pct = Math.round((loaded / total) * 100)
    downloadProgressRef.current?.(pct)
  }, [])

  const setStageSync = useCallback((s) => {
    stageRef.current = s
    setStage(s)
  }, [])

  const solve = useCallback(async ({ text, imageData, onToken }) => {
    const QWEN_CTX = 512
    const QWEN_BATCH = 64
    let active = []

    const cleanup = async () => {
      for (const m of active) {
        try { await m.exit() } catch {}
      }
      active = []
    }

    try {
      // ===== Stage 1: Qwen translate (Korean+image → English) =====
      setStageSync('translate')
      setProgress('Qwen3.5 번역 모델 로딩 중...')

      const qwen = createWllamaInstance()
      active.push(qwen)

      downloadProgressRef.current = (pct) => setProgress(`Qwen3.5 다운로드 중... ${pct}%`)
      const modelUrl = `https://huggingface.co/${QWEN_REPO}/resolve/main/${QWEN_FILE}`
      const modelBlobs = await loadAndDownload(qwen.modelManager, modelUrl, { progressCallback: setDownloadProgress })
      downloadProgressRef.current = null

      setProgress('mmproj 다운로드 중...')
      downloadProgressRef.current = (pct) => setProgress(`mmproj 다운로드 중... ${pct}%`)
      const mmprojUrl = `https://huggingface.co/${QWEN_REPO}/resolve/main/${QWEN_MMPROJ_FILE}`
      const mmprojBlobs = await loadAndDownload(qwen.modelManager, mmprojUrl, { progressCallback: setDownloadProgress })
      downloadProgressRef.current = null

      setProgress('Qwen3.5 로딩 중...')
      await qwen.loadModel(modelBlobs, { n_ctx: QWEN_CTX, n_batch: QWEN_BATCH, mmprojBlob: mmprojBlobs[0] })

      setProgress('번역 중...')
      const translatePrompt = imageData && text
        ? `Translate this Korean math problem to English. Image input unavailable—translate only the text. Return ONLY the English translation.\n\nKorean: ${text}`
        : `Translate this Korean math problem to English. Return ONLY the English translation.\n\nKorean: ${text || ''}`

      const englishPrompt = (await qwen.createChatCompletion(
        [{ role: 'user', content: translatePrompt }],
        { max_tokens: 256, temperature: 0.1 }
      )).trim()

      await cleanup() // exit Qwen

      // ===== Stage 2: VibeThinker solve (English → structured result) =====
      setStageSync('solve')
      setProgress('VibeThinker 모델 로딩 중...')

      const vibe = createWllamaInstance()
      active.push(vibe)

      downloadProgressRef.current = (pct) => setProgress(`VibeThinker 다운로드 중... ${pct}%`)
      const vibeUrl = `https://huggingface.co/${VIBE_REPO}/resolve/main/${VIBE_FILE}`
      await vibe.loadModelFromUrl(vibeUrl, { n_ctx: 2048, progressCallback: setDownloadProgress })
      downloadProgressRef.current = null

      setProgress('문제 풀이 중...')
      const vibeResult = (await vibe.createChatCompletion(
        [{ role: 'user', content: `Solve the math problem. Output ONLY:

ANSWER: <final answer>
STEPS: <brief key steps>

No code. No markdown. Be concise.

${englishPrompt}` }],
        { max_tokens: 512, temperature: 0.1 }
      )).trim()

      await cleanup() // exit VibeThinker

      // ===== Stage 3: Qwen finalize (cached reload, no mmproj, stream) =====
      setStageSync('finalize')
      setProgress('Qwen3.5 최종 해설 준비 중...')

      const qwen2 = createWllamaInstance()
      active.push(qwen2)

      // Model cached in OPFS — fast reload, no mmproj needed for text-only
      downloadProgressRef.current = (pct) => setProgress(`Qwen3.5 로딩 중... ${pct}%`)
      const modelUrl2 = `https://huggingface.co/${QWEN_REPO}/resolve/main/${QWEN_FILE}`
      const modelBlobs2 = await loadAndDownload(qwen2.modelManager, modelUrl2, { progressCallback: setDownloadProgress })
      downloadProgressRef.current = null

      await qwen2.loadModel(modelBlobs2, { n_ctx: QWEN_CTX, n_batch: QWEN_BATCH })

      setProgress('최종 해설 작성 중...')
      const finalizePrompt = `다음 수학 문제의 풀이 과정과 답을 한국어로 간결하게 설명하세요.

문제: ${text}
풀이: ${vibeResult}

형식:
[풀이 과정]
간단히 단계별 설명

[최종 답]
최종 답`

      let fullText = ''
      const stream = await qwen2.createChatCompletion(
        [{ role: 'user', content: finalizePrompt }],
        { max_tokens: 1024, temperature: 0.2, stream: true }
      )
      for await (const chunk of stream) {
        fullText = chunk.currentText || (fullText + (chunk.piece || ''))
        onToken?.(fullText)
      }

      await cleanup()

      setStageSync('ready')
      setProgress(null)
      return fullText.trim()
    } catch (err) {
      await cleanup()
      const failedAt = stageRef.current
      console.error(`Wllama error (stage: ${failedAt}):`, err)
      setErrorInfo({ stage: failedAt, message: err.message || String(err) })
      setStageSync('error')
      setProgress(null)
      throw err
    }
  }, [setStageSync])

  const reset = useCallback(() => {
    setStage('idle')
    setProgress(null)
    setErrorInfo(null)
  }, [])

  return { stage, progress, errorInfo, solve, reset }
}
