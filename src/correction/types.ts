import type { GenerationLogger } from '../logger.js';

/** Machine-readable kinds of correction findings. */
export type CorrectionIssueKind =
  | 'missing-keypoint'
  | 'dangling-image-ref'
  | 'empty-content'
  | 'content-type-mismatch'
  | 'quiz-count-mismatch'
  | 'quiz-type-mismatch'
  | 'quiz-missing-answer'
  | 'widget-mismatch'
  | 'pbl-not-runnable'
  | 'factual-deviation';

/** One concrete problem found by verification or the judge step. */
export interface CorrectionIssue {
  kind: CorrectionIssueKind;
  detail: string;
  location?: string;
}

/** Result of the rule-layer verification pass. Pure data, no model involved. */
export interface VerificationReport {
  pass: boolean;
  issues: CorrectionIssue[];
}

/**
 * Caller-supplied domain material the correction loop may consult.
 * All fields optional: absent grounding degrades the loop to outline-only checks.
 */
export interface SourceGrounding {
  /** Source excerpts (caller-chunked) consulted by the model judge step. */
  excerpts?: string[];
  /** Domain glossary: term -> canonical definition. */
  glossary?: Record<string, string>;
  /** Domain-level instructions for generation and judging. */
  domainProfile?: {
    name?: string;
    instructions?: string;
  };
}

/** Outcome of one correction-assisted generation. Reported, never thrown. */
export interface CorrectionReport {
  /** Whether a repair attempt produced rule-clean content. */
  repaired: boolean;
  /** Total model calls spent (generation + judge + repairs). */
  attempts: number;
  /** Rule-layer issues remaining on the returned content. */
  ruleIssues: CorrectionIssue[];
  /** Issues the judge step found (empty when skipped). */
  judgeIssues: CorrectionIssue[];
  /** True when the judge step was skipped (no excerpts or disabled). */
  judgeSkipped: boolean;
}

/** Knobs for the correction loop. The loop runs by default; this only tunes it. */
export interface CorrectionOptions {
  /** Master switch. False skips verification entirely (bare single pass). Default true. */
  enabled?: boolean;
  /**
   * Model judge step. False disables it; otherwise it runs whenever source
   * excerpts exist (explicit grounding or the requirement-text fallback).
   * Default unset = run when material is available.
   */
  judgeEnabled?: boolean;
  /** Max repair generations after the initial one. Default 1. */
  maxRepairs?: number;
  /** Receives the correction report after generation. Does not alter the return value. */
  onCorrection?: (report: CorrectionReport) => void;
  logger?: GenerationLogger;
}
