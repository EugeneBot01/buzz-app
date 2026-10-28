/** lucide-react names used by the calendar, drawn with the app's icons. */
import type { ComponentType } from "react";
import {
  ArrowLeftIcon,
  CalendarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CopyIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "../../../shared/design-system/icons";

type Props = { className?: string };
const size = (className?: string) =>
  className?.includes("h-3") ? 12 : className?.includes("h-5") ? 20 : 16;
// The app's icons are components (not plain functions), so render them as elements.
const wrap =
  (Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>) =>
  ({ className }: Props) => (
    <span className={className} style={{ display: "inline-flex" }}>
      <Icon size={size(className)} aria-hidden={true} />
    </span>
  );

export const ArrowLeft = wrap(ArrowLeftIcon);
export const CalendarPlus = wrap(CalendarIcon);
export const ChevronLeft = wrap(CaretLeftIcon);
export const ChevronRight = wrap(CaretRightIcon);
export const ClipboardPaste = wrap(CopyIcon);
export const Copy = wrap(CopyIcon);
export const Pencil = wrap(PencilSimpleIcon);
export const Plus = wrap(PlusIcon);
export const Trash2 = wrap(TrashIcon);
