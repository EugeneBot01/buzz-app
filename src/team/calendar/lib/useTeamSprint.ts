import * as React from "react";

import {
  type PeopleById,
  type TeamPerson,
  TEAM_AVAILABILITY_D_TAG,
  decodePeople,
  encodePeopleForPublish,
  hasNewerPeople,
  livePeople,
  mergePeople,
  mergePeopleEvents,
  teamAvailabilityDTag,
} from "./teamAvailability";
import {
  type SprintPlan,
  TEAM_SPRINT_D_TAG,
  decodePlan,
  encodePlan,
  mergePlan,
  mergePlanEvents,
  planWins,
  teamSprintDTag,
  validatePlan,
} from "./teamSprint";
import { type SharedDocCodec, useSharedTeamDoc } from "./useSharedTeamDoc";

const planCodec: SharedDocCodec<SprintPlan | null> = {
  empty: null,
  mergeEvents: mergePlanEvents,
  decode: decodePlan,
  merge: mergePlan,
  hasNewer: (local, remote) => local !== null && planWins(local, remote),
  encode: (plan) => (plan ? encodePlan(plan) : null),
  tooBigMessage: "스프린트 설정을 저장하지 못했습니다.",
  slowMessage: "스프린트 설정을 저장하는 데 시간이 너무 오래 걸립니다.",
  failedMessage: "스프린트 설정을 저장하지 못했습니다.",
  topic: TEAM_SPRINT_D_TAG,
};

export type SprintPlanInput = Omit<SprintPlan, "updatedAt" | "updatedBy">;

/** The community's sprint board settings (`null` until someone saves them). */
export function useTeamSprintPlan(pubkey: string, relayUrl: string) {
  const { value, status, commit, refresh } = useSharedTeamDoc(
    pubkey,
    relayUrl,
    teamSprintDTag(relayUrl),
    planCodec,
  );

  const savePlan = React.useCallback(
    async (input: SprintPlanInput): Promise<void> => {
      const problem = validatePlan(input);
      if (problem) throw new Error(problem);
      await commit((previous) => ({
        ...input,
        title: input.title.trim(),
        note: input.note?.trim() || undefined,
        updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1),
        updatedBy: pubkey,
      }));
    },
    [commit, pubkey],
  );

  return { plan: value, status, savePlan, refresh };
}

const peopleCodec: SharedDocCodec<PeopleById> = {
  empty: {},
  mergeEvents: mergePeopleEvents,
  decode: decodePeople,
  merge: (base, other) => mergePeople(base, other),
  hasNewer: hasNewerPeople,
  encode: encodePeopleForPublish,
  tooBigMessage:
    "팀원 일정이 너무 많아 더 저장할 수 없습니다. 지난 일정을 정리해 주세요.",
  slowMessage: "팀원 일정을 저장하는 데 시간이 너무 오래 걸립니다.",
  failedMessage: "팀원 일정을 저장하지 못했습니다.",
  topic: TEAM_AVAILABILITY_D_TAG,
};

export type PersonInput = Omit<
  TeamPerson,
  "updatedAt" | "updatedBy" | "deleted"
>;

/** Everyone's schedules (who can work when), shared by the community. */
export function useTeamAvailability(pubkey: string, relayUrl: string) {
  const { value, status, commit, retry, refresh } = useSharedTeamDoc(
    pubkey,
    relayUrl,
    teamAvailabilityDTag(relayUrl),
    peopleCodec,
  );
  const people = React.useMemo(() => livePeople(value), [value]);

  const stamp = React.useCallback(
    (previous: TeamPerson | undefined) =>
      Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1),
    [],
  );

  /** Creates or replaces people (one commit, one publish). */
  const savePeople = React.useCallback(
    (inputs: PersonInput[]): Promise<void> =>
      commit((all) => {
        const next: PeopleById = {};
        for (const input of inputs) {
          next[input.id] = {
            ...input,
            name: input.name.trim(),
            role: input.role?.trim() || undefined,
            updatedAt: stamp(all[input.id]),
            updatedBy: pubkey,
          };
        }
        return mergePeople(all, next);
      }),
    [commit, pubkey, stamp],
  );

  const deletePerson = React.useCallback(
    (id: string): Promise<void> =>
      commit((all) => {
        const person = all[id];
        if (!person || person.deleted) return all;
        return mergePeople(all, {
          [id]: {
            id,
            name: "",
            rules: [],
            updatedAt: stamp(person),
            updatedBy: pubkey,
            deleted: true,
          },
        });
      }),
    [commit, pubkey, stamp],
  );

  return { people, status, savePeople, deletePerson, retry, refresh };
}
