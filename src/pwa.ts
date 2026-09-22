import { useEffect, useState } from 'react'

type InstallOutcome = 'accepted' | 'dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>
}

function standalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function iosDevice() {
  const ua = navigator.userAgent
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(standalone)
  const [isIos] = useState(iosDevice)

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const appInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', appInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', appInstalled)
    }
  }, [])

  async function install() {
    if (!promptEvent) return false
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    setPromptEvent(null)
    if (choice.outcome === 'accepted') {
      setInstalled(true)
      return true
    }
    return false
  }

  const canPromptInstall = !installed && Boolean(promptEvent)
  const needsManualInstall = !installed && isIos

  return {
    canInstall: canPromptInstall || needsManualInstall,
    canPromptInstall,
    needsManualInstall,
    installed,
    install,
  }
}
