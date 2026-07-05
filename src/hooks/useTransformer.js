import { useRef, useState, useCallback } from 'react'

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX'

export function useTransformer() {
  const modelRef = useRef(null)
  const processorRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(null)

  const init = useCallback(async () => {
    if (modelRef.current) return

    setStatus('loading')
    setProgress('Gemma 4 모델 로딩 중...')

    const {
      AutoProcessor,
      Gemma4ForConditionalGeneration,
    } = await import('@huggingface/transformers')

    const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: (info) => {
        if (info.status === 'progress') {
          setProgress(`프로세서 로딩: ${Math.round(info.progress)}%`)
        }
      },
    })

    const model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: (info) => {
        if (info.status === 'progress') {
          setProgress(`모델 로딩: ${Math.round(info.progress)}%`)
        } else if (info.status === 'progress_total') {
          setProgress(`다운로드: ${Math.round(info.progress)}%`)
        } else if (info.text) {
          setProgress(info.text)
        }
      },
    })

    processorRef.current = processor
    modelRef.current = model
    setStatus('ready')
    setProgress(null)
  }, [])

  const generateCode = useCallback(async ({ text, imageData }) => {
    const model = modelRef.current
    const processor = processorRef.current
    if (!model || !processor) throw new Error('Model not initialized')

    setStatus('generating')
    setProgress('문제 분석 및 코드 생성 중...')

    const messages = [
      {
        role: 'system',
        content: `You are a math expert. Solve the given math problem and output ONLY valid Python code.
The code must:
1. Store the final answer in a variable called "answer"
2. Store the step-by-step solution (in Korean) in a variable called "solution"
3. Use print() to output both: print(solution); print("ANSWER:", answer)
4. Use only standard Python libraries (math, sympy not available)
5. Handle edge cases with try/except
6. Output ONLY the raw Python code, no markdown fences or explanations`,
      },
      {
        role: 'user',
        content: imageData
          ? [
              { type: 'image', image: imageData },
              { type: 'text', text },
            ]
          : text,
      },
    ]

    const prompt = processor.apply_chat_template(messages, {
      add_generation_prompt: true,
      enable_thinking: false,
    })

    const { RawImage } = await import('@huggingface/transformers')
    const image = imageData ? await RawImage.fromURL(imageData) : null

    const inputs = await processor(prompt, image, null, {
      add_special_tokens: false,
    })

    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: 2048,
      do_sample: false,
      temperature: 0.1,
    })

    const decoded = processor.batch_decode(
      outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true },
    )

    let code = decoded[0]?.trim() || ''
    const codeMatch = code.match(/```(?:python)?\s*\n([\s\S]*?)```/)
    if (codeMatch) code = codeMatch[1].trim()

    setStatus('ready')
    setProgress(null)
    return code
  }, [])

  const reset = useCallback(() => {
    modelRef.current = null
    processorRef.current = null
    setStatus('idle')
    setProgress(null)
  }, [])

  return { status, progress, init, generateCode, reset, setStatus }
}
