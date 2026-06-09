import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { InlineText } from './InlineText'

describe('InlineText', () => {
  it('passes plain text through unchanged', () => {
    const { container } = render(<InlineText>{'just some text'}</InlineText>)
    expect(container.textContent).toBe('just some text')
    expect(container.querySelector('strong')).toBeNull()
  })

  it('renders **bold** as <strong>', () => {
    const { container } = render(<InlineText>{'a **strong** word'}</InlineText>)
    expect(container.querySelector('strong')).toHaveTextContent('strong')
    expect(container.textContent).toBe('a strong word')
  })

  it('renders *italic* as <em>', () => {
    const { container } = render(<InlineText>{'an *emphasised* word'}</InlineText>)
    expect(container.querySelector('em')).toHaveTextContent('emphasised')
  })

  it('renders `code` as <code>', () => {
    const { container } = render(<InlineText>{'run `npm test` now'}</InlineText>)
    expect(container.querySelector('code')).toHaveTextContent('npm test')
  })

  it('handles multiple tokens in one string', () => {
    const { container } = render(<InlineText>{'**A** then *B* then `C`'}</InlineText>)
    expect(container.querySelector('strong')).toHaveTextContent('A')
    expect(container.querySelector('em')).toHaveTextContent('B')
    expect(container.querySelector('code')).toHaveTextContent('C')
    expect(container.textContent).toBe('A then B then C')
  })

  it('renders HTML in the input as literal text, never as markup', () => {
    const { container } = render(
      <InlineText>{'<img src=x onerror=alert(1)> and <b>not bold</b>'}</InlineText>
    )
    // the dangerous tags must NOT become real elements
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    // they survive as plain text instead
    expect(container.textContent).toBe('<img src=x onerror=alert(1)> and <b>not bold</b>')
  })

  it('returns nothing for non-string input', () => {
    const { container } = render(<InlineText>{null as unknown as string}</InlineText>)
    expect(container.textContent).toBe('')
  })
})
