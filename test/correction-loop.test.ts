import { describe, expect, it, vi } from "vite-plus/test";
import {
  generateSceneContent,
  type AICallFn,
  type CorrectionReport,
  type GeneratedQuizContent,
} from "@openmaic/generation";
import { pblOutline, quizOutline, slideOutline, validPBLResponse } from "./scene-fixtures.js";

function slideResponse(text: string) {
  return JSON.stringify({
    elements: [{ type: "text", left: 0, top: 0, width: 100, height: 50, content: text }],
    background: { type: "solid", color: "#ffffff" },
  });
}

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

const COVERING_TEXT = "Caller owns dependencies. Pure generation seam.";

describe("correction loop integration", () => {
  it("disabled_correction_keeps_single_call", async () => {
    // Opt-out: dirty content, still exactly one model call.
    const aiCall: AICallFn = vi.fn(async () => slideResponse("Only partial."));
    await generateSceneContent(slideOutline(), aiCall, { correction: { enabled: false } });
    expect(aiCall).toHaveBeenCalledTimes(1);
  });

  it("clean_content_passes_through_with_single_call", async () => {
    const aiCall: AICallFn = vi.fn(async () => slideResponse(COVERING_TEXT));
    const content = await generateSceneContent(slideOutline(), aiCall);
    expect(content).toMatchObject({ elements: expect.any(Array) });
    expect(aiCall).toHaveBeenCalledTimes(1);
  });

  it("dirty_content_triggers_repair_by_default", async () => {
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(quizResponse(2))
      .mockResolvedValue(quizResponse(1));

    const content = (await generateSceneContent(quizOutline(), aiCall)) as
      | GeneratedQuizContent
      | null;

    expect(content?.questions).toHaveLength(1);
    expect(aiCall).toHaveBeenCalledTimes(2);
    expect(aiCall.mock.calls[1][1]).toContain("had these problems");
  });

  it("repair_loop_fixes_quiz_count", async () => {
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(quizResponse(2))
      .mockResolvedValue(quizResponse(1));
    const reports: CorrectionReport[] = [];

    const content = (await generateSceneContent(quizOutline(), aiCall, {
      correction: { onCorrection: (r) => reports.push(r) },
    })) as GeneratedQuizContent | null;

    expect(content?.questions).toHaveLength(1);
    expect(aiCall).toHaveBeenCalledTimes(2);
    expect(aiCall.mock.calls[1][1]).toContain("had these problems");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      repaired: true,
      attempts: 2,
      ruleIssues: [],
      judgeIssues: [],
      judgeSkipped: true,
    });
  });

  it("judge_flags_factual_deviation_then_repair_reruns", async () => {
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(slideResponse(COVERING_TEXT))
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [{ claim: "The package selects the model", reason: "Excerpt says the caller does" }],
        }),
      )
      .mockResolvedValue(slideResponse(COVERING_TEXT));
    const reports: CorrectionReport[] = [];

    const content = await generateSceneContent(slideOutline(), aiCall, {
      grounding: { excerpts: ["The caller owns model routing."] },
      correction: { judgeEnabled: true, onCorrection: (r) => reports.push(r) },
    });

    expect(content).toMatchObject({ elements: expect.any(Array) });
    expect(aiCall).toHaveBeenCalledTimes(3);
    expect(aiCall.mock.calls[1][0]).toContain("fact-checker");
    expect(aiCall.mock.calls[2][1]).toContain("had these problems");
    expect(reports).toHaveLength(1);
    expect(reports[0]?.judgeIssues).toHaveLength(1);
    expect(reports[0]).toMatchObject({ attempts: 3, judgeSkipped: false });
  });

  it("pbl_gets_verified_and_reported_without_repair", async () => {
    const aiCall: AICallFn = vi.fn(async () => validPBLResponse());
    const reports: CorrectionReport[] = [];

    const content = await generateSceneContent(pblOutline(), aiCall, {
      languageDirective: "Reply in English.",
      correction: { onCorrection: (r) => reports.push(r) },
    });

    expect(content).toMatchObject({ projectV2: expect.any(Object) });
    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      repaired: false,
      attempts: 1,
      ruleIssues: [],
      judgeSkipped: true,
    });
  });

  it("judge_falls_back_to_requirement_text_without_grounding", async () => {
    let judgeUser = "";
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(slideResponse(COVERING_TEXT))
      .mockImplementationOnce(async (_system, user) => {
        judgeUser = user;
        return JSON.stringify({ issues: [] });
      });
    const reports: CorrectionReport[] = [];

    await generateSceneContent(slideOutline(), aiCall, {
      userRequirements: { requirement: "Teach photovoltaic inverter maintenance." },
      correction: { judgeEnabled: true, onCorrection: (r) => reports.push(r) },
    });

    expect(aiCall).toHaveBeenCalledTimes(2);
    expect(judgeUser).toContain("Teach photovoltaic inverter maintenance.");
    expect(reports[0]).toMatchObject({ judgeSkipped: false, judgeIssues: [] });
  });
});
