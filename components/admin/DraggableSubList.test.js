import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DraggableSubList from './DraggableSubList'
import { fmtDate } from '../../lib/utils'

const subs = [
  { id: 's1', title: 'First sub', short_title: 'F', created_at: '2026-01-15' },
  { id: 's2', title: 'Second sub', short_title: 'S', created_at: '2026-02-20' },
  { id: 's3', title: 'Third sub' },
]

describe('DraggableSubList', () => {
  it('labels rows with sequential letters', () => {
    render(<DraggableSubList subs={subs} objId="o1" reorder={vi.fn()} />)
    expect(screen.getByText(/A\. First sub/)).toBeInTheDocument()
    expect(screen.getByText(/B\. Second sub/)).toBeInTheDocument()
    expect(screen.getByText(/C\. Third sub/)).toBeInTheDocument()
  })

  it('hides short_title and created date unless showMeta is set', () => {
    render(<DraggableSubList subs={subs} objId="o1" reorder={vi.fn()} />)
    expect(screen.queryByText('(F)')).not.toBeInTheDocument()
    expect(screen.queryByText(/Created:/)).not.toBeInTheDocument()
  })

  it('shows short_title and created date when showMeta is set', () => {
    render(<DraggableSubList subs={subs} objId="o1" reorder={vi.fn()} showMeta />)
    expect(screen.getByText('(F)')).toBeInTheDocument()
    expect(screen.getByText(`Created: ${fmtDate('2026-01-15')}`)).toBeInTheDocument()
  })

  it('reorders by passing new and old indexes on drop', () => {
    const reorder = vi.fn()
    render(<DraggableSubList subs={subs} objId="o1" reorder={reorder} />)
    const rows = screen.getAllByText(/sub$/).map(el => el.closest('[draggable]'))
    fireEvent.dragStart(rows[0])
    fireEvent.dragEnter(rows[2])
    fireEvent.dragEnd(rows[0])
    expect(reorder).toHaveBeenCalledWith('o1', 's1', 2, 0)
  })

  it('does not reorder when the row is dropped onto itself', () => {
    const reorder = vi.fn()
    render(<DraggableSubList subs={subs} objId="o1" reorder={reorder} />)
    const rows = screen.getAllByText(/sub$/).map(el => el.closest('[draggable]'))
    fireEvent.dragStart(rows[1])
    fireEvent.dragEnter(rows[1])
    fireEvent.dragEnd(rows[1])
    expect(reorder).not.toHaveBeenCalled()
  })
})
