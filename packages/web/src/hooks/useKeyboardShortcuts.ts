import { useEffect } from 'react'

type ShortcutHandler = () => void

/**
 * useKeyboardShortcuts — listens for keyboard shortcuts on the document.
 *
 * Shortcuts are ignored when focus is in an interactive input element
 * (INPUT, TEXTAREA, SELECT, or a contenteditable element).
 */
export function useKeyboardShortcuts(shortcuts: Record<string, ShortcutHandler>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      // Ignore if modifier keys are held (Ctrl, Alt, Meta)
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const fn = shortcuts[e.key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [shortcuts])
}
