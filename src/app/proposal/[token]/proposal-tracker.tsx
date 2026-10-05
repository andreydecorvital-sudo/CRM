"use client"

import { useEffect } from "react"

export default function ProposalTracker({ token, enabled }: { token: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return
    void fetch("/api/proposals/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    })
  }, [enabled, token])
  return null
}
