import { describe, expect, it } from 'vitest'
import { compactDelta, requiresApproval, validateWebUrl } from '../electron/browser-harness'

describe('browser harness safety and compression', () => {
  it('accepts web URLs and rejects local or script schemes', () => {
    expect(validateWebUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(() => validateWebUrl('file:///C:/secrets.txt')).toThrow(/Only http/)
    expect(() => validateWebUrl('javascript:alert(1)')).toThrow(/Only http/)
  })

  it('sends only new page lines after the first snapshot', () => {
    const first = compactDelta('TITLE: Store\nURL: https://shop.test\n[1] Search\n[2] Cart', [])
    const second = compactDelta('TITLE: Store\nURL: https://shop.test\n[1] Search\n[2] Cart\n[3] Results', first.lines)
    expect(second.compact).toContain('[3] Results')
    expect(second.compact).not.toContain('[2] Cart')
  })

  it('requires approval for consequential clicks but not ordinary navigation', () => {
    expect(requiresApproval({ action: 'click', ref: 4, reason: 'Place order now' })).toBe(true)
    expect(requiresApproval({ action: 'click', ref: 2, reason: 'Open release notes' })).toBe(false)
    expect(requiresApproval({ action: 'navigate', url: 'https://example.com', reason: 'Open site' })).toBe(false)
  })
})
