import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddObjInline from './AddObjInline'

describe('AddObjInline', () => {
  it('starts collapsed as a single add button', () => {
    render(<AddObjInline userId="u1" onAdd={vi.fn()} nextNum={3} />)
    expect(screen.getByRole('button', { name: /add strategic objective/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/strategic objective title/i)).not.toBeInTheDocument()
  })

  it('expands into a form showing the next objective number', () => {
    render(<AddObjInline userId="u1" onAdd={vi.fn()} nextNum={3} />)
    fireEvent.click(screen.getByRole('button', { name: /add strategic objective/i }))
    expect(screen.getByPlaceholderText(/strategic objective title/i)).toBeInTheDocument()
    expect(screen.getByText('3.')).toBeInTheDocument()
  })

  it('grows the sub-objective list when adding a row', () => {
    render(<AddObjInline userId="u1" onAdd={vi.fn()} nextNum={3} />)
    fireEvent.click(screen.getByRole('button', { name: /add strategic objective/i }))
    expect(screen.getAllByPlaceholderText(/sub-objective title/i)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '+ Add sub-objective' }))
    expect(screen.getAllByPlaceholderText(/sub-objective title/i)).toHaveLength(2)
  })

  it('submits the title, date, and non-empty sub-objectives', () => {
    const onAdd = vi.fn()
    render(<AddObjInline userId="u1" onAdd={onAdd} nextNum={3} />)
    fireEvent.click(screen.getByRole('button', { name: /add strategic objective/i }))
    fireEvent.change(screen.getByPlaceholderText(/strategic objective title/i), { target: { value: '  Grow revenue  ' } })
    fireEvent.change(screen.getByPlaceholderText(/sub-objective title/i), { target: { value: 'Land 3 deals' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Objective' }))
    expect(onAdd).toHaveBeenCalledWith('u1', 'Grow revenue', '', ['Land 3 deals'])
  })

  it('does not submit without a title', () => {
    const onAdd = vi.fn()
    render(<AddObjInline userId="u1" onAdd={onAdd} nextNum={3} />)
    fireEvent.click(screen.getByRole('button', { name: /add strategic objective/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Objective' }))
    expect(onAdd).not.toHaveBeenCalled()
  })
})
