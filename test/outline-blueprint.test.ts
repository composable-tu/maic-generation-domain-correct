import { describe, expect, it, vi } from "vite-plus/test";
import {
  buildPrompt,
  generateSceneContent,
  generateSceneOutlinesFromRequirements,
  PROMPT_IDS,
  verifySceneContent,
  type AICallFn,
  type SceneOutline,
} from "@openmaic/generation";
import { quizOutline, slideOutline } from "./scene-fixtures.js";

function blueprintSlide(): SceneOutline {
  return {
    ...slideOutline(),
    teachingNarrative: "Open with the outage everyone remembers, then name the safeguard.",
    mustCover: ["Report within 1 hour of any incident."],
    misconceptions: ["Insurance replaces training — it only transfers cost."],
    exampleCase: "The 2024 lab outage.",
  };
}

describe("outline blueprint", () => {
  it("preserves_blueprint_fields_from_model_output", async () => {
    const outline = blueprintSlide();
    const aiCall: AICallFn = vi.fn(async () =>
      JSON.stringify({
        languageDirective: "Teach in English.",
        courseTitle: "Safety",
        outlines: [outline],
      }),
    );
    const result = await generateSceneOutlinesFromRequirements(
      { requirement: "Teach safety." },
      undefined,
      undefined,
      aiCall,
    );
    expect(result.success).toBe(true);
    expect(result.data?.outlines[0]).toMatchObject({
      teachingNarrative: outline.teachingNarrative,
      mustCover: outline.mustCover,
      misconceptions: outline.misconceptions,
      exampleCase: outline.exampleCase,
    });
  });

  it("slide_prompt_carries_blueprint_without_placeholders", async () => {
    const seen: string[] = [];
    const aiCall: AICallFn = async (_system, user) => {
      seen.push(user);
      return JSON.stringify({
        elements: [
          {
            type: "text",
            left: 0,
            top: 0,
            width: 100,
            height: 50,
            content: "Caller owns dependencies. Pure generation seam. Report within 1 hour.",
          },
        ],
      });
    };
    await generateSceneContent(blueprintSlide(), aiCall, {
      correction: { enabled: false },
    });
    const user = seen[0] ?? "";
    expect(user).toContain("Report within 1 hour of any incident.");
    expect(user).toContain("The 2024 lab outage.");
    expect(user).not.toContain("{{");
  });

  it("slide_prompt_has_no_blueprint_blocks_without_blueprint", () => {
    const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
      title: "T",
      description: "D",
      keyPoints: "1. P",
      teachingNarrative: "",
      mustCover: "",
      misconceptions: "",
      exampleCase: "",
      elements: "[]",
      assignedImages: "",
      canvas_width: 1000,
      canvas_height: 562,
      teacherContext: "",
      languageDirective: "",
      imageElementEnabled: false,
      generatedImageEnabled: false,
      generatedVideoEnabled: false,
      mediaElementEnabled: false,
    });
    expect(prompts?.user).not.toContain("{{");
    expect(prompts?.user).not.toContain("Must-Cover");
  });

  it("flags_missing_must_cover_proposition", () => {
    const report = verifySceneContent(blueprintSlide(), {
      elements: [
        {
          id: "t1",
          type: "text",
          left: 0,
          top: 0,
          width: 100,
          height: 50,
          rotate: 0,
          content: "Caller owns dependencies. Pure generation seam.",
          defaultFontName: "",
          defaultColor: "#333333",
        },
      ],
    });
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-keypoint",
        detail: expect.stringContaining("Report within 1 hour"),
      }),
    );
  });

  it("quiz_prompt_carries_assessment_map", async () => {
    const seen: string[] = [];
    const aiCall: AICallFn = async (_system, user) => {
      seen.push(user);
      return JSON.stringify([
        { type: "single", question: "Q?", options: ["Yes", "No"], correctAnswer: "A" },
      ]);
    };
    await generateSceneContent(
      { ...quizOutline(), mustCover: ["Safety first."], assessmentMap: ["Safety principle"] },
      aiCall,
      { correction: { enabled: false } },
    );
    expect(seen[0]).toContain("Safety first.");
    expect(seen[0]).toContain("Q1: Safety principle");
  });
});
