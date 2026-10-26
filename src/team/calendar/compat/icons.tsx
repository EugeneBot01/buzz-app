/** lucide-react names used by the calendar, drawn with the app's icons. */
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
const wrap =
  (Icon: (props: { size?: number; "aria-hidden"?: boolean }) => unknown) =>
  ({ className }: Props) => (
    <span className={className} style={{ display: "inline-flex" }}>
      {Icon({ size: size(className), "aria-hidden": true }) as never}
    </span>
  );

export const ArrowLeft = wrap(ArrowLeftIcon as never);
export const CalendarPlus = wrap(CalendarIcon as never);
export const ChevronLeft = wrap(CaretLeftIcon as never);
export const ChevronRight = wrap(CaretRightIcon as never);
export const ClipboardPaste = wrap(CopyIcon as never);
export const Copy = wrap(CopyIcon as never);
export const Pencil = wrap(PencilSimpleIcon as never);
export const Plus = wrap(PlusIcon as never);
export const Trash2 = wrap(TrashIcon as never);
