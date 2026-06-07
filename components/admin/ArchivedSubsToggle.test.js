import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ArchivedSubsToggle from './ArchivedSubsToggle'

const subs = [
  { id: 'a1', title: 'Old goal one' },
  { id: 'a2', title: 'Old goal two' },
]

afterEach(() => { vi.restoreAllMocks() })

describe('ArchivedSubsToggle', () => {
  it('starts collapsed with a pluralized count', () => {
    render(<ArchivedSubsToggle subs={subs} restoreSub={vi.fn()} />)
    expect(screen.getByText(/Show 2 archived sub-objectives/)).toBeInTheDocument()
    expect(screen.queryByText('📌 Old goal one')).not.toBeInTheDocument()
  })

  it('uses the singular noun for a single archived sub', () => {
    render(<ArchivedSubsToggle subs={[subs[0]]} restoreSub={vi.fn()} />)
    expect(screen.getByText(/Show 1 archived sub-objective$/)).toBeInTheDocument()
  })

  it('reveals the archived rows when expanded', () => {
    render(<ArchivedSubsToggle subs={subs} restoreSub={vi.fn()} />)
    fireEvent.click(screen.getByText(/Show 2 archived/))
    expect(screen.getByText('📌 Old goal one')).toBeInTheDocument()
    expect(screen.getByText(/Hide 2 archived/)).toBeInTheDocument()
  })

  it('restores a sub after the confirm prompt is accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const restoreSub = vi.fn()
    render(<ArchivedSubsToggle subs={subs} restoreSub={restoreSub} />)
    fireEvent.click(screen.getByText(/Show 2 archived/))
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    expect(restoreSub).toHaveBeenCalledWith('a1')
  })

  it('does not restore when the confirm prompt is dismissed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const restoreSub = vi.fn()
    render(<ArchivedSubsToggle subs={subs} restoreSub={restoreSub} />)
    fireEvent.click(screen.getByText(/Show 2 archived/))
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    expect(restoreSub).not.toHaveBeenCalled()
  })
})
