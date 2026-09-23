import { useEffect, useRef } from 'react'

type GestureMode = 'open-left' | 'close-left' | 'open-right' | 'close-right'

type GestureStart = {
  pointerId: number
  x: number
  y: number
  mode: GestureMode
}

const MOBILE_MAX_WIDTH = 860
const OPEN_EDGE_PX = 30
const TRIGGER_PX = 58
const HORIZONTAL_INTENT_PX = 12
const HORIZONTAL_RATIO = 1.25

function isTouchPointer(event: PointerEvent) {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
}

export function useMobilePanelGestures({
  leftOpen,
  rightOpen,
  rightEnabled,
  disabled,
  onOpenLeft,
  onCloseLeft,
  onOpenRight,
  onCloseRight,
}: {
  leftOpen: boolean
  rightOpen: boolean
  rightEnabled: boolean
  disabled: boolean
  onOpenLeft: () => void
  onCloseLeft: () => void
  onOpenRight: () => void
  onCloseRight: () => void
}) {
  const start = useRef<GestureStart | null>(null)

  useEffect(() => {
    function pointerDown(event: PointerEvent) {
      if (
        disabled ||
        !isTouchPointer(event) ||
        window.innerWidth > MOBILE_MAX_WIDTH ||
        !event.isPrimary
      )
        return

      const width = window.innerWidth
      const target = event.target instanceof Element ? event.target : null
      let mode: GestureMode | null = null

      if (leftOpen) {
        if (target?.closest('.sidebar')) mode = 'close-left'
      } else if (rightOpen) {
        if (target?.closest('.ai-panel')) mode = 'close-right'
      } else if (
        event.clientX <= OPEN_EDGE_PX &&
        target?.closest('[data-edge-gesture="left"]')
      ) {
        mode = 'open-left'
      } else if (
        rightEnabled &&
        event.clientX >= width - OPEN_EDGE_PX &&
        target?.closest('[data-edge-gesture="right"]')
      ) {
        mode = 'open-right'
      }

      if (!mode) return
      start.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        mode,
      }
    }

    function pointerMove(event: PointerEvent) {
      const gesture = start.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      const dx = event.clientX - gesture.x
      const dy = event.clientY - gesture.y
      const horizontal = Math.abs(dx)

      if (Math.abs(dy) > horizontal * 1.1 && Math.abs(dy) > HORIZONTAL_INTENT_PX) {
        start.current = null
        return
      }

      if (horizontal > HORIZONTAL_INTENT_PX && horizontal > Math.abs(dy) * HORIZONTAL_RATIO)
        event.preventDefault()
    }

    function finish(event: PointerEvent) {
      const gesture = start.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      start.current = null

      const dx = event.clientX - gesture.x
      const dy = event.clientY - gesture.y
      if (Math.abs(dx) < TRIGGER_PX || Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_RATIO) return

      if (gesture.mode === 'open-left' && dx > 0) onOpenLeft()
      else if (gesture.mode === 'close-left' && dx < 0) onCloseLeft()
      else if (gesture.mode === 'open-right' && dx < 0) onOpenRight()
      else if (gesture.mode === 'close-right' && dx > 0) onCloseRight()
    }

    function cancel(event: PointerEvent) {
      if (start.current?.pointerId === event.pointerId) start.current = null
    }

    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointermove', pointerMove, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [
    disabled,
    leftOpen,
    onCloseLeft,
    onCloseRight,
    onOpenLeft,
    onOpenRight,
    rightEnabled,
    rightOpen,
  ])
}
