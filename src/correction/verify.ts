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

const CN_DIGITS: Record<string, string> = {
  零: '0',
  〇: '0',
  一: '1',
  二: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
  两: '2',
  俩: '2',
};

/** Place characters carry magnitude, not digits ("三十" covers "30"). */
const CN_PLACES = new Set(['十', '百', '千', '万', '亿']);

/**
 * Map Chinese numerals to Arabic ("三十五" → "35", "三分之一" → "3分之1").
 * Place characters are dropped, so large round forms ("两千" → "2") degrade
 * to short runs that match leniently — pass direction, same as no digits.
 */
function chineseNumeralsToArabic(text: string): string {
  let out = '';
  for (const char of text) {
    if (CN_DIGITS[char] !== undefined) out += CN_DIGITS[char];
    else if (CN_PLACES.has(char)) continue;
    else out += char;
  }
  return out;
}

function digitRuns(text: string): string[] {
  return chineseNumeralsToArabic(text).match(/\d+/g) ?? [];
}

/**
 * Digit-tolerant coverage fallback: every digit run in the point must occur
 * in the corpus digit runs. Catches "30到40比1" covering "30~40:1" and
 * "1/3" covering "三分之一" without flagging valid paraphrases.
 * Errs toward pass by design — a missing-figures false alarm costs a
 * wasted repair call, so ambiguous cases stay silent.
 */
function digitsCovered(point: string, corpusDigitRuns: string[]): boolean {
  const runs = digitRuns(point);
  if (runs.length === 0) return false;
  const joined = corpusDigitRuns.join('');
  return runs.every((run) => joined.includes(run));
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

/**
 * Metadata keys whose string values are renderer addresses, not narration
 * (`defaultColor: '#333333'`, element ids). Included in the substring corpus
 * harmlessly, but they must stay out of the digit corpus or short runs like
 * "1" match hex colors and ids instead of taught figures.
 */
const METADATA_KEYS = new Set([
  'id',
  'name',
  'groupId',
  'defaultFontName',
  'defaultColor',
  'src',
  'fill',
]);

function collectNarrativeStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNarrativeStrings(item, out);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (!METADATA_KEYS.has(key)) collectNarrativeStrings(entry, out);
    }
  }
}

/** CJK Extension blocks: virtually absent from normal course text. */
const RARE_CJK_PATTERN = /[㐀-䶿𠀀-𪛟𪜀-𫯯]/u;
const RARE_CJK_THRESHOLD = 3;
const REPEAT_MIN_LENGTH = 8;
const REPEAT_MIN_COUNT = 3;

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

/**
 * Mechanical gibberish detection for model-decoding pathologies: rare-CJK
 * soup and loop-degenerated repeated blocks. Returns human-readable
 * reasons, empty when the text looks normal. Conservative by design —
 * ambiguous text stays silent.
 */
export function findGibberishReasons(text: string): string[] {
  const reasons: string[] = [];
  const plain = stripTags(text);
  const rare = plain.match(new RegExp(RARE_CJK_PATTERN.source, 'gu')) ?? [];
  if (rare.length >= RARE_CJK_THRESHOLD) {
    reasons.push(`${rare.length} rare-CJK characters`);
  }
  const compact = plain.replace(/\s+/g, '');
  const maxLen = Math.min(24, Math.floor(compact.length / REPEAT_MIN_COUNT));
  for (let len = maxLen; len >= REPEAT_MIN_LENGTH; len--) {
    const seen = new Map<string, number>();
    let hit = false;
    for (let i = 0; i + len <= compact.length; i++) {
      const block = compact.slice(i, i + len);
      const count = (seen.get(block) ?? 0) + 1;
      seen.set(block, count);
      if (count >= REPEAT_MIN_COUNT) {
        hit = true;
        break;
      }
    }
    if (hit) {
      reasons.push(`repeated ${len}-char block`);
      break;
    }
  }
  return reasons;
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

  const narrativeStrings: string[] = [];
  collectNarrativeStrings(content.elements, narrativeStrings);
  const corpusDigitRuns = digitRuns(normalizeText(narrativeStrings.join('\n')));

  const requiredPoints = [...(outline.keyPoints ?? []), ...(outline.mustCover ?? [])];
  for (const point of requiredPoints) {
    const normalized = normalizeText(point);
    if (!normalized) continue;
    if (!corpus.includes(normalized) && !digitsCovered(point, corpusDigitRuns)) {
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
    if (typeof element === 'object' && element !== null) {
      const elementId = (element as { id?: unknown }).id;
      const location = typeof elementId === 'string' ? elementId : undefined;
      const texts: string[] = [];
      collectNarrativeStrings(element, texts);
      for (const reason of findGibberishReasons(texts.join('\n'))) {
        issues.push({
          kind: 'gibberish-text',
          detail: `Slide "${outline.title}" element has unreadable text (${reason}).`,
          location,
        });
        break;
      }
    }
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
    const questionTexts: string[] = [];
    collectNarrativeStrings(
      {
        question: question.question,
        options: (question.options ?? []).map((o) => o?.label ?? o?.value),
      },
      questionTexts,
    );
    for (const reason of findGibberishReasons(questionTexts.join('\n'))) {
      issues.push({
        kind: 'gibberish-text',
        detail: `Quiz "${outline.title}" ${label} has unreadable text (${reason}).`,
        location: question.id,
      });
      break;
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
