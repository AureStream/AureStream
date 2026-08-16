import type { PendingTraffic, SubSummary } from "./ipc";

export function withPendingTraffic(
  subscriptions: SubSummary[],
  pending: PendingTraffic[],
): SubSummary[] {
  if (pending.length === 0) return subscriptions;

  const pendingBySubscription = new Map(
    pending.map((usage) => [
      usage.subscriptionId,
      Math.max(0, usage.upload) + Math.max(0, usage.download),
    ]),
  );

  return subscriptions.map((subscription) => {
    const localUsage = pendingBySubscription.get(subscription.id) ?? 0;
    return localUsage === 0
      ? subscription
      : {
          ...subscription,
          trafficUsed: subscription.trafficUsed + localUsage,
        };
  });
}
