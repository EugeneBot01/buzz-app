import type { PluginModule } from "../../plugins/api";
import referenceStyles from "../../shared/InlineReference.module.css";

// Buzz Team: show @all / @everyone in sent messages like a mention chip.
const TOKEN = /(^|[^\w@/.-])(@(?:all|everyone))(?![\w-])/gi;

export const inject = ["conversation"];
export const apply: PluginModule["apply"] = (ctx) => {
  ctx.conversation.registerInline({
    id: "group-mention",
    title: "Group mention",
    matches: ({ text }) =>
      [...text.matchAll(TOKEN)].map((match) => {
        const start = (match.index ?? 0) + (match[1]?.length ?? 0);
        return { start, end: start + (match[2]?.length ?? 0) };
      }),
    component: ({ text }) => (
      <span
        className={referenceStyles.link}
        data-mention-kind="person"
        data-mention-self=""
      >
        {text}
      </span>
    ),
  });
};
