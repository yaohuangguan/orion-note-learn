import { LockKeyhole, ScanText, Share2, ShieldCheck } from 'lucide-react'
import { useI18n } from '../i18n'

export default function PrivacyPromise({
  className = '',
}: {
  className?: string
}) {
  const { pick } = useI18n()
  return (
    <section className={`privacy-promise ${className}`.trim()} aria-label={pick('隐私说明', 'Privacy promise')}>
      <div className="privacy-promise-heading">
        <span className="privacy-promise-mark">
          <ShieldCheck size={19} />
        </span>
        <div>
          <strong>{pick('隐私优先，而不是事后补救', 'Private by design, not as an afterthought')}</strong>
          <span>
            {pick(
              '默认私密。只有你主动分享的内容才会公开。',
              'Private by default. Only content you explicitly share becomes public.',
            )}
          </span>
        </div>
      </div>

      <div className="privacy-promise-grid">
        <div className="privacy-promise-item">
          <ScanText size={17} />
          <div>
            <strong>{pick('OCR 留在你的设备', 'OCR stays on your device')}</strong>
            <p>
              {pick(
                '拍照和上传图片的文字识别在浏览器本地完成，OCR 原图不会上传或保存到 Orion。',
                'Photo and image OCR runs locally in your browser. OCR source images are not uploaded to or stored by Orion.',
              )}
            </p>
          </div>
        </div>

        <div className="privacy-promise-item">
          <LockKeyhole size={17} />
          <div>
            <strong>{pick('私人空间端到端加密', 'End-to-end encrypted private space')}</strong>
            <p>
              {pick(
                '私人笔记和图片附件在离开浏览器前使用 AES-256-GCM 加密。云端只保存密文，私人空间密钥不会发送给 Orion 服务端。',
                'Private notes and image attachments are encrypted with AES-256-GCM before leaving your browser. The cloud stores ciphertext, and your private vault key is never sent to Orion servers.',
              )}
            </p>
          </div>
        </div>

        <div className="privacy-promise-item">
          <Share2 size={17} />
          <div>
            <strong>{pick('主动分享才公开', 'Public only when you choose')}</strong>
            <p>
              {pick(
                '普通笔记不会被公开。只有你主动创建分享链接时，Orion 才会生成一份可阅读的公开副本。',
                'Regular notes are never published. Orion creates a readable public copy only when you explicitly create a share link.',
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
