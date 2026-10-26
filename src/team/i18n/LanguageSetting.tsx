import { PreferenceRow } from "../../shared/design-system/ui/PreferenceRow";
import { Select } from "../../shared/design-system/ui/Select";
import { readUiLocale, writeUiLocale } from "./domTranslator";

/** Settings → Appearance: Korean or English UI. Changing it reloads the app. */
export function LanguageSetting() {
  const locale = readUiLocale();
  return (
    <PreferenceRow
      id="setting-ui-language"
      title="언어 / Language"
      trailing={
        <span data-no-translate="">
          <Select
            variant="compact"
            label="언어 / Language"
            value={locale}
            groups={[
              {
                label: "언어 / Language",
                options: [
                  { value: "ko", label: "한국어" },
                  { value: "en", label: "English" },
                ],
              },
            ]}
            onValueChange={(value) => {
              if ((value !== "ko" && value !== "en") || value === locale)
                return;
              writeUiLocale(value);
              window.location.reload();
            }}
          />
        </span>
      }
    />
  );
}
