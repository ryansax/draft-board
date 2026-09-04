import { describe, expect, it } from 'vitest'
import { estimateSpeechMs, withDeadline } from './speech'

describe('withDeadline', () => {
  it('passes through a value that arrives in time', async () => {
    expect(await withDeadline(Promise.resolve('spoken'), 500)).toBe('spoken')
  })

  it('gives up on a promise that never settles', async () => {
    // This is the real failure: Chrome accepts an utterance and never fires onend,
    // which would otherwise leave the announcement overlay covering the board.
    const never = new Promise<string>(() => {})
    const started = Date.now()
    expect(await withDeadline(never, 60)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('treats a rejection as done rather than throwing', async () => {
    await expect(withDeadline(Promise.reject(new Error('audio failed')), 500)).resolves.toBeNull()
  })

  it('ignores a late settle after the deadline has passed', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 80))
    expect(await withDeadline(slow, 20)).toBeNull()
    await new Promise((r) => setTimeout(r, 100))
  })
})

describe('estimateSpeechMs', () => {
  it('scales with the length of the line and leaves a cushion', () => {
    expect(estimateSpeechMs('')).toBeGreaterThan(0)
    const short = estimateSpeechMs('X is on the clock.')
    const long = estimateSpeechMs(
      'With the fifth pick of the second round, Leo’s Bus Drivers selects Bijan Robinson. Running back from the Atlanta Falcons.',
    )
    expect(long).toBeGreaterThan(short)
    // Long enough to cover a real reading, short enough not to stall a draft.
    expect(long).toBeLessThan(20_000)
  })
})
