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

    const onProgress = (info) => {
      if (info.status === 'progress_total') {
        setProgress(`다운로드 중... ${Math.round(info.progress)}%`)
      } else if (info.status === 'progress' && info.file) {
        const file = info.file.split('/').pop() || info.file
        setProgress(`${file} (${Math.round(info.progress)}%)`)
      } else if (info.text && info.text.includes('https://')) {
        return
      } else if (info.text) {
        setProgress(info.text)
      }
    }

    const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: onProgress,
    })
    const model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: onProgress,
    })

    processorRef.current = processor
    modelRef.current = model
    setStatus('ready')
    setProgress(null)
  }, [])

  const generateCode = useCallback(async ({ text, imageData, onToken }) => {
    const model = modelRef.current
    const processor = processorRef.current
    if (!model || !processor) throw new Error('Model not initialized')

    setStatus('generating')
    setProgress(null)

    const messages = [
      {
        role: 'system',
        content: `You are a math expert. Solve the given math problem and output ONLY valid Python code.
The code must:
1. Store the final answer in a variable called "answer"
2. Store the step-by-step solution (in Korean) in a variable called "solution"
3. Use print() to output both: print(solution); print("ANSWER:", answer)
4. Use only standard Python libraries
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

    const { RawImage, TextStreamer } = await import('@huggingface/transformers')
    const image = imageData ? await RawImage.fromURL(imageData) : null

    const inputs = await processor(prompt, image, null, {
      add_special_tokens: false,
    })

    let fullText = ''
    const streamer = new TextStreamer(processor.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text) => {
        fullText += text
        onToken?.(fullText)
      },
    })

    await model.generate({
      ...inputs,
      max_new_tokens: 1024,
      do_sample: false,
      temperature: 0.1,
      streamer,
    })

    let code = fullText.trim()
    const codeMatch = code.match(/```(?:python)?\s*\n([\s\S]*?)```/)
    if (codeMatch) code = codeMatch[1].trim()

    setStatus('ready')
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
