import { describe, expect, it } from 'vitest'
import { extractAiText } from '../worker/index'

describe('Workers AI response parsing', () => {
  it('reads legacy response text', () => {
    expect(extractAiText({ response: 'legacy text' })).toBe('legacy text')
  })

  it('reads OpenAI-style choices', () => {
    expect(
      extractAiText({
        choices: [{ message: { content: 'choice text' } }],
      }),
    ).toBe('choice text')
  })

  it('reads REST-style nested result wrappers', () => {
    expect(
      extractAiText({
        result: {
          choices: [{ message: { content: 'nested choice text' } }],
        },
      }),
    ).toBe('nested choice text')
  })

  it('joins content-part arrays without exposing reasoning fields', () => {
    expect(
      extractAiText({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'hello ' },
                { type: 'text', text: 'world' },
              ],
              reasoning_content: 'private reasoning',
            },
          },
        ],
      }),
    ).toBe('hello world')
  })
})
