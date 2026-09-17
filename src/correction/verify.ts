/**
 * Rule-layer verification (L1 of the correction loop).
 *
 * Pure function: compares generated content against its outline (and the
 * caller's image resources). Makes no model calls. Catches dropped key
 * points, dangling image references, quiz contract violations, widget
 * mismatches, and non-runnable PBL projects — the failures that are
 * mechanically checkable without domain knowledge.
 */

import { noopGenerationLogger, type GenerationLogger } from '../logger.js';
import type { ImageMapping, PdfImage, SceneOutline } from '../outline-types.js';
import { isRunnablePBLProjectV2 } from '../pbl/types.js';
import type {
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  GeneratedQuizContent,
  GeneratedSlideContent,
} from '../scene-types.js';
import type { CorrectionIssue, VerificationReport } from './types.js';

export type VerifiableContent =
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent;

export interface VerifySceneContentOptions {
  imageMapping?: ImageMapping;
  assignedImages?: PdfImage[];
  logger?: GenerationLogger;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  }
}

function verifySlide(
  outline: SceneOutline,
  content: GeneratedSlideContent,
  options: VerifySceneContentOptions,
  issues: CorrectionIssue[],
): void {
  if (content.elements.length === 0) {
    issues.push({ kind: 'empty-content', detail: `Slide "${outline.title}" has no elements.` });
    return;
  }

  const strings: string[] = [];
  collectStrings(content.elements, strings);
  const corpus = normalizeText(strings.join('\n'));

  const requiredPoints = [...(outline.keyPoints ?? []), ...(outline.mustCover ?? [])];
  for (const point of requiredPoints) {
    const normalized = normalizeText(point);
    if (!normalized) continue;
    if (!corpus.includes(normalized)) {
      issues.push({
        kind: 'missing-keypoint',
        detail: `Slide "${outline.title}" drops key point: "${point}".`,
        location: outline.id,
      });
    }
  }

  const knownImageIds = new Set([
    ...(options.assignedImages ?? []).map((img) => img.id),
    ...Object.keys(options.imageMapping ?? {}),
  ]);
  for (const element of content.elements) {
    if (
      typeof element === 'object' &&
      element !== null &&
      (element as { type?: unknown }).type === 'image'
    ) {
      const src = (element as { src?: unknown }).src;
      if (typeof src === 'string' && /^img_\d+$/i.test(src) && !knownImageIds.has(src)) {
        issues.push({
          kind: 'dangling-image-ref',
          detail: `Slide "${outline.title}" references image "${src}" with no mapping entry.`,
          location: (element as { id?: unknown }).id as string | undefined,
        });
      }
    }
  }
}

/** Outline quiz types use 'text'; the DSL question union uses 'short_answer'. */
function normalizeQuizType(value: string): string {
  return value === 'text' ? 'short_answer' : value;
}

