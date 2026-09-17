import { describe, expect, it, vi } from "vite-plus/test";
import {
  judgeSceneContent,
  type AICallFn,
  type GeneratedSlideContent,
} from "@openmaic/generation";
import { slideOutline } from "./scene-fixtures.js";

function coveringSlide(): GeneratedSlideContent {
  return {
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
  };
}

describe("correction judge (model review, one call max)", () => {
  it("skips_judge_with_zero_model_calls_without_excerpts", async () => {
    const aiCall: AICallFn = vi.fn(async () => JSON.stringify({ issues: [] }));
    const result = await judgeSceneContent(slideOutline(), coveringSlide(), aiCall, {});
    expect(result.skipped).toBe(true);
    expect(result.issues).toEqual([]);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it("maps_judge_findings_to_factual_deviations", async () => {
    const aiCall: AICallFn = vi.fn(async () =>
      JSON.stringify({
        issues: [{ claim: "The package selects the model", reason: "Excerpt says the caller owns routing" }],
      }),
    );
    const result = await judgeSceneContent(slideOutline(), coveringSlide(), aiCall, {
      grounding: { excerpts: ["The caller owns model routing."] },
    });
    expect(result.skipped).toBe(false);
    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      kind: "factual-deviation",
      detail: expect.stringContaining("The package selects the model"),
    });
  });

  it("returns_no_issues_on_clean_judge_response", async () => {
    const aiCall: AICallFn = vi.fn(async () => JSON.stringify({ issues: [] }));
    const result = await judgeSceneContent(slideOutline(), coveringSlide(), aiCall, {
      grounding: { excerpts: ["Caller owns dependencies."] },
    });
    expect(result.skipped).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it("treats_unparseable_judge_output_as_inconclusive", async () => {
    const aiCall: AICallFn = vi.fn(async () => "not json at all {{{");
    const result = await judgeSceneContent(slideOutline(), coveringSlide(), aiCall, {
      grounding: { excerpts: ["Caller owns dependencies."] },
    });
    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(result.issues).toEqual([]);
  });

  it("sends_outline_content_and_excerpts_to_the_judge", async () => {
    let user = "";
    const aiCall: AICallFn = async (_system, userPrompt) => {
      user = userPrompt;
      return JSON.stringify({ issues: [] });
    };
    await judgeSceneContent(slideOutline(), coveringSlide(), aiCall, {
      grounding: {
        excerpts: ["Caller owns dependencies."],
        glossary: { "AICallFn": "Injected model call function" },
        domainProfile: { name: "SDK design", instructions: "Use caller-owned terms." },
      },
    });
    expect(user).toContain("Dependency Injection");
    expect(user).toContain("Caller owns dependencies.");
    expect(user).toContain("AICallFn");
  });
});
