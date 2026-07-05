import { useState, useCallback, useRef } from 'react'
import { pipeline, TextStreamer } from '@huggingface/transformers'

const QWEN_MODEL = 'onnx-community/Qwen3.5-0.8B-ONNX-OPT'
const VIBE_MODEL = 'Yoro9381/VibeThinker-3B-ONNX'

export function useTransformers() {
  const [stage, setStage] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [errorInfo, setErrorInfo] = useState(null)
  const stageRef = useRef('idle')
  const qwenRef = useRef(null)
  const vibeRef = useRef(null)

  const setStageSync = useCallback((s) => {
    stageRef.current = s
    setStage(s)
  }, [])

  async function getOrCreatePipeline(ref, modelId, label) {
    if (ref.current) return ref.current
    setProgress(`${label} 모델 로딩 중...`)
    const pipe = await pipeline('text-generation', modelId, {
      dtype: 'q4',
      device: 'webgpu',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.progress > 0) {
          setProgress(`${label} 다운로드 중... ${Math.round(p.progress * 100)}%`)
        }
      },
    })
    ref.current = pipe
    return pipe
  }

  const solve = useCallback(async ({ text, imageData, onToken }) => {
    try {
      // ===== Stage 1: Qwen3.5 translate (Korean → English) =====
      setStageSync('translate')
      const qwen = await getOrCreatePipeline(qwenRef, QWEN_MODEL, 'Qwen3.5')

      setProgress('번역 중...')
      const translatePrompt = text
        ? `Translate this Korean math problem to English. Return ONLY the English translation.\n\nKorean: ${text}`
        : ''

      const tResult = await qwen(translatePrompt, {
        max_new_tokens: 256,
        temperature: 0.1,
        return_full_text: false,
      })
      const englishPrompt = tResult[0]?.generated_text?.trim() || text

      // ===== Stage 2: VibeThinker solve (English → structured result) =====
      setStageSync('solve')
      const vibe = await getOrCreatePipeline(vibeRef, VIBE_MODEL, 'VibeThinker')

      setProgress('문제 풀이 중...')
      const vibeResult = await vibe(
        `Solve the math problem. Output ONLY:\n\nANSWER: <final answer>\nSTEPS: <brief key steps>\n\nNo code. No markdown. Be concise.\n\n${englishPrompt}`,
        { max_new_tokens: 512, temperature: 0.1, return_full_text: false },
      )
      const vibeText = vibeResult[0]?.generated_text?.trim() || ''

      // ===== Stage 3: Qwen3.5 finalize (Korean explanation, streaming) =====
      setStageSync('finalize')
      setProgress('최종 해설 작성 중...')

      const finalizePrompt = [
        `다음 수학 문제의 풀이 과정과 답을 한국어로 간결하게 설명하세요.`,
        ``,
        `문제: ${text}`,
        `풀이: ${vibeText}`,
        ``,
        `형식:`,
        `[풀이 과정]`,
        `간단히 단계별 설명`,
        ``,
        `[최종 답]`,
        `최종 답`,
      ].join('\n')

      let accumulatedText = ''
      const streamer = new TextStreamer(qwen.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (incrementalText) => {
          accumulatedText += incrementalText
          onToken?.(accumulatedText)
        },
      })

      await qwen(finalizePrompt, {
        max_new_tokens: 1024,
        temperature: 0.2,
        streamer,
        return_full_text: false,
      })

      setStageSync('ready')
      setProgress(null)
      return accumulatedText.trim()
    } catch (err) {
      const failedAt = stageRef.current
      console.error(`Transformers error (stage: ${failedAt}):`, err)
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
