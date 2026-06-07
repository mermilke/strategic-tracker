import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddSubInline from './AddSubInline'

describe('AddSubInline', () => {
  it('starts collapsed as a single add button', () => {
    render(<AddSubInline objId="o1" onAdd={vi.fn()} nextLetter="C" />)
    expect(screen.getByRole('button', { name: /add sub-objective/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/new sub-objective title/i)).not.toBeInTheDocument()
  })

  it('expands into an input showing the next letter', () => {
    render(<AddSubInline objId="o1" onAdd={vi.fn()} nextLetter="C" />)
    fireEvent.click(screen.getByRole('button', { name: /add sub-objective/i }))
    expect(screen.getByPlaceholderText(/new sub-objective title/i)).toBeInTheDocument()
    expect(screen.getByText('C.')).toBeInTheDocument()
  })

  it('submits a trimmed title via the Add button', () => {
    const onAdd = vi.fn()
    render(<AddSubInline objId="o1" onAdd={onAdd} nextLetter="C" />)
    fireEvent.click(screen.getByRole('button', { name: /add sub-objective/i }))
    fireEvent.change(screen.getByPlaceholderText(/new sub-objective title/i), { target: { value: '  Ship it  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('o1', 'Ship it')
  })

  it('submits on Enter', () => {
    const onAdd = vi.fn()
    render(<AddSubInline objId="o1" onAdd={onAdd} nextLetter="C" />)
    fireEvent.click(screen.getByRole('button', { name: /add sub-objective/i }))
    const input = screen.getByPlaceholderText(/new sub-objective title/i)
    fireEvent.change(input, { target: { value: 'Quick add' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('o1', 'Quick add')
  })

  it('does not submit an empty title', () => {
    const onAdd = vi.fn()
    render(<AddSubInline objId="o1" onAdd={onAdd} nextLetter="C" />)
    fireEvent.click(screen.getByRole('button', { name: /add sub-objective/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).not.toHaveBeenCalled()
  })
})
