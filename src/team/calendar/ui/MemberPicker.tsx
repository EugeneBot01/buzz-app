import type { TeamMember } from "../lib/useTeamMembers";
import { Checkbox } from "../compat/ui";

/**
 * Attendee choice: the whole team, or a ticked list of members. An empty
 * `selected` with `everyone` means the entry is for all.
 */
export function MemberPicker({
  members,
  everyone,
  selected,
  onChange,
}: {
  members: TeamMember[];
  everyone: boolean;
  selected: string[];
  onChange: (next: { everyone: boolean; selected: string[] }) => void;
}) {
  const chosen = new Set(selected);
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 text-xs">
      <legend className="mb-1">참석자</legend>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={everyone}
          data-testid="team-calendar-attendees-everyone"
          onCheckedChange={(checked) =>
            onChange({ everyone: checked === true, selected })
          }
        />
        팀 전체
      </label>
      {everyone ? null : (
        <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
          {members.length === 0 ? (
            <span className="text-muted">멤버를 불러오는 중…</span>
          ) : (
            members.map((member) => (
              <label className="flex items-center gap-2" key={member.pubkey}>
                <Checkbox
                  checked={chosen.has(member.pubkey)}
                  onCheckedChange={(checked) => {
                    const next = new Set(chosen);
                    if (checked === true) next.add(member.pubkey);
                    else next.delete(member.pubkey);
                    onChange({ everyone: false, selected: [...next] });
                  }}
                />
                <span className="truncate">{member.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </fieldset>
  );
}
