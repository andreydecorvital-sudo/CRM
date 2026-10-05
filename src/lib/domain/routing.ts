export type RoutingMember = {
  userId: string
  active: boolean
  openConversations: number
  lastAssignedAt?: string | null
  weight?: number
}

export function chooseLeastOpen(members: RoutingMember[]): RoutingMember | null {
  const active = members.filter(member => member.active)
  if (!active.length) return null
  return [...active].sort((a, b) =>
    a.openConversations - b.openConversations ||
    new Date(a.lastAssignedAt || 0).getTime() - new Date(b.lastAssignedAt || 0).getTime() ||
    a.userId.localeCompare(b.userId)
  )[0] ?? null
}

export function chooseRoundRobin(members: RoutingMember[]): RoutingMember | null {
  const active = members.filter(member => member.active)
  if (!active.length) return null
  return [...active].sort((a, b) =>
    new Date(a.lastAssignedAt || 0).getTime() - new Date(b.lastAssignedAt || 0).getTime() ||
    a.openConversations - b.openConversations ||
    a.userId.localeCompare(b.userId)
  )[0] ?? null
}

export function chooseAssignee(mode: "manual" | "round_robin" | "least_open", members: RoutingMember[]) {
  if (mode === "manual") return null
  return mode === "least_open" ? chooseLeastOpen(members) : chooseRoundRobin(members)
}
