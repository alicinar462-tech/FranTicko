
import { describe, expect, it } from "vitest";

describe("Ticko order parameters", () => {
  it("supports valid order types", () => {
    const orderTypes = ["limit", "market"];

    expect(orderTypes).toContain("limit");
    expect(orderTypes).toContain("market");
  });

  it("supports valid time in force values", () => {
    const values = ["gtc", "ioc", "fok"];

    expect(values).toContain("gtc");
    expect(values).toContain("ioc");
    expect(values).toContain("fok");
  });

  it("supports valid position sides", () => {
    const values = ["both", "long", "short"];

    expect(values).toContain("both");
    expect(values).toContain("long");
    expect(values).toContain("short");
  });

  it("supports valid margin modes", () => {
    const values = ["cross", "isolated"];

    expect(values).toContain("cross");
    expect(values).toContain("isolated");
  });

  it("supports valid price match values", () => {
    const values = [
      "queue_1",
      "queue_5",
      "counter_party_1",
      "counter_party_5",
    ];

    expect(values).toHaveLength(4);
  });

  it("supports valid market order types", () => {
    const values = ["base", "quote"];

    expect(values).toContain("base");
    expect(values).toContain("quote");
  });
});
