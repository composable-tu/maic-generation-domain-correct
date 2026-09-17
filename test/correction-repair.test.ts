import { describe, expect, it, vi } from "vite-plus/test";
import {
  buildRepairPrompt,
  repairSceneContent,
  type CorrectionIssue,
} from "@openmaic/generation";

function issue(detail: string): CorrectionIssue {
  return { kind: "missing-keypoint", detail };
}

describe("correction repair (bounded gap refill)", () => {
  it("buildRepairPrompt_lists_every_issue", () => {
    const block = buildRepairPrompt([
      issue('Drops key point: "Pure generation seam".'),
      issue("Has 2 questions, outline requires 1."),
    ]);
    expect(block).toContain("Pure generation seam");
    expect(block).toContain("2 questions");
    expect(block).toContain("Fix every one");
  });

  it("repairSceneContent_regenerates_until_rule_clean", async () => {
    const bad = { tag: "bad" };
    const good = { tag: "good" };
    const regenerate = vi
      .fn<(issues: CorrectionIssue[]) => Promise<{ tag: string } | null>>()
      .mockResolvedValueOnce(good);

    const result = await repairSceneContent({
      initial: bad,
      issues: [issue("bad content")],
      regenerate,
      verify: (content) => (content.tag === "good" ? [] : [issue("still bad")]),
      maxRepairs: 2,
    });

    expect(result.content).toEqual(good);
    expect(result.repairs).toBe(1);
    expect(result.remainingIssues).toEqual([]);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledWith([issue("bad content")]);
  });

  it("repairSceneContent_stops_at_budget", async () => {
    const regenerate = vi.fn(async () => ({ tag: "bad" }));

    const result = await repairSceneContent({
      initial: { tag: "bad" },
      issues: [issue("bad content")],
      regenerate,
      verify: () => [issue("still bad")],
      maxRepairs: 2,
    });

    expect(result.repairs).toBe(2);
    expect(result.content).toEqual({ tag: "bad" });
    expect(result.remainingIssues).toHaveLength(1);
  });

  it("repairSceneContent_returns_initial_when_regeneration_fails", async () => {
    const initial = { tag: "bad" };
    const regenerate = vi.fn(async () => null);

    const result = await repairSceneContent({
      initial,
      issues: [issue("bad content")],
      regenerate,
      verify: () => [],
      maxRepairs: 2,
    });

    expect(result.content).toBe(initial);
    expect(result.repairs).toBe(0);
    expect(result.remainingIssues).toHaveLength(1);
  });

  it("repairSceneContent_skips_regeneration_without_issues", async () => {
    const regenerate = vi.fn();
    const initial = { tag: "good" };

    const result = await repairSceneContent({
      initial,
      issues: [],
      regenerate,
      verify: () => [],
    });

    expect(regenerate).not.toHaveBeenCalled();
    expect(result.content).toBe(initial);
    expect(result.repairs).toBe(0);
  });
});
