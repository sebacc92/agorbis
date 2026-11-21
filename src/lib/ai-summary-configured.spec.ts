import { describe, expect, it } from "vitest";
import { isAiSummaryConfigured } from "./ai-summary";

const env = (values: Record<string, string | undefined>) => ({
  get: (key: string) => values[key],
});

describe("isAiSummaryConfigured", () => {
  it("exige la clave y el modelo, sin espacios vacíos", () => {
    expect(isAiSummaryConfigured(env({}))).toBe(false);
    expect(isAiSummaryConfigured(env({ OPENAI_API_KEY: "sk-x" }))).toBe(false);
    expect(
      isAiSummaryConfigured(
        env({ OPENAI_API_KEY: "  ", OPENAI_SUMMARY_MODEL: "gpt" }),
      ),
    ).toBe(false);
    expect(
      isAiSummaryConfigured(
        env({ OPENAI_API_KEY: "sk-x", OPENAI_SUMMARY_MODEL: "gpt" }),
      ),
    ).toBe(true);
  });
});
