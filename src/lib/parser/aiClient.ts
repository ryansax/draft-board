import Anthropic from '@anthropic-ai/sdk'
import { BADGE_MODEL, BADGE_PROMPT, coerceBadgeRows, type AiBadgeRow } from './ai'

/**
 * Section 4.3: send rendered page images to Claude and ask for the badge glyphs.
 *
 * Kept apart from `ai.ts` on purpose — the pure helpers there are imported by the
 * import screen, and bundling the SDK alongside them would put ~50KB gzipped of
 * optional dependency on the critical path.
 *
 * Called direct from the browser with the user's own key: personal local use only.
 */
export async function extractBadgesWithAi(
  pageImages: string[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<AiBadgeRow[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const content: Anthropic.ContentBlockParam[] = pageImages.map((dataUrl) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: dataUrl.replace(/^data:image\/png;base64,/, ''),
    },
  }))
  content.push({ type: 'text', text: BADGE_PROMPT })

  const response = await client.messages.create(
    { model: BADGE_MODEL, max_tokens: 16000, messages: [{ role: 'user', content }] },
    { signal },
  )

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  return coerceBadgeRows(text)
}
