import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  coerceAnalysis,
  VERDICTS,
  type AnalysisContext,
  type PickAnalysis,
} from './analysis'

const AnalysisSchema = z.object({
  verdict: z.enum(VERDICTS),
  take: z.string(),
})

/**
 * Room for the model's reasoning plus two sentences. Thinking is on by default on
 * Opus 5 and counts against this, so it is not as generous as it looks.
 */
const MAX_TOKENS = 2048

/**
 * Ask Claude for a one-line reaction to a pick.
 *
 * Runs from the browser with the user's own key, same as the badge pass. Returns
 * null on any failure — a missing take must never hold up the board.
 */
export async function requestPickAnalysis(
  context: AnalysisContext,
  apiKey: string,
  signal?: AbortSignal,
): Promise<PickAnalysis | null> {
  if (!apiKey.trim()) return null

  try {
    const client = new Anthropic({
      apiKey: apiKey.trim(),
      dangerouslyAllowBrowser: true,
      // A take that misses its moment is worthless, so fail fast rather than
      // grinding through the SDK's default retries on a bad key.
      maxRetries: 1,
      timeout: 20_000,
    })

    const response = await client.messages.parse(
      {
        model: 'claude-opus-5',
        max_tokens: MAX_TOKENS,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildAnalysisPrompt(context) }],
        // Thinking is on by default on Opus 5; low effort keeps a one-liner quick
        // and cheap rather than disabling thinking, which has its own failure modes.
        output_config: {
          effort: 'low',
          format: zodOutputFormat(AnalysisSchema),
        },
      },
      { signal },
    )

    if (response.stop_reason === 'refusal') return null
    return coerceAnalysis(response.parsed_output)
  } catch {
    // Offline, bad key, rate limited, malformed reply — all the same to the board.
    return null
  }
}
