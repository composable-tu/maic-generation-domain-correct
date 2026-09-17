/**
 * Repair step (L3 of the correction loop).
 *
 * Bounded "gap refill": hands the model its concrete problems back and
 * regenerates, until the rule layer is clean or the budget is spent. The
 * regeneration itself is caller-supplied, so this loop stays decoupled from
 * any concrete content branch. Never throws, never returns null content —
 * worst case it hands back the input it was given.
 */

import { noopGenerationLogger, type GenerationLogger } from '../logger.js';
import type { CorrectionIssue } from './types.js';

export interface RepairSceneContentArgs<T> {
  initial: T;
  issues: CorrectionIssue[];
  regenerate: (issues: CorrectionIssue[]) => Promise<T | null>;
  verify: (content: T) => CorrectionIssue[];
  maxRepairs?: number;
  logger?: GenerationLogger;
}

export interface RepairSceneContentResult<T> {
  content: T;
  repairs: number;
  remainingIssues: CorrectionIssue[];
}

/** Render the repair block appended to the generation prompt on rework. */
export function buildRepairPrompt(issues: CorrectionIssue[]): string {
  const lines = issues.map((issue) => `- [${issue.kind}] ${issue.detail}`);
  return (
    `\n\nYour previous output had these problems:\n${lines.join('\n')}\n\n` +
    `Fix every one of them and output the corrected single JSON object. ` +
    `Do not mention the fixed problems anywhere in the content itself.`
  );
}

export async function repairSceneContent<T>(
  args: RepairSceneContentArgs<T>,
): Promise<RepairSceneContentResult<T>> {
  const { initial, issues, regenerate, verify } = args;
  const maxRepairs = args.maxRepairs ?? 1;
  const log = args.logger ?? noopGenerationLogger;

  let content = initial;
  let remaining = issues;
  let repairs = 0;

  while (remaining.length > 0 && repairs < maxRepairs) {
    const next = await regenerate(remaining);
    if (next === null) {
      log.warn('Correction repair regeneration failed; keeping previous content.');
      break;
    }
    content = next;
    repairs += 1;
    remaining = verify(content);
  }

  return { content, repairs, remainingIssues: remaining };
}
