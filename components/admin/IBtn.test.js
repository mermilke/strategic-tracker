import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IBtn from './IBtn'

describe('IBtn', () => {
  it('renders its children and exposes the title as a tooltip', () => {
    render(<IBtn title="Archive" color="#fff" bg="#000" bdr="#333">A</IBtn>)
    const btn = screen.getByTitle('Archive')
    expect(btn).toHaveTextContent('A')
  })

  it('calls onClick when pressed', () => {
    const onClick = vi.fn()
    render(<IBtn title="Delete" color="#fff" bg="#000" bdr="#333" onClick={onClick}>x</IBtn>)
    fireEvent.click(screen.getByTitle('Delete'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
