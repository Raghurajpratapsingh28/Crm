import { describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import {
  likePattern,
  parseAmount,
  parseCurrency,
  parseLostReasonInput,
  parseProbability,
  probabilityAfterStageChange,
  probabilityForNewDeal,
} from "./deal.js";

describe("deal helpers", () => {
  it("calculates default and manual create probabilities", () => {
    expect(probabilityForNewDeal(65)).toEqual({ probability: 65, probabilitySource: "STAGE_DEFAULT" });
    expect(probabilityForNewDeal(65, 72)).toEqual({ probability: 72, probabilitySource: "MANUAL" });
  });

  it("preserves manual probability across stage changes unless reset or won", () => {
    const preserved = probabilityAfterStageChange({
      currentProbability: 72,
      probabilitySource: "MANUAL",
      fromStage: { isWon: false, isLost: false },
      toStage: { probability: 80, isWon: false, isLost: false },
    });
    expect(preserved).toEqual({ probability: 72, probabilitySource: "MANUAL" });

    const reset = probabilityAfterStageChange({
      currentProbability: 72,
      probabilitySource: "MANUAL",
      fromStage: { isWon: false, isLost: false },
      toStage: { probability: 80, isWon: false, isLost: false },
      resetProbability: true,
    });
    expect(reset).toEqual({ probability: 80, probabilitySource: "STAGE_DEFAULT" });

    const won = probabilityAfterStageChange({
      currentProbability: 72,
      probabilitySource: "MANUAL",
      fromStage: { isWon: false, isLost: false },
      toStage: { probability: 100, isWon: true, isLost: false },
    });
    expect(won.probability).toBe(100);
  });

  it("adopts stage default when probability source is STAGE_DEFAULT", () => {
    expect(
      probabilityAfterStageChange({
        currentProbability: 65,
        probabilitySource: "STAGE_DEFAULT",
        fromStage: { isWon: false, isLost: false },
        toStage: { probability: 80, isWon: false, isLost: false },
      }),
    ).toEqual({ probability: 80, probabilitySource: "STAGE_DEFAULT" });
  });

  it("validates amount, currency, and probability", () => {
    expect(parseCurrency("inr")).toBe("INR");
    expect(Number(parseAmount(10000)?.toString())).toBe(10000);
    expect(parseProbability(50)).toBe(50);
    expect(() => parseAmount(-1)).toThrow(AppError);
    expect(() => parseCurrency("US")).toThrow(AppError);
    expect(() => parseProbability(101)).toThrow(AppError);
  });

  it("requires a lost reason and maps known codes", () => {
    expect(() => parseLostReasonInput("")).toThrow(AppError);
    try {
      parseLostReasonInput("");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("LOST_REASON_REQUIRED");
    }
    expect(parseLostReasonInput("Budget constraints")).toEqual({
      lostReason: "OTHER",
      lostReasonNote: "Budget constraints",
    });
    expect(parseLostReasonInput("NO_BUDGET")).toEqual({ lostReason: "NO_BUDGET", lostReasonNote: null });
  });

  it("escapes LIKE wildcards", () => {
    expect(likePattern("acme%")).toBe("%acme\\%%");
  });
});
