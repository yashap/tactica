import { describe, expect, it } from 'vitest'
import { ContextPropagator } from './ContextPropagator.js'

describe('ContextPropagator', () => {
  interface Context {
    foo: string
  }

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  it('propagates context within a sync continuation', () => {
    const propagator = new ContextPropagator<Context>()
    propagator.runWithContext({ foo: 'bar' }, () => {
      expect(propagator.getContext()).toEqual({ foo: 'bar' })
    })
  })

  it('returns undefined outside a continuation', () => {
    const propagator = new ContextPropagator<Context>()
    expect(propagator.getContext()).toBeUndefined()
  })

  it('clears context after the continuation ends', () => {
    const propagator = new ContextPropagator<Context>()
    propagator.runWithContext({ foo: 'bar' }, () => {
      expect(propagator.getContext()).toEqual({ foo: 'bar' })
    })
    expect(propagator.getContext()).toBeUndefined()
  })

  it('supports nested runWithContext shadowing', () => {
    const propagator = new ContextPropagator<Context>()
    propagator.runWithContext({ foo: 'bar' }, () => {
      expect(propagator.getContext()).toEqual({ foo: 'bar' })
      propagator.runWithContext({ foo: 'baz' }, () => {
        expect(propagator.getContext()).toEqual({ foo: 'baz' })
      })
      expect(propagator.getContext()).toEqual({ foo: 'bar' })
    })
  })

  it('propagates through async continuations', async () => {
    const propagator = new ContextPropagator<Context>()
    await propagator.runWithContext({ foo: 'bar' }, async () => {
      await sleep(5)
      expect(propagator.getContext()).toEqual({ foo: 'bar' })
    })
  })

  it('isolates context between concurrent async continuations', async () => {
    const propagator = new ContextPropagator<Context>()
    const observe = async (foo: string): Promise<Context | undefined> =>
      propagator.runWithContext({ foo }, async () => {
        await sleep(Math.floor(Math.random() * 10))
        return propagator.getContext()
      })

    const results = await Promise.all([observe('a'), observe('b'), observe('c'), observe('d')])
    expect(results).toEqual([{ foo: 'a' }, { foo: 'b' }, { foo: 'c' }, { foo: 'd' }])
  })
})
