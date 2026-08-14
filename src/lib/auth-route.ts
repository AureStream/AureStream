export type AuthGateKind = "protected" | "guest";
export type AuthGateDecision = "wait" | "login" | "home" | "content";

/** Startup restore is in flight: do not send the user to /login or Home yet. */
export function resolveAuthGate(opts: {
  checking: boolean;
  hasUser: boolean;
  kind: AuthGateKind;
}): AuthGateDecision {
  if (opts.checking) {
    return "wait";
  }
  if (opts.kind === "protected") {
    return opts.hasUser ? "content" : "login";
  }
  return opts.hasUser ? "home" : "content";
}
