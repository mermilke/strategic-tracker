import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DragGrip from './DragGrip'

describe('DragGrip', () => {
  it('renders three handle bars', () => {
    const { container } = render(<DragGrip />)
    const grip = container.firstChild
    expect(grip.childNodes).toHaveLength(3)
  })

  it('uses a narrower bar for the sub variant than the obj variant', () => {
    const { container: obj } = render(<DragGrip variant="obj" />)
    const { container: sub } = render(<DragGrip variant="sub" />)
    const objBar = obj.firstChild.firstChild
    const subBar = sub.firstChild.firstChild
    expect(objBar.style.width).toBe('16px')
    expect(subBar.style.width).toBe('12px')
  })

  it('falls back to the obj variant for an unknown variant', () => {
    const { container } = render(<DragGrip variant="nope" />)
    expect(container.firstChild.firstChild.style.width).toBe('16px')
  })
})
