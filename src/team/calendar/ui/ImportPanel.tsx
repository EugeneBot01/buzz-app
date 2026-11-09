import { FileUp } from "../compat/icons";
import * as React from "react";
import { toast } from "sonner";

import {
  type CalendarImport,
  parseCalendarImport,
} from "../lib/calendarImport";
import { saveEntriesToDocs } from "../lib/useTeamCalendar";
import type { PersonInput, SprintPlanInput } from "../lib/useTeamSprint";
import { Button } from "../compat/ui";

/** Most bytes of an import file (a full team backup is well under this). */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * "가져오기" (team patch): loads a master plan / backup file into the shared
 * calendar. Nothing is written until the person presses "가져오기" after the
 * preview. Ids in the file are kept, so importing the same file again
 * updates instead of duplicating.
 */
export function ImportPanel({
  pubkey,
  relayUrl,
  hasPlan,
  onSavePlan,
  onSavePeople,
  onImported,
  onClose,
}: {
  pubkey: string;
  relayUrl: string;
  /** A plan is already saved (importing one replaces it). */
  hasPlan: boolean;
  onSavePlan: (plan: SprintPlanInput) => Promise<void>;
  onSavePeople: (people: PersonInput[]) => Promise<void>;
  /** Called after an import (also a partial one) so views read again. */
  onImported: () => void;
  onClose: () => void;
}) {
  const [file, setFile] = React.useState<{
    name: string;
    data: CalendarImport;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [include, setInclude] = React.useState({
    plan: true,
    entries: true,
    people: true,
  });
  const [progress, setProgress] = React.useState<string | null>(null);
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const pick = async (picked: File | undefined) => {
    setError(null);
    setFile(null);
    if (!picked) return;
    if (picked.size > MAX_IMPORT_BYTES) {
      setError("파일이 너무 큽니다 (2MB까지).");
      return;
    }
    try {
      const data = parseCalendarImport(await picked.text());
      setFile({ name: picked.name, data });
      setInclude({
        plan: data.plan !== null,
        entries: data.entries.length > 0,
        people: data.people.length > 0,
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  const run = async () => {
    if (!file || progress) return;
    const { data } = file;
    try {
      if (include.plan && data.plan) {
        setProgress("보드 설정 저장 중…");
        await onSavePlan(data.plan);
      }
      if (include.entries && data.entries.length > 0) {
        setProgress(`일정 저장 중… 0/${data.entries.length}`);
        const saved = await saveEntriesToDocs({
          pubkey,
          relayUrl,
          entries: data.entries,
          isCurrent: () => aliveRef.current,
          onProgress: (done, total) => {
            if (aliveRef.current) setProgress(`일정 저장 중… ${done}/${total}`);
          },
        });
        if (saved < data.entries.length)
          throw new Error(
            `일정 ${saved}/${data.entries.length}개까지만 저장했습니다.`,
          );
      }
      if (include.people && data.people.length > 0) {
        setProgress("팀원 일정 저장 중…");
        await onSavePeople(data.people);
      }
      toast.success("가져오기를 마쳤습니다.");
      onClose();
    } catch (problem) {
      toast.error("가져오는 중에 멈췄습니다.", {
        description: `${
          problem instanceof Error ? problem.message : String(problem)
        } — 같은 파일을 다시 가져오면 이어서 맞춰집니다.`,
      });
    } finally {
      // Months that opened while importing may have missed the new entries.
      onImported();
      if (aliveRef.current) setProgress(null);
    }
  };

  const ruleCount =
    file?.data.people.reduce((sum, person) => sum + person.rules.length, 0) ??
    0;
  const nothing =
    !file ||
    !(
      (include.plan && file.data.plan) ||
      (include.entries && file.data.entries.length) ||
      (include.people && file.data.people.length)
    );

  return (
    <div className="flex flex-col gap-4 text-xs" data-testid="import-panel">
      <p className="text-muted">
        마스터 플랜·팀원 일정 파일(<code>buzz-team-calendar</code> 형식 JSON)
        또는 "배포 → 백업"으로 받은 파일을 불러옵니다. 가져온 내용은 이
        커뮤니티의 모든 멤버에게 보입니다.
      </p>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-6 text-sm hover:bg-soft">
        <FileUp className="h-5 w-5" />
        {file ? file.name : "파일 고르기"}
        <input
          accept="application/json,.json"
          className="sr-only"
          data-testid="import-file"
          onChange={(event) => void pick(event.target.files?.[0])}
          type="file"
        />
      </label>
      {error ? (
        <p className="text-danger" data-testid="import-error" role="alert">
          {error}
        </p>
      ) : null}
      {file ? (
        <fieldset className="flex flex-col gap-2" data-testid="import-preview">
          <legend className="mb-1 text-sm font-semibold">가져올 내용</legend>
          <label className="flex items-center gap-2">
            <input
              checked={include.plan}
              disabled={!file.data.plan}
              onChange={(event) =>
                setInclude({ ...include, plan: event.target.checked })
              }
              type="checkbox"
            />
            보드 설정{" "}
            {file.data.plan
              ? `“${file.data.plan.title}” ${file.data.plan.start}부터 ${file.data.plan.weeks}주, 부서 ${file.data.plan.depts.length}개${hasPlan ? " (지금 설정을 바꿉니다)" : ""}`
              : "없음"}
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={include.entries}
              disabled={file.data.entries.length === 0}
              onChange={(event) =>
                setInclude({ ...include, entries: event.target.checked })
              }
              type="checkbox"
            />
            일정 {file.data.entries.length}개 (스프린트·달력에 함께 보임)
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={include.people}
              disabled={file.data.people.length === 0}
              onChange={(event) =>
                setInclude({ ...include, people: event.target.checked })
              }
              type="checkbox"
            />
            팀원 {file.data.people.length}명의 일정 {ruleCount}개 (같은 팀원은
            덮어씀)
          </label>
        </fieldset>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p
          aria-live="polite"
          className="text-muted"
          data-testid="import-progress"
        >
          {progress}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={progress !== null}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            닫기
          </Button>
          <Button
            data-testid="import-run"
            disabled={nothing || progress !== null}
            onClick={() => void run()}
            size="sm"
            type="button"
          >
            가져오기
          </Button>
        </div>
      </div>
    </div>
  );
}
