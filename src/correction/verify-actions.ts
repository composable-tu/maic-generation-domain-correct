/**
 * Action verification (extends the correction loop to the actions stage).
 *
 * Pure function, zero model calls. Scans narration text for leaked
 * internal ids: content element/question ids quoted as if they were course
 * content (e.g. "如 text_cFfu3Hmf 所示"), and raw `img_N` tokens that only
 * ever existed as prompt plumbing. Legitimate structural references
 * (`id`, `audioId`, `elementId` fields such as spotlight targets) are
 * excluded — they address the renderer, not the learner.
 */

import type { Action } from '@openmaic/dsl';
import { noopGenerationLogger, type GenerationLogger } from '../logger.js';
import type { SceneOutline } from '../outline-types.js';
import type { CorrectionIssue, VerificationReport } from './types.js';
import type { VerifiableContent } from './verify.js';

export interface VerifySceneActionsOptions {
  logger?: GenerationLogger;
}

/** Structural id references that address the renderer, never the learner. */
const REFERENCE_KEYS = new Set(['id', 'audioId', 'elementId']);

const IMAGE_ID_PATTERN = /\bimg_\d+\b/i;

function addId(value: unknown, into: Set<string>): void {
  if (typeof value === 'string' && value.length >= 4) into.add(value);
}

function collectKnownIds(content: VerifiableContent): Set<string> {
  const ids = new Set<string>();
  if ('elements' in content) {
    for (const element of content.elements ?? []) {
      if (typeof element === 'object' && element !== null) {
        addId((element as { id?: unknown }).id, ids);
      }
    }
  }
  if ('questions' in content) {
    for (const question of content.questions ?? []) addId(question?.id, ids);
  }
  if ('projectV2' in content) {
    const project = content.projectV2 as unknown as {
      milestones?: Array<{
        id?: unknown;
        microtasks?: Array<{ id?: unknown }>;
      }>;
    };
    for (const milestone of project?.milestones ?? []) {
      addId(milestone?.id, ids);
      for (const microtask of milestone?.microtasks ?? []) addId(microtask?.id, ids);
    }
  }
  return ids;
}

function collectNarrations(value: unknown, key: string | undefined, out: string[]): void {
  if (typeof value === 'string') {
    if (key === undefined || !REFERENCE_KEYS.has(key)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNarrations(item, undefined, out);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [entryKey, entry] of Object.entries(value)) collectNarrations(entry, entryKey, out);
  }
}

/**
 * Verify generated actions against their content.
 * Synchronous, deterministic, zero model calls.
 */
export function verifySceneActions(
  outline: SceneOutline,
  content: VerifiableContent,
  actions: Action[],
  options: VerifySceneActionsOptions = {},
): VerificationReport {
  const log = options.logger ?? noopGenerationLogger;
  const issues: CorrectionIssue[] = [];
  const knownIds = collectKnownIds(content);
  const seen = new Set<string>();

  const flag = (actionId: string | undefined, token: string) => {
    const signature = `${actionId ?? '?'}::${token}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    issues.push({
      kind: 'leaked-element-id',
      detail: `Action "${actionId ?? '?'}" quotes internal id "${token}" into learner-facing narration.`,
      location: actionId,
    });
  };

  for (const action of actions) {
    const actionId = (action as { id?: unknown }).id;
    const idLabel = typeof actionId === 'string' ? actionId : undefined;
    const narrations: string[] = [];
    collectNarrations(action, undefined, narrations);
    for (const text of narrations) {
      for (const known of knownIds) {
        if (text.includes(known)) flag(idLabel, known);
      }
      const imageRef = text.match(IMAGE_ID_PATTERN);
      if (imageRef) flag(idLabel, imageRef[0]);
    }
  }

  if (issues.length > 0) {
    log.debug(
      `verifySceneActions "${outline.title}": ${issues.length} issue(s): ${issues.map((i) => i.kind).join(', ')}`,
    );
  }
  return { pass: issues.length === 0, issues };
}
