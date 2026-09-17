import { describe, expect, it, vi } from "vite-plus/test";
import {
  generateSceneContent,
  type AICallFn,
  type CorrectionReport,
  type GeneratedQuizContent,
} from "@openmaic/generation";
import { quizOutline } from "./scene-fixtures.js";

function quizResponse(count: number) {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      type: "single",
      question: `Q${i + 1}?`,
      options: ["Yes", "No"],
      correctAnswer: "A",
    })),
  );
}

describe("correction ablation", () => {
  it("rule_only_vs_full_loop_on_dirty_content", async () => {
    const mkAiCall = () =>
      vi
        .fn<AICallFn>()
        .mockResolvedValueOnce(quizResponse(2))
        .mockResolvedValue(quizResponse(1));

    // Rule-only: judge disabled, repair fixes the count.
    const ruleOnly = mkAiCall();
    const ruleReports: CorrectionReport[] = [];
    const ruleContent = (await generateSceneContent(quizOutline(), ruleOnly, {
      correction: { judgeEnabled: false, onCorrection: (r) => ruleReports.push(r) },
    })) as GeneratedQuizContent | null;
    expect(ruleContent?.questions).toHaveLength(1);
    expect(ruleOnly).toHaveBeenCalledTimes(2);
    expect(ruleReports[0]).toMatchObject({
      repaired: true,
      attempts: 2,
      judgeSkipped: true,
    });

    // Full loop without excerpts: judge skips, identical behavior and cost.
    const full = mkAiCall();
    const fullReports: CorrectionReport[] = [];
    await generateSceneContent(quizOutline(), full, {
      correction: { onCorrection: (r) => fullReports.push(r) },
    });
    expect(full).toHaveBeenCalledTimes(2);
    expect(fullReports[0]).toMatchObject({ repaired: true, attempts: 2, judgeSkipped: true });
  });

  it("repair_budgets_bound_total_calls", async () => {
    for (const [maxRepairs, expectedCalls] of [
      [0, 1],
      [1, 2],
      [2, 3],
    ] as const) {
      const aiCall: AICallFn = vi.fn(async () => quizResponse(2));
      const reports: CorrectionReport[] = [];
      const content = (await generateSceneContent(quizOutline(), aiCall, {
        correction: { maxRepairs, onCorrection: (r) => reports.push(r) },
      })) as GeneratedQuizContent | null;
      expect(content?.questions).toHaveLength(2);
      expect(aiCall).toHaveBeenCalledTimes(expectedCalls);
      expect(reports[0]).toMatchObject({
        repaired: false,
        attempts: expectedCalls,
        ruleIssues: [expect.objectContaining({ kind: "quiz-count-mismatch" })],
      });
    }
  });

  it("clean_content_is_never_repaired_or_nulled", async () => {
    const good = quizResponse(1);
    const aiCall: AICallFn = vi.fn(async () => good);
    const reports: CorrectionReport[] = [];
    const content = (await generateSceneContent(quizOutline(), aiCall, {
      grounding: { excerpts: ["Yes means yes."] },
      correction: { judgeEnabled: false, onCorrection: (r) => reports.push(r) },
    })) as GeneratedQuizContent | null;

    expect(content?.questions).toHaveLength(1);
    // Generation only: no repair, no null, one call.
    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ repaired: false, attempts: 1, ruleIssues: [] });
  });

  it("false_judge_finding_is_reported_not_hidden", async () => {
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(quizResponse(1))
      .mockResolvedValueOnce(
        JSON.stringify({ issues: [{ claim: "Q1 is wrong", reason: "Made-up reason" }] }),
      )
      .mockResolvedValueOnce(quizResponse(1))
      .mockResolvedValueOnce(JSON.stringify({ issues: [] }));
    const reports: CorrectionReport[] = [];
    const content = (await generateSceneContent(quizOutline(), aiCall, {
      grounding: { excerpts: ["Yes means yes."] },
      correction: { judgeEnabled: true, onCorrection: (r) => reports.push(r) },
    })) as GeneratedQuizContent | null;

    // Content survives (never nulled); the false finding stays visible.
    expect(content?.questions).toHaveLength(1);
    expect(aiCall).toHaveBeenCalledTimes(4);
    expect(reports[0]).toMatchObject({ repaired: true, attempts: 4 });
    expect(reports[0]?.judgeIssues).toHaveLength(1);
    expect(reports[0]?.judgeIssues[0]).toMatchObject({
      detail: expect.stringContaining("Q1 is wrong"),
    });
  });
});
