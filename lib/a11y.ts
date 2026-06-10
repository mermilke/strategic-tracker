import type { KeyboardEvent } from 'react'

// Lets a non-button element (a styled <div>/<span> with an onClick) be operated
// by keyboard: Enter or Space runs the same handler. Pair with role="button" and
// tabIndex={0} so the element is focusable and announced as a button.
export function onActivate(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handler()
    }
  }
}
