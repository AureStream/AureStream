import { describe, expect, it } from "vitest";
import { resolveAuthGate } from "./auth-route";

describe("resolveAuthGate", () => {
  it("waits on protected routes until session restore finishes", () => {
    expect(
      resolveAuthGate({ checking: true, hasUser: false, kind: "protected" }),
    ).toBe("wait");
    expect(
      resolveAuthGate({ checking: true, hasUser: true, kind: "protected" }),
    ).toBe("wait");
  });

  it("waits on guest routes until session restore finishes", () => {
    expect(
      resolveAuthGate({ checking: true, hasUser: false, kind: "guest" }),
    ).toBe("wait");
  });

  it("sends restored users to home and guests to login", () => {
    expect(
      resolveAuthGate({ checking: false, hasUser: true, kind: "protected" }),
    ).toBe("content");
    expect(
      resolveAuthGate({ checking: false, hasUser: false, kind: "protected" }),
    ).toBe("login");
    expect(
      resolveAuthGate({ checking: false, hasUser: true, kind: "guest" }),
    ).toBe("home");
    expect(
      resolveAuthGate({ checking: false, hasUser: false, kind: "guest" }),
    ).toBe("content");
  });
});
