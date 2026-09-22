import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ImageUp, LockKeyhole, ScanText, ShieldCheck } from 'lucide-react'
import { Modal } from './Modal'
import PrivacyPromise from './PrivacyPromise'
import { recognizeImageLocally, type OcrLine } from '../ocr'
import { useI18n } from '../i18n'

const MAX_OCR_IMAGE_BYTES = 20 * 1024 * 1024

function confidence(score: number) {
  return Math.max(0, Math.min(100, Math.round(score * 100)))
}

export default function OcrImport({
  onInsert,
  onClose,
}: {
  onInsert: (text: string) => void
  onClose: () => void
}) {
  const { pick } = useI18n()
  const uploadRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [lines, setLines] = useState<OcrLine[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'recognizing' | 'ready'>('idle')
  const [error, setError] = useState('')

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  async function choose(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(pick('请选择图片文件。', 'Choose an image file.'))
      return
    }
    if (file.size > MAX_OCR_IMAGE_BYTES) {
      setError(
        pick(
          '图片超过 20 MB，请压缩或裁剪后重试。',
          'The image is over 20 MB. Crop or compress it and try again.',
        ),
      )
      return
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    setFileName(file.name || pick('拍摄的照片', 'Captured photo'))
    setLines([])
    setDraft('')
    setError('')
    setStatus('recognizing')

    try {
      const recognized = await recognizeImageLocally(file)
      setLines(recognized)
      setDraft(recognized.map((line) => line.text).join('\n'))
      setStatus('ready')
      if (!recognized.length)
        setError(
          pick(
            '没有识别到文字。可以换一张更清晰、光线更均匀的照片。',
            'No text was detected. Try a clearer photo with more even lighting.',
          ),
        )
    } catch (reason) {
      setStatus('idle')
      setError(
        reason instanceof Error
          ? reason.message
          : pick(
              '本地 OCR 初始化失败，请刷新后重试。',
              'Local OCR could not start. Refresh and try again.',
            ),
      )
    }
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    void choose(file)
    event.target.value = ''
  }

  return (
    <Modal
      title={pick('拍照 / 图片 OCR 导入', 'Photo / image OCR import')}
      onClose={onClose}
      wide
    >
      <PrivacyPromise className="ocr-privacy-promise" />

      <div className="ocr-source-actions">
        <button
          type="button"
          className="button primary"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera size={17} />
          {pick('拍照识别', 'Take photo')}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => uploadRef.current?.click()}
        >
          <ImageUp size={17} />
          {pick('上传图片', 'Upload image')}
        </button>
        <input
          ref={cameraRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label={pick('拍照识别文字', 'Take a photo for OCR')}
          onChange={fileChanged}
        />
        <input
          ref={uploadRef}
          className="sr-only"
          type="file"
          accept="image/*"
          aria-label={pick('上传图片识别文字', 'Upload an image for OCR')}
          onChange={fileChanged}
        />
      </div>

      {previewUrl ? (
        <div className="ocr-workspace">
          <section className="ocr-preview-card">
            <div className="ocr-section-head">
              <span>{pick('原图（仅本机临时预览）', 'Original image (temporary local preview)')}</span>
              <small>{fileName}</small>
            </div>
            <img src={previewUrl} alt={pick('待识别图片预览', 'Image awaiting OCR')} />
          </section>

          <section className="ocr-result-card">
            <div className="ocr-section-head">
              <span>{pick('识别结果', 'Recognized text')}</span>
              {lines.length ? (
                <small>
                  {pick(
                    `${lines.length} 行 · 可修改后插入`,
                    `${lines.length} lines · edit before inserting`,
                  )}
                </small>
              ) : null}
            </div>

            {status === 'recognizing' ? (
              <div className="ocr-processing" role="status">
                <ScanText size={24} />
                <strong>{pick('正在本机识别文字…', 'Recognizing text on this device…')}</strong>
                <span>
                  {pick(
                    '首次使用会下载 OCR 模型。中文、英文和工整手写均可尝试识别。',
                    'The OCR model downloads on first use. Chinese, English, and neat handwriting are supported.',
                  )}
                </span>
              </div>
            ) : (
              <textarea
                aria-label={pick('OCR 识别文字', 'OCR recognized text')}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={pick(
                  '识别出的文字会出现在这里，可先修改再插入笔记。',
                  'Recognized text appears here. Edit it before inserting into your note.',
                )}
              />
            )}

            {lines.length ? (
              <details className="ocr-confidence">
                <summary>{pick('查看识别置信度', 'View recognition confidence')}</summary>
                <div>
                  {lines.map((line, index) => {
                    const value = confidence(line.score)
                    return (
                      <div className={value < 70 ? 'low' : ''} key={`${index}-${line.text}`}>
                        <span>{line.text}</span>
                        <strong>{value}%</strong>
                      </div>
                    )
                  })}
                </div>
              </details>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="ocr-empty-state">
          <ScanText size={34} />
          <strong>
            {pick('拍一页笔记，或选择已有照片', 'Photograph a page or choose an existing image')}
          </strong>
          <p>
            {pick(
              '建议画面平整、光线均匀、文字尽量清楚，手写越工整识别越准确。',
              'For best results, keep the page flat, evenly lit, and handwriting as clear as possible.',
            )}
          </p>
        </div>
      )}

      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : null}

      <div className="privacy-note ocr-local-note">
        <LockKeyhole size={20} />
        <p>
          {pick(
            'OCR 原图只存在于当前页面的临时内存中，关闭弹窗后预览会释放；插入笔记的只有你确认过的文字。',
            'The OCR source image exists only in temporary page memory and is released when you close this dialog. Only the text you approve is inserted into your note.',
          )}
        </p>
      </div>

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          {pick('取消', 'Cancel')}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!draft.trim() || status !== 'ready'}
          onClick={() => {
            onInsert(draft.trim())
            onClose()
          }}
        >
          {pick('插入当前笔记', 'Insert into note')}
        </button>
      </div>
    </Modal>
  )
}
