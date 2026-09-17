import { describe, expect, it } from "vitest";
import { classifyScoreBand, SCORE_BAND_ICON, SCORE_BAND_LABEL } from "@/lib/logic/safety-score";

describe("classifyScoreBand", () => {
  it("returns null for null score", () => {
    expect(classifyScoreBand(null)).toBeNull();
  });

  it("returns null for undefined score", () => {
    expect(classifyScoreBand(undefined)).toBeNull();
  });

  it("returns null for NaN score", () => {
    expect(classifyScoreBand(NaN)).toBeNull();
  });

  it("classifies >= 80 as good", () => {
    expect(classifyScoreBand(80)).toBe("good");
    expect(classifyScoreBand(100)).toBe("good");
  });

  it("classifies 60-79 as warning", () => {
    expect(classifyScoreBand(60)).toBe("warning");
    expect(classifyScoreBand(79)).toBe("warning");
  });

  it("classifies below 60 as critical", () => {
    expect(classifyScoreBand(59)).toBe("critical");
    expect(classifyScoreBand(0)).toBe("critical");
  });
});

describe("SCORE_BAND_LABEL / SCORE_BAND_ICON", () => {
  it("has an entry for every band", () => {
    expect(SCORE_BAND_LABEL.good).toBe("Good");
    expect(SCORE_BAND_LABEL.warning).toBe("Warning");
    expect(SCORE_BAND_LABEL.critical).toBe("Critical");
    expect(SCORE_BAND_ICON.good).toBeTruthy();
    expect(SCORE_BAND_ICON.warning).toBeTruthy();
    expect(SCORE_BAND_ICON.critical).toBeTruthy();
  });
});
