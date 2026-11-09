import { Pencil, Plus, Search, Trash2, UserRound } from "../compat/icons";
import * as React from "react";
import { toast } from "sonner";

import {
  type AvailabilityRule,
  MAX_NAME_LENGTH,
  MAX_PEOPLE,
  MAX_ROLE_LENGTH,
  MAX_RULES_PER_PERSON,
  RULE_KIND_SHORT,
  type RuleKind,
  type TeamPerson,
  ruleWhenLabel,
} from "../lib/teamAvailability";
import type { TeamMember } from "../lib/useTeamMembers";
import type { PersonInput } from "../lib/useTeamSprint";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { Input } from "../compat/ui";
import {
  AvailabilityRuleForm,
  type RuleDraft,
  emptyRuleDraft,
  ruleDraftOf,
} from "./AvailabilityRuleForm";
import { SELECT_CLASS } from "./EntryForm";

export const KIND_BADGE: Record<RuleKind, string> = {
  busy: "bg-[#ef444426] text-[#b91c1c] dark:text-[#fca5a5]",
  available: "bg-[#22c55e26] text-[#15803d] dark:text-[#86efac]",
  tentative: "bg-[#f59e0b26] text-[#b45309] dark:text-[#fcd34d]",
};
const KIND_DOT: Record<RuleKind, string> = {
  busy: "bg-[#ef4444]",
  available: "bg-[#22c55e]",
  tentative: "bg-[#f59e0b]",
};

type Filter = "all" | "weekly" | "dated";

