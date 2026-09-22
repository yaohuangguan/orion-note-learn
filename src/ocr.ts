export type OcrLine = {
  text: string
  score: number
  poly?: unknown
}

type OcrTestHook = (file: File) => Promise<OcrLine[]>

declare global {
  interface Window {
    __ORION_OCR_TEST__?: OcrTestHook
  }
}

let pipelinePromise: Promise<{
  predict: (input: File | Blob) => Promise<Array<{ items?: OcrLine[] }>>
}> | null = null

async function pipeline() {
  if (!pipelinePromise) {
    pipelinePromise = import('@paddleocr/paddleocr-js').then(async ({ PaddleOCR }) =>
      PaddleOCR.create({
        lang: 'ch',
        ocrVersion: 'PP-OCRv5',
        worker: true,
        ortOptions: {
          backend: 'wasm',
          wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',
          numThreads: 1,
          simd: true,
        },
      }),
    )
  }
  return pipelinePromise
}

export async function recognizeImageLocally(file: File): Promise<OcrLine[]> {
  if (window.__ORION_OCR_TEST__) return window.__ORION_OCR_TEST__(file)
  const ocr = await pipeline()
  const [result] = await ocr.predict(file)
  return (result?.items || [])
    .filter((item) => typeof item.text === 'string' && item.text.trim())
    .map((item) => ({
      text: item.text.trim(),
      score: Number.isFinite(item.score) ? item.score : 0,
      poly: item.poly,
    }))
}
