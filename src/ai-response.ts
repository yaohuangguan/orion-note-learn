export function extractAiText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const value = result as {
    result?: unknown
    response?: unknown
    text?: unknown
    output_text?: unknown
    choices?: { message?: { content?: unknown } }[]
  }

  // The REST-style Workers AI response can wrap the actual completion in { result: ... }.
  if (value.result && typeof value.result === 'object') {
    const nested = extractAiText(value.result)
    if (nested) return nested
  }

  for (const candidate of [value.response, value.text, value.output_text]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }

  const content = value.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      })
      .filter(Boolean)
      .join('')
  }
  return ''
}
