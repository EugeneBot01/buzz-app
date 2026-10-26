/** Agent availability (Buzz Team): who in a channel can answer right now. */
export type AgentAvailability = "online" | "away" | "offline" | "unknown";

const MAX_NAMES = 3;

export function nameList(names: readonly string[]) {
  return names.length > MAX_NAMES
    ? `${names.slice(0, MAX_NAMES).join(", ")} 외 ${names.length - MAX_NAMES}`
    : names.join(", ");
}

/**
 * Agents run on their maker's Mac, so an agent whose presence lapsed (Mac
 * off or asleep) rests instead of answering. Unknown presence is left out:
 * missing evidence is not proof that an agent is away.
 */
export function splitAgents(
  agents: readonly { name: string; status: AgentAvailability }[],
) {
  const online: string[] = [];
  const resting: string[] = [];
  for (const { name, status } of agents) {
    if (status === "online" || status === "away") online.push(name);
    else if (status === "offline") resting.push(name);
  }
  return { online, resting };
}
