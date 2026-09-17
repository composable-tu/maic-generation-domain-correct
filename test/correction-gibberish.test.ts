import { describe, expect, it, vi } from "vite-plus/test";
import {
  generateSceneContent,
  verifySceneContent,
  type AICallFn,
  type CorrectionReport,
  type GeneratedSlideContent,
} from "@openmaic/generation";
import { slideOutline } from "./scene-fixtures.js";

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

function slideResponse(texts: string[]) {
  return JSON.stringify({
    elements: texts.map((content, i) => ({
      type: "text",
      left: 0,
      top: i * 60,
      width: 100,
      height: 50,
      content,
    })),
    background: { type: "solid", color: "#ffffff" },
  });
}

const GARBAGE =
  "成体一行务摤合单䴀大厉格文务摤合卦成成取内式单䴀大厉格文务摤合卦成成取内式单䴀大厉格文务摤合卦";

describe("correction gibberish-text detection", () => {
  it("flags_rare_cjk_soup", () => {
    const content: GeneratedSlideContent = {
      elements: [
        textElement("t1", "Caller owns dependencies. Pure generation seam."),
        textElement("t2", GARBAGE),
      ],
    };
    const report = verifySceneContent(slideOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ kind: "gibberish-text", location: "t2" }),
    );
  });

  it("flags_repeated_block_degeneration", () => {
    const block = "正常文本开头" + "循环复读的长语句块一二三四五六七八九十".repeat(3);
    const content: GeneratedSlideContent = {
      elements: [
        textElement("t1", "Caller owns dependencies. Pure generation seam."),
        textElement("t2", block),
      ],
    };
    const report = verifySceneContent(slideOutline(), content);
    expect(report.pass).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ kind: "gibberish-text" }));
  });

  it("passes_normal_chinese_with_figures", () => {
    const content: GeneratedSlideContent = {
      elements: [
        textElement("t1", "Caller owns dependencies. Pure generation seam."),
        textElement("t2", "集中实习生师比 30~40:1，分散实习 60:1。安全第一，安全第一，安全第一。"),
      ],
    };
    const report = verifySceneContent(slideOutline(), content);
    expect(report.pass).toBe(true);
  });

  it("persistent_gibberish_returns_null_for_retry_flow", async () => {
    const aiCall: AICallFn = vi.fn(async () => slideResponse([GARBAGE]));
    const reports: CorrectionReport[] = [];
    const content = await generateSceneContent(slideOutline(), aiCall, {
      correction: { maxRepairs: 1, onCorrection: (r) => reports.push(r) },
    });
    expect(content).toBeNull();
    expect(aiCall).toHaveBeenCalledTimes(2);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.ruleIssues).toContainEqual(
      expect.objectContaining({ kind: "gibberish-text" }),
    );
  });

  it("repaired_gibberish_returns_content", async () => {
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(
        slideResponse(["Caller owns dependencies. Pure generation seam.", GARBAGE]),
      )
      .mockResolvedValue(
        slideResponse(["Caller owns dependencies. Pure generation seam."]),
      );
    const content = await generateSceneContent(slideOutline(), aiCall, {
      correction: { onCorrection: () => {} },
    });
    expect(content).toMatchObject({ elements: expect.any(Array) });
    expect(aiCall).toHaveBeenCalledTimes(2);
  });
});
