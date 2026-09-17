/**
 * Model judge step (L2 of the correction loop).
 *
 * Asks the model — through the same injected AICallFn seam — to check the
 * generated content against the caller's source excerpts. Costs at most one
 * model call. Skipped entirely (zero calls) when no excerpts are supplied,
 * so callers without grounding pay nothing.
 */

import { parseJsonResponse } from '../json-repair.js';
import { noopGenerationLogger, type GenerationLogger } from '../logger.js';
import type { SceneOutline } from '../outline-types.js';
import type { AICallFn } from '../pipeline-types.js';
import { buildPrompt, PROMPT_IDS } from '../prompts/index.js';
import type { CorrectionIssue, SourceGrounding } from './types.js';
import type { VerifiableContent } from './verify.js';

export interface JudgeSceneContentOptions {
  grounding?: SourceGrounding;
  logger?: GenerationLogger;
}

export interface JudgeSceneContentResult {
  skipped: boolean;
  issues: CorrectionIssue[];
}

interface JudgeFinding {
  claim?: unknown;
  reason?: unknown;
}

function formatGlossary(glossary: Record<string, string> | undefined): string {
  if (!glossary || Object.keys(glossary).length === 0) return 'None';
  return Object.entries(glossary)
    .map(([term, definition]) => `- ${term}: ${definition}`)
    .join('\n');
}

/**
 * Review content against source excerpts. Synchronous skip when there is
 * nothing to check against; otherwise one model call.
 */
export async function judgeSceneContent(
  outline: SceneOutline,
  content: VerifiableContent,
  aiCall: AICallFn,
  options: JudgeSceneContentOptions = {},
): Promise<JudgeSceneContentResult> {
  const log = options.logger ?? noopGenerationLogger;
  const excerpts = (options.grounding?.excerpts ?? []).filter((e) => e.trim().length > 0);
  if (excerpts.length === 0) {
    return { skipped: true, issues: [] };
  }

  const domainProfile = options.grounding?.domainProfile;
  const prompts = buildPrompt(PROMPT_IDS.CORRECTION_JUDGE, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    contentJson: JSON.stringify(content, null, 2),
    excerpts: excerpts.map((e, i) => `[${i + 1}] ${e}`).join('\n\n'),
    glossary: formatGlossary(options.grounding?.glossary),
    domainInstructions:
      domainProfile?.instructions || domainProfile?.name || 'None',
  });

  if (!prompts) {
    log.warn('Correction judge prompt unavailable; treating review as inconclusive.');
    return { skipped: false, issues: [] };
  }

  const response = await aiCall(prompts.system, prompts.user);
  const parsed = parseJsonResponse<{ issues?: JudgeFinding[] }>(response, { logger: log });
  if (!parsed || !Array.isArray(parsed.issues)) {
    log.warn('Correction judge output unparseable; treating review as inconclusive.');
    return { skipped: false, issues: [] };
  }

  const issues: CorrectionIssue[] = [];
  for (const finding of parsed.issues) {
    if (typeof finding?.claim !== 'string' || !finding.claim.trim()) continue;
    const reason = typeof finding.reason === 'string' ? finding.reason : '';
    issues.push({
      kind: 'factual-deviation',
      detail: `${finding.claim}${reason ? ` — ${reason}` : ''}`,
      location: outline.id,
    });
  }
  return { skipped: false, issues };
}
