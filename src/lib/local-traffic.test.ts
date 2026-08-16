import { describe, expect, it } from "vitest";
import type { PendingTraffic, SubSummary } from "./ipc";
import { withPendingTraffic } from "./local-traffic";

const remote: SubSummary[] = [
  {
    id: "sub-1",
    name: "订阅",
    trafficUsed: 1_000,
    trafficTotal: 10_000,
    expireTime: 0,
  },
];

const pending: PendingTraffic[] = [
  { subscriptionId: "sub-1", upload: 100, download: 300 },
];

describe("local traffic overlay", () => {
  it("adds pending upload and download to the remote usage", () => {
    expect(withPendingTraffic(remote, pending)[0].trafficUsed).toBe(1_400);
  });

  it("keeps pending usage when a newer remote payload arrives", () => {
    const refreshed = [{ ...remote[0], trafficUsed: 1_200 }];
    expect(withPendingTraffic(refreshed, pending)[0].trafficUsed).toBe(1_600);
  });

  it("uses the remote value after pending usage is acknowledged", () => {
    expect(withPendingTraffic(remote, [])[0].trafficUsed).toBe(1_000);
  });
});