const newPersonId = () =>
  `p${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

/**
 * Member schedules (team patch): everyone's 불가/가능/조율 times, which
 * anyone in the community can add to. Ported from the team's "빈칸" page so
 * members put their schedules into Buzz instead.
 */
export function AvailabilityPanel({
  pubkey,
  people,
  status,
  members,
  nameOf,
  today,
  onSave,
  onDelete,
}: {
  pubkey: string;
  people: TeamPerson[];
  status: "loading" | "ready" | "error";
  members: TeamMember[];
  nameOf: (pubkey: string) => string;
  today: string;
  onSave: (person: PersonInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const mine = people.find((person) => person.pubkey === pubkey);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => mine?.id ?? null,
  );
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [ruleDraft, setRuleDraft] = React.useState<RuleDraft | null>(null);
  const [personDraft, setPersonDraft] = React.useState<PersonInput | null>(
    null,
  );
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const selected = people.find((person) => person.id === selectedId) ?? null;
  const shown = people.filter((person) =>
    `${person.name} ${person.role ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const rules = (selected?.rules ?? [])
    .filter((rule) =>
      filter === "weekly"
        ? rule.weekday !== null
        : filter === "dated"
          ? rule.weekday === null
          : true,
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        (a.weekday ?? -1) - (b.weekday ?? -1) ||
        a.start - b.start,
    );

  const run = async (action: () => Promise<void>, failure: string) => {
    setSaving(true);
    try {
      await action();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error && error.message ? error.message : failure,
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const savePerson = (person: TeamPerson, rulesNext: AvailabilityRule[]) =>
    onSave({
      id: person.id,
      name: person.name,
      role: person.role,
      pubkey: person.pubkey,
      rules: rulesNext,
    });

  const submitRule = async (rule: AvailabilityRule) => {
    if (!selected) return;
    const others = selected.rules.filter((item) => item.id !== rule.id);
    if (others.length >= MAX_RULES_PER_PERSON) {
      toast.error(`한 사람당 일정은 ${MAX_RULES_PER_PERSON}개까지입니다.`);
      return;
    }
    const ok = await run(
      () => savePerson(selected, [...others, rule]),
      "일정을 저장하지 못했습니다.",
    );
    if (ok) setRuleDraft(null);
  };

  const removeRule = (rule: AvailabilityRule) => {
    if (!selected) return;
    setConfirming(null);
    void run(
      () =>
        savePerson(
          selected,
          selected.rules.filter((item) => item.id !== rule.id),
        ),
      "일정을 지우지 못했습니다.",
    );
  };

  const submitPerson = async () => {
    if (!personDraft?.name.trim()) return;
    if (
      !people.some((person) => person.id === personDraft.id) &&
      people.length >= MAX_PEOPLE
    ) {
      toast.error(`팀원은 ${MAX_PEOPLE}명까지 넣을 수 있습니다.`);
      return;
    }
    const ok = await run(
      () => onSave(personDraft),
      "팀원을 저장하지 못했습니다.",
    );
    if (ok) {
      setSelectedId(personDraft.id);
      setPersonDraft(null);
    }
  };

  const counts = (person: TeamPerson) => person.rules.length;

  return (
    <div
      className="flex min-h-[28rem] flex-col gap-4 @3xl:flex-row"
      data-testid="availability-panel"
    >
      <section
        aria-label="팀원 목록"
        className="flex w-full shrink-0 flex-col gap-2 @3xl:w-64"
      >
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted" />
            <Input
              aria-label="이름 또는 역할 검색"
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름 또는 역할 검색"
              value={query}
            />
          </div>
          <Button
            aria-label="팀원 추가"
            data-testid="availability-add-person"
            onClick={() => {
              setRuleDraft(null);
              setPersonDraft({ id: newPersonId(), name: "", rules: [] });
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {mine ? null : (
          <p className="rounded-md bg-soft px-2 py-1.5 text-xs text-muted">
            내 이름을 고른 뒤 "이 사람이 나예요"를 누르면 다음부터 바로 내
            일정이 열립니다.
          </p>
        )}
        <ul className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto">
          {shown.map((person) => (
            <li key={person.id}>
              <button
                aria-pressed={person.id === selectedId}
                className={cn(
                  "border-0 cursor-pointer flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  person.id === selectedId && "bg-hover",
                )}
                data-testid="availability-person"
                onClick={() => {
                  setSelectedId(person.id);
                  setRuleDraft(null);
                  setPersonDraft(null);
                  setConfirming(null);
                }}
                type="button"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-semibold">
                  {person.name.slice(-2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {person.name}
                    {person.pubkey === pubkey ? (
                      <span className="ml-1 text-xs text-[var(--primary)]">
                        나
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[person.role, `${counts(person)}개 일정`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-2 py-4 text-center text-xs text-muted">
              {status === "loading"
                ? "불러오는 중…"
                : people.length === 0
                  ? "아직 팀원 일정이 없습니다. + 로 팀원을 추가하거나 가져오기를 쓰세요."
                  : "찾는 사람이 없습니다."}
            </li>
          ) : null}
        </ul>
      </section>

      <section
        aria-label="팀원 일정"
        className="flex min-w-0 flex-1 flex-col gap-3"
      >
        {personDraft ? (
          <form
            className="flex flex-col gap-2 rounded-lg border border-line p-3 text-xs"
            data-testid="availability-person-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPerson();
            }}
          >
            <h3 className="text-sm font-semibold">
              {people.some((person) => person.id === personDraft.id)
                ? "팀원 정보 수정"
                : "팀원 추가"}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                이름
                <Input
                  autoFocus
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) =>
                    setPersonDraft({ ...personDraft, name: event.target.value })
                  }
                  value={personDraft.name}
                />
              </label>
              <label className="flex flex-col gap-1">
                역할 (선택)
                <Input
                  maxLength={MAX_ROLE_LENGTH}
                  onChange={(event) =>
                    setPersonDraft({ ...personDraft, role: event.target.value })
                  }
                  placeholder="예: 촬영감독"
                  value={personDraft.role ?? ""}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              Buzz 멤버 연결 (선택)
              <select
                className={SELECT_CLASS}
                onChange={(event) =>
                  setPersonDraft({
                    ...personDraft,
                    pubkey: event.target.value || undefined,
                  })
                }
                value={personDraft.pubkey ?? ""}
              >
                <option value="">연결 안 함</option>
                {members.map((member) => (
                  <option key={member.pubkey} value={member.pubkey}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setPersonDraft(null)}
                size="sm"
                type="button"
                variant="ghost"
              >
                취소
              </Button>
              <Button
                disabled={saving || !personDraft.name.trim()}
                size="sm"
                type="submit"
              >
                저장
              </Button>
            </div>
          </form>
        ) : null}

        {selected ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3
                  className="text-base font-semibold"
                  data-testid="availability-person-name"
                >
                  {selected.name}님의 일정{" "}
                  {selected.role ? (
                    <span className="text-xs font-normal text-muted">
                      {selected.role}
                    </span>
                  ) : null}
                </h3>
                <p className="text-xs text-muted">
                  {selected.pubkey
                    ? `Buzz: ${nameOf(selected.pubkey)}`
                    : "Buzz 멤버와 연결 안 됨"}{" "}
                  · 빈 시간은 기본적으로 가능해요. 안 되는 시간과 조율 중인
                  시간만 적어 주세요.
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {selected.pubkey !== pubkey ? (
                  <Button
                    onClick={() =>
                      void run(async () => {
                        // One person per member: unlink the old "me" first.
                        if (mine && mine.id !== selected.id)
                          await savePerson(
                            { ...mine, pubkey: undefined },
                            mine.rules,
                          );
                        await savePerson(
                          { ...selected, pubkey },
                          selected.rules,
                        );
                      }, "연결하지 못했습니다.")
                    }
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <UserRound className="h-3 w-3" />이 사람이 나예요
                  </Button>
                ) : null}
                <Button
                  onClick={() => {
                    setRuleDraft(null);
                    setPersonDraft({
                      id: selected.id,
                      name: selected.name,
                      role: selected.role,
                      pubkey: selected.pubkey,
                      rules: selected.rules,
                    });
                  }}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  <Pencil className="h-3 w-3" />
                  정보 수정
                </Button>
                <Button
                  onClick={() =>
                    setConfirming(
                      confirming === selected.id ? null : selected.id,
                    )
                  }
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-3 w-3" />
                  팀원 삭제
                </Button>
              </div>
            </div>
            {confirming === selected.id ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-[#ef444466] bg-[#ef44441a] px-3 py-2 text-xs">
                <span>
                  {selected.name}님과 일정 {selected.rules.length}개를 모두
                  지울까요?
                </span>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setConfirming(null);
                    void run(
                      () => onDelete(selected.id),
                      "팀원을 지우지 못했습니다.",
                    ).then((ok) => {
                      if (ok) setSelectedId(null);
                    });
                  }}
                  size="xs"
                  type="button"
                  variant="destructive"
                >
                  삭제 확인
                </Button>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1" role="tablist">
                {(
                  [
                    ["all", "전체"],
                    ["weekly", "매주 반복"],
                    ["dated", "특정 날짜"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    aria-selected={filter === value}
                    key={value}
                    onClick={() => setFilter(value)}
                    role="tab"
                    size="xs"
                    type="button"
                    variant={filter === value ? "secondary" : "ghost"}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {ruleDraft ? null : (
                <Button
                  data-testid="availability-add-rule"
                  onClick={() => setRuleDraft(emptyRuleDraft(today))}
                  size="sm"
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  일정 추가
                </Button>
              )}
            </div>

            {ruleDraft ? (
              <AvailabilityRuleForm
                draft={ruleDraft}
                onCancel={() => setRuleDraft(null)}
                onChange={(update) =>
                  setRuleDraft((current) =>
                    current ? update(current) : current,
                  )
                }
                onSubmit={(rule) => void submitRule(rule)}
                saving={saving}
              />
            ) : null}

            <ul className="flex max-h-[24rem] flex-col gap-1.5 overflow-y-auto">
              {rules.map((rule) => (
                <li
                  className="flex items-start gap-2 rounded-lg border border-line px-3 py-2"
                  data-testid="availability-rule"
                  key={rule.id}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      KIND_DOT[rule.kind],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="break-words font-medium">
                        {rule.title}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 text-xs font-semibold",
                          KIND_BADGE[rule.kind],
                        )}
                      >
                        {RULE_KIND_SHORT[rule.kind]}
                      </span>
                    </p>
                    <p className="text-xs text-muted">{ruleWhenLabel(rule)}</p>
                    {confirming === rule.id ? (
                      <div className="mt-1 flex justify-end">
                        <Button
                          disabled={saving}
                          onClick={() => removeRule(rule)}
                          size="xs"
                          type="button"
                          variant="destructive"
                        >
                          삭제 확인
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <Button
                    aria-label={`${rule.title} 수정`}
                    disabled={saving}
                    onClick={() => setRuleDraft(ruleDraftOf(rule))}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    aria-label={`${rule.title} 삭제`}
                    disabled={saving}
                    onClick={() =>
                      setConfirming(confirming === rule.id ? null : rule.id)
                    }
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
              {rules.length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-muted">
                  등록된 일정이 없습니다. 안 되는 시간을 "일정 추가"로 알려
                  주세요.
                </li>
              ) : null}
            </ul>
          </>
        ) : personDraft ? null : (
          <p className="px-2 py-10 text-center text-sm text-muted">
            왼쪽에서 팀원을 고르면 그 사람의 일정을 보고 고칠 수 있어요.
          </p>
        )}
      </section>
    </div>
  );
}
