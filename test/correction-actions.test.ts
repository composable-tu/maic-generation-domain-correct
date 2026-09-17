import { describe, expect, it, vi } from "vite-plus/test";
import type { Action } from "@openmaic/dsl";
import {
  generateSceneActions,
  verifySceneActions,
  type AICallFn,
  type CorrectionReport,
  type GeneratedQuizContent,
  type GeneratedSlideContent,
} from "@openmaic/generation";
import { quizOutline, slideOutline } from "./scene-fixtures.js";

function speech(id: string, text: string): Action {
  return { id, type: "speech", text };
}

function slideContent(): GeneratedSlideContent {
  return {
    elements: [
      {
        id: "text_cFfu3Hmf",
        type: "text",
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        rotate: 0,
        content: "Caller owns dependencies.",
        defaultFontName: "",
        defaultColor: "#333333",
      },
    ],
  };
}

describe("correction verifySceneActions (leaked internal ids)", () => {
  it("flags_speech_quoting_an_element_id", () => {
    const report = verifySceneActions(slideOutline(), slideContent(), [
      speech("act_1", "如 text_cFfu3Hmf 所示，调用方拥有依赖。"),
    ]);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        kind: "leaked-element-id",
        detail: expect.stringContaining("text_cFfu3Hmf"),
      }),
    );
  });

  it("flags_image_id_tokens_in_narration", () => {
    const report = verifySceneActions(slideOutline(), slideContent(), [
      speech("act_1", "请看 img_1 这张图。"),
    ]);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "leaked-element-id" }));
  });

  it("passes_clean_narration", () => {
    const report = verifySceneActions(slideOutline(), slideContent(), [
      speech("act_1", "调用方拥有依赖，这是纯生成接缝。"),
    ]);
    expect(report.pass).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("ignores_legitimate_id_references", () => {
    const actions: Action[] = [
      { id: "act_1", type: "spotlight", elementId: "text_cFfu3Hmf", dimOpacity: 0.5 },
      speech("act_2", "注意看高亮区域。"),
    ];
    const report = verifySceneActions(slideOutline(), slideContent(), actions);
    expect(report.pass).toBe(true);
  });

  it("flags_quiz_question_id_in_narration", () => {
    const content: GeneratedQuizContent = {
      questions: [{ id: "q_9x8y7z", type: "single", question: "Who routes?" }],
    };
    const report = verifySceneActions(quizOutline(), content, [
      speech("act_1", "q_9x8y7z 这道题选 A。"),
    ]);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "leaked-element-id" }));
  });
});

describe("correction generateSceneActions integration", () => {
  it("reports_leaked_id_without_changing_actions", async () => {
    const aiCall: AICallFn = vi.fn(async () =>
      JSON.stringify([{ type: "text", content: "如 text_cFfu3Hmf 所示，调用方拥有依赖。" }]),
    );
    const reports: CorrectionReport[] = [];

    const actions = await generateSceneActions(slideOutline(), slideContent(), aiCall, {
      correction: { onCorrection: (r) => reports.push(r) },
    });

    expect(actions.length).toBeGreaterThan(0);
    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      repaired: false,
      attempts: 0,
      judgeSkipped: true,
      ruleIssues: [expect.objectContaining({ kind: "leaked-element-id" })],
    });
  });

  it("returns_actions_unchanged_without_correction_keys", async () => {
    const aiCall: AICallFn = vi.fn(async () =>
      JSON.stringify([{ type: "text", content: "调用方拥有依赖。" }]),
    );

    const actions = await generateSceneActions(slideOutline(), slideContent(), aiCall);

    expect(actions.length).toBeGreaterThan(0);
    expect(aiCall).toHaveBeenCalledTimes(1);
  });
});
