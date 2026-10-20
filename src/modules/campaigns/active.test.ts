import { describe, expect, it } from "vitest";
import { resolveActiveCampaignId } from "./active";
import type { Campaign } from "./types";

function campaign(id: string, archived = false): Campaign {
  return { id, name: id, system: "PF2e", description: "", archived, createdAt: "", updatedAt: "" };
}

describe("resolveActiveCampaignId", () => {
  const list = [campaign("a"), campaign("b"), campaign("z", true)];

  it("keeps the preferred active campaign", () => {
    expect(resolveActiveCampaignId(list, "b")).toBe("b");
  });

  it("falls back to the first active one when preferred is archived or missing", () => {
    expect(resolveActiveCampaignId(list, "z")).toBe("a");
    expect(resolveActiveCampaignId(list, "gone")).toBe("a");
    expect(resolveActiveCampaignId(list, null)).toBe("a");
  });

  it("returns null when there are no active campaigns", () => {
    expect(resolveActiveCampaignId([campaign("z", true)], "z")).toBeNull();
    expect(resolveActiveCampaignId([], null)).toBeNull();
  });
});