function verifyQuiz(
  outline: SceneOutline,
  content: GeneratedQuizContent,
  issues: CorrectionIssue[],
): void {
  const questions = content.questions ?? [];
  if (questions.length === 0) {
    issues.push({ kind: 'empty-content', detail: `Quiz "${outline.title}" has no questions.` });
    return;
  }

  const config = outline.quizConfig;
  if (config && questions.length !== config.questionCount) {
    issues.push({
      kind: 'quiz-count-mismatch',
      detail: `Quiz "${outline.title}" has ${questions.length} question(s), outline requires ${config.questionCount}.`,
      location: outline.id,
    });
  }

  const allowedTypes = config ? new Set(config.questionTypes.map(normalizeQuizType)) : null;
  const seenQuestions = new Set<string>();
  questions.forEach((question, index) => {
    const label = `question ${index + 1} ("${question.id}")`;
    if (allowedTypes && !allowedTypes.has(normalizeQuizType(question.type))) {
      issues.push({
        kind: 'quiz-type-mismatch',
        detail: `Quiz "${outline.title}" ${label} is type "${question.type}", outline allows ${(config?.questionTypes ?? []).join('/')}.`,
        location: question.id,
      });
    }
    if (
      (question.type === 'single' || question.type === 'multiple') &&
      (!Array.isArray(question.answer) || question.answer.length === 0)
    ) {
      issues.push({
        kind: 'quiz-missing-answer',
        detail: `Quiz "${outline.title}" ${label} has no answer.`,
        location: question.id,
      });
    } else if (
      (question.type === 'single' || question.type === 'multiple') &&
      Array.isArray(question.options) &&
      question.options.length > 0 &&
      Array.isArray(question.answer)
    ) {
      const valid = new Set<string>();
      for (const option of question.options) {
        if (typeof option?.value === 'string') valid.add(option.value);
        if (typeof option?.label === 'string') valid.add(option.label);
      }
      const stray = question.answer.filter((entry) => typeof entry === 'string' && !valid.has(entry));
      if (stray.length > 0) {
        issues.push({
          kind: 'quiz-answer-mismatch',
          detail: `Quiz "${outline.title}" ${label} answers ${JSON.stringify(stray)} match no option.`,
          location: question.id,
        });
      }
    }
    const normalizedQuestion = normalizeText(question.question ?? '');
    if (normalizedQuestion) {
      if (seenQuestions.has(normalizedQuestion)) {
        issues.push({
          kind: 'quiz-duplicate-question',
          detail: `Quiz "${outline.title}" ${label} repeats an earlier question.`,
          location: question.id,
        });
      } else {
        seenQuestions.add(normalizedQuestion);
      }
    }
  });
}

function verifyInteractive(
  outline: SceneOutline,
  content: GeneratedInteractiveContent,
  issues: CorrectionIssue[],
): void {
  if (!content.html || !content.html.trim()) {
    issues.push({
      kind: 'empty-content',
      detail: `Interactive "${outline.title}" has empty HTML.`,
    });
    return;
  }
  if (content.widgetType && outline.widgetType && content.widgetType !== outline.widgetType) {
    issues.push({
      kind: 'widget-mismatch',
      detail: `Interactive "${outline.title}" produced widget "${content.widgetType}", outline requires "${outline.widgetType}".`,
      location: outline.id,
    });
  }
}

function verifyPBL(
  outline: SceneOutline,
  content: GeneratedPBLContent,
  issues: CorrectionIssue[],
): void {
  if (!isRunnablePBLProjectV2(content.projectV2)) {
    issues.push({
      kind: 'pbl-not-runnable',
      detail: `PBL "${outline.title}" project is missing the runnable structure (instructor role, milestones with microtasks).`,
      location: outline.id,
    });
  }
}

/**
 * Verify generated content against its outline.
 * Synchronous, deterministic, zero model calls.
 */
export function verifySceneContent(
  outline: SceneOutline,
  content: VerifiableContent,
  options: VerifySceneContentOptions = {},
): VerificationReport {
  const log = options.logger ?? noopGenerationLogger;
  const issues: CorrectionIssue[] = [];

  if (outline.type === 'slide' && 'elements' in content) {
    verifySlide(outline, content, options, issues);
  } else if (outline.type === 'quiz' && 'questions' in content) {
    verifyQuiz(outline, content, issues);
  } else if (outline.type === 'interactive' && 'html' in content) {
    verifyInteractive(outline, content, issues);
  } else if (outline.type === 'pbl' && 'projectV2' in content) {
    verifyPBL(outline, content, issues);
  } else {
    issues.push({
      kind: 'content-type-mismatch',
      detail: `Outline "${outline.title}" is type "${outline.type}" but the content shape does not match.`,
      location: outline.id,
    });
  }

  if (issues.length > 0) {
    log.debug(
      `verifySceneContent "${outline.title}": ${issues.length} issue(s): ${issues.map((i) => i.kind).join(', ')}`,
    );
  }
  return { pass: issues.length === 0, issues };
}
