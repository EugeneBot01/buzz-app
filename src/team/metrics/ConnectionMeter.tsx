import { useEffect, useState } from "react";
import { writeClipboardText } from "../../shared/clipboard";
import { Button } from "../../shared/design-system/ui/Button";
import { InlineHeader } from "../../shared/design-system/ui/Header";
import { PreferenceRow } from "../../shared/design-system/ui/PreferenceRow";
import { SettingsGroup } from "../../shared/design-system/ui/SettingsGroup";
import { communityAlerts } from "../notifications/community-alerts";
import { communityHost, relayMetrics } from "./relay-metrics";

const perMinute = (value: number, minutes: number) =>
  Math.round((value / minutes) * 10) / 10;
const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

/** Settings → Notifications: what each community's connection costs. */
export function ConnectionMeter() {
  const [, tick] = useState(0);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const timer = setInterval(() => tick((count) => count + 1), 5_000);
    return () => clearInterval(timer);
  }, []);
  const { minutes, communities } = relayMetrics.snapshot();
  const names = new Map(
    (communityAlerts.communities()?.snapshot().memberships ?? []).map(
      (membership) => [
        communityHost(membership.id),
        membership.localName || membership.publishedName || membership.name,
      ],
    ),
  );
  const rows = communities
    .map((community) => ({
      name: names.get(community.host) || community.host,
      line: `연결 ${community.socketsOpen} · 구독 ${community.subscriptions} · 받은 메시지 ${perMinute(community.framesIn, minutes)}/분 · 받은 양 ${perMinute(kb(community.bytesIn + community.readBytes), minutes)}KB/분 · 읽기 요청 ${perMinute(community.reads, minutes)}/분`,
      community,
    }))
    .sort(
      (a, b) =>
        b.community.bytesIn +
        b.community.readBytes -
        (a.community.bytesIn + a.community.readBytes),
    );
  const report = () =>
    [
      `연결 측정 (${Math.round(minutes)}분)`,
      ...rows.map(({ name, line, community }) =>
        [
          `- ${name}: ${line}`,
          `  (총계: 연결 ${community.sockets}회, 보낸 메시지 ${community.framesOut}, 받은 메시지 ${community.framesIn}, 받은 양 ${kb(community.bytesIn)}KB, 읽기 ${community.reads}회 ${kb(community.readBytes)}KB)`,
        ].join("\n"),
      ),
    ].join("\n");
  return (
    <section aria-labelledby="team-connection-meter-title">
      <InlineHeader
        id="team-connection-meter-title"
        title="연결 측정"
        subtitle={`앱을 켠 뒤 ${Math.round(minutes)}분 동안 커뮤니티마다 주고받은 양이에요. 내용은 기록하지 않아요.`}
      />
      <SettingsGroup>
        {rows.length === 0 ? (
          <PreferenceRow title="아직 기록이 없어요" />
        ) : (
          rows.map(({ name, line, community }) => (
            <PreferenceRow
              key={community.host}
              title={<span data-no-translate="">{name}</span>}
              subtitle={line}
            />
          ))
        )}
        <PreferenceRow
          title="결과 보내기"
          subtitle={status || "복사해서 대화창에 붙여 주세요"}
          trailing={
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="subtle"
                onClick={() =>
                  void writeClipboardText(report())
                    .then(() => setStatus("복사했어요."))
                    .catch(() => setStatus("복사하지 못했어요."))
                }
              >
                복사
              </Button>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => {
                  relayMetrics.reset();
                  setStatus("처음부터 다시 재요.");
                  tick((count) => count + 1);
                }}
              >
                다시 재기
              </Button>
            </span>
          }
        />
      </SettingsGroup>
    </section>
  );
}
