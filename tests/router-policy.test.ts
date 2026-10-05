import { describe,expect,it } from "vitest"
import { simulateRouter } from "../src/lib/server/intelligence/simulator"

describe("Event Router policy",() => {
  it("routes recovery events to sales/tasks/analytics as a proposal wake-up",() => {
    const [result] = simulateRouter(["revenue.recovery.detected"])

    expect(result.policy.key).toBe("sales.revenue.recovery")
    expect(result.policy.capabilities).toEqual(["sales","tasks","analytics"])
    expect(result.policy.severity).toBe("warning")
    expect(result.policy.wakeMode).toBe("propose")
  })

  it("normalizes underscore event names",() => {
    const [result] = simulateRouter(["next_action.proposed"])

    expect(result.policy.key).toBe("sales.next.action")
    expect(result.policy.capabilities).toEqual(["tasks","sales","analytics"])
  })

  it("keeps unknown events on the operations fallback",() => {
    const [result] = simulateRouter(["future.module.did_something"])

    expect(result.policy.key).toBe("operations.fallback")
    expect(result.policy.capabilities).toEqual(["operations","analytics"])
  })
})
