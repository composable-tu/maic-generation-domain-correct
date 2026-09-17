import { describe, expect, it } from "vite-plus/test";
import {
  buildPrompt,
  loadSnippet,
  PROMPT_IDS,
} from "@openmaic/generation";

describe("teaching voice wiring", () => {
  it("ships_a_non_empty_teaching_voice_snippet", () => {
    const snippet = loadSnippet("teaching-voice");
    expect(snippet.length).toBeGreaterThan(100);
    expect(snippet).toContain("not a reviewer");
  });

  it("teaching_scenes_carry_the_voice", () => {
    for (const promptId of [PROMPT_IDS.SLIDE_ACTIONS, PROMPT_IDS.INTERACTIVE_ACTIONS] as const) {
      const prompts = buildPrompt(promptId, {
        title: "T",
        description: "D",
        keyPoints: "1. P",
        elements: "[]",
        courseContext: "",
        agents: "",
        userProfile: "",
        languageDirective: "",
      });
      expect(prompts?.system).toContain("not a reviewer");
    }
  });

  it("quiz_and_pbl_openings_stay_untouched", () => {
    const quiz = buildPrompt(PROMPT_IDS.QUIZ_ACTIONS, {
      title: "T",
      description: "D",
      keyPoints: "1. P",
      questions: "[]",
      courseContext: "",
      agents: "",
      languageDirective: "",
    });
    const pbl = buildPrompt(PROMPT_IDS.PBL_ACTIONS, {
      title: "T",
      description: "D",
      keyPoints: "1. P",
      projectTopic: "P",
      projectDescription: "D",
      projectSummary: "S",
      courseContext: "",
      agents: "",
      languageDirective: "",
    });
    expect(quiz?.system).not.toContain("not a reviewer");
    expect(pbl?.system).not.toContain("not a reviewer");
  });
});
