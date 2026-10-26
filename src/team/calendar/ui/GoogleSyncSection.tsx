import * as React from "react";
import { toast } from "sonner";

import { GOOGLE_APPS_SCRIPT } from "../lib/googleSync";
import { useGoogleSyncSettings } from "../lib/useGoogleCalendarSync";
import { Button } from "../compat/ui";
import { Input } from "../compat/ui";
import { Step, StatusLine } from "./DigestPanel";

function statusText(
  status: ReturnType<typeof useGoogleSyncSettings>["status"],
): string | null {
  if (!status) return null;
  const at = new Date(status.at).toLocaleString("ko-KR");
  if (status.result === "error")
    return `${at} 실패: ${status.message ?? "알 수 없는 오류"} (잠시 뒤 다시 시도)`;
  if (status.result === "sent")
    return `${at} 일정 ${status.count}개 보냄 (구글 응답은 확인 못 함)`;
  return `${at} 일정 ${status.count}개 반영됨`;
}

/**
 * Google Calendar link of this device (team patch). Only the device that has
 * it set sends changes, so one person with the app often open should set it.
 */
export function GoogleSyncSection({
  pubkey,
  relayUrl,
}: {
  pubkey: string;
  relayUrl: string;
}) {
  const { config, status, save, resendAll } = useGoogleSyncSettings(
    pubkey,
    relayUrl,
  );
  const [url, setUrl] = React.useState(config?.url ?? "");
  const [secret, setSecret] = React.useState(config?.secret ?? "");
  const [showScript, setShowScript] = React.useState(false);

  const apply = () => {
    try {
      save({ url, secret });
      toast.success(
        "구글 캘린더 연동을 켰습니다. 30초 안에 보내기 시작합니다.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const line = statusText(status);

  return (
    <section
      aria-label="구글 캘린더 연동"
      className="flex flex-col gap-4"
      data-testid="team-calendar-google"
    >
      <StatusLine on={Boolean(config)}>
        {config
          ? "이 맥이 팀 캘린더 일정을 구글 캘린더로 보내고 있어요."
          : "팀 캘린더 일정을 구글 캘린더에도 똑같이 넣어 줘요. 처음 한 번만 설정하면 돼요."}
      </StatusLine>
      <p className="text-xs text-muted">
        <b>누가 하나요?</b> 1~2는 구글 캘린더 주인(예: PD)이, 3은 Buzz를 자주 켜
        두는 한 사람이 하면 돼요. 팀원 모두가 할 필요는 없어요. 구글에서 고친
        내용은 Buzz로 오지 않아요.
      </p>

      <Step
        n={1}
        title="구글 쪽 준비 코드 복사"
        hint="아래 버튼을 누르면 구글에 붙여 넣을 코드가 복사돼요."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              void navigator.clipboard
                .writeText(GOOGLE_APPS_SCRIPT)
                .then(() => toast.success("코드를 복사했습니다."))
                .catch(() => toast.error("복사하지 못했습니다."))
            }
            size="sm"
            type="button"
            variant="outline"
          >
            코드 복사
          </Button>
          <Button
            aria-expanded={showScript}
            onClick={() => setShowScript((shown) => !shown)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {showScript ? "코드 숨기기" : "코드 보기"}
          </Button>
        </div>
        {showScript ? (
          <pre className="max-h-48 overflow-auto rounded-md bg-soft p-2 text-2xs">
            {GOOGLE_APPS_SCRIPT}
          </pre>
        ) : null}
      </Step>

      <Step n={2} title="구글에서 한 번 배포">
        <ol className="list-decimal pl-5 text-xs text-muted">
          <li>
            구글 캘린더 설정에서 팀 캘린더를 누르고, "캘린더 통합"의 캘린더 ID를
            복사해요.
          </li>
          <li>
            script.google.com 에서 새 프로젝트를 만들고, 복사한 코드를 붙여 넣은
            뒤 맨 위의 캘린더 ID와 비밀문구(아무 단어)를 채워요.
          </li>
          <li>
            배포, 새 배포, 웹 앱을 차례로 고르고 "실행: 나", "액세스: 모든
            사용자"로 배포한 뒤 권한을 허용해요.
          </li>
          <li>나온 웹 앱 주소를 복사해요.</li>
        </ol>
      </Step>

      <Step n={3} title="주소와 비밀문구 넣고 켜기">
        <Input
          aria-label="Apps Script 웹 앱 주소"
          data-testid="team-calendar-google-url"
          onChange={(event) => setUrl(event.target.value)}
          placeholder="웹 앱 주소 (https://script.google.com/macros/s/…/exec)"
          value={url}
        />
        <Input
          aria-label="비밀문구"
          data-testid="team-calendar-google-secret"
          onChange={(event) => setSecret(event.target.value)}
          placeholder="2번에서 정한 비밀문구"
          type="password"
          value={secret}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!url || !secret}
            onClick={apply}
            size="sm"
            type="button"
          >
            {config ? "바꾸기" : "연동 켜기"}
          </Button>
          {config ? (
            <>
              <Button
                onClick={() => {
                  resendAll();
                  toast("다음 확인 때 모든 일정을 다시 보냅니다.");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                전부 다시 보내기
              </Button>
              <Button
                onClick={() => {
                  save(null);
                  setUrl("");
                  setSecret("");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                연동 끄기
              </Button>
            </>
          ) : null}
        </div>
        {line ? <p className="text-xs text-muted">{line}</p> : null}
      </Step>
    </section>
  );
}
