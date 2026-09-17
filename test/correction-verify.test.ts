import { describe, expect, it } from "vite-plus/test";
import {
  verifySceneContent,
  type GeneratedInteractiveContent,
  type GeneratedQuizContent,
  type GeneratedSlideContent,
} from "@openmaic/generation";
import { quizOutline, slideOutline, widgetOutline } from "./scene-fixtures.js";

function textElement(id: string, content: string) {
  return {
    id,
    type: "text" as const,
    left: 0,
    top: 0,
    width: 100,
    height: 50,
    rotate: 0,
    content,
    defaultFontName: "",
    defaultColor: "#333333",
  };
}

function imageElement(id: string, src: string) {
  return {
    id,
    type: "image" as const,
    left: 0,
    top: 0,
    width: 100,
    height: 50,
    rotate: 0,
    fixedRatio: true,
    src,
  };
}

function singleQuestion(id: string, answer?: string[]) {
  return {
    id,
    type: "single" as const,
    question: "Who owns model routing?",
    options: [{ label: "A", value: "The caller" }],
    ...(answer ? { answer } : {}),
  };
}

describe("correction verify (rule layer, no model calls)", () => {
  it("passes_slide_covering_all_key_points", () => {
    const content: GeneratedSlideContent = {
      elements: [
        textElement("t1", "Caller owns dependencies"),
        textElement("t2", "Pure generation seam"),
      ],
    };
    const report = verifySceneContent(slideOutline(), content);
    expect(report.pass).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("flags_slide_missing_a_key_point", () => {
    const content: GeneratedSlideContent = {
      elements: [textElement("t1", "Caller owns dependencies")],
    };
    const report = verifySceneContent(slideOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ kind: "missing-keypoint", detail: expect.stringContaining("Pure generation seam") }),
    );
  });

  it("flags_slide_dangling_image_reference", () => {
    const content: GeneratedSlideContent = {
      elements: [
        textElement("t1", "Caller owns dependencies. Pure generation seam."),
        imageElement("img1", "img_9"),
      ],
    };
    const report = verifySceneContent(slideOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "dangling-image-ref" }));

    const resolved = verifySceneContent(slideOutline(), content, {
      imageMapping: { img_9: "https://example.com/img9.png" },
    });
    expect(resolved.pass).toBe(true);
  });

  it("flags_slide_empty_elements", () => {
    const report = verifySceneContent(slideOutline(), { elements: [] });
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "empty-content" }));
  });

  it("passes_matching_quiz", () => {
    const content: GeneratedQuizContent = { questions: [singleQuestion("q1", ["a"])] };
    const report = verifySceneContent(quizOutline(), content);
    expect(report.pass).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("flags_quiz_count_mismatch", () => {
    const content: GeneratedQuizContent = {
      questions: [singleQuestion("q1", ["a"]), singleQuestion("q2", ["a"])],
    };
    const report = verifySceneContent(quizOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "quiz-count-mismatch" }));
  });

  it("flags_quiz_type_mismatch", () => {
    const content: GeneratedQuizContent = {
      questions: [{ ...singleQuestion("q1", ["a"]), type: "multiple" as const }],
    };
    const report = verifySceneContent(quizOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "quiz-type-mismatch" }));
  });

  it("flags_quiz_missing_answer", () => {
    const content: GeneratedQuizContent = { questions: [singleQuestion("q1")] };
    const report = verifySceneContent(quizOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "quiz-missing-answer" }));
  });

  it("passes_matching_interactive", () => {
    const content: GeneratedInteractiveContent = {
      html: "<div>energy slider</div>",
      widgetType: "simulation",
    };
    const report = verifySceneContent(widgetOutline(), content);
    expect(report.pass).toBe(true);
  });

  it("flags_interactive_empty_html", () => {
    const content: GeneratedInteractiveContent = { html: "  ", widgetType: "simulation" };
    const report = verifySceneContent(widgetOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "empty-content" }));
  });

  it("flags_interactive_widget_mismatch", () => {
    const content: GeneratedInteractiveContent = { html: "<div>game</div>", widgetType: "game" };
    const report = verifySceneContent(widgetOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "widget-mismatch" }));
  });
});
