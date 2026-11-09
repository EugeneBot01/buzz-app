/** lucide-react names used by the calendar, drawn with the app's icons. */
import type { ComponentType } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ColumnsIcon,
  DownloadIcon,
  GearIcon,
  MagnifyingGlassIcon,
  CloudUploadIcon,
  UserIcon,
  XIcon,
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
export const ArrowDown = wrap(ArrowDownIcon);
export const ArrowUp = wrap(ArrowUpIcon);
export const CalendarDays = wrap(CalendarIcon);
export const Download = wrap(DownloadIcon);
export const FileUp = wrap(CloudUploadIcon);
export const KanbanSquare = wrap(ColumnsIcon);
export const Search = wrap(MagnifyingGlassIcon);
export const Settings2 = wrap(GearIcon);
export const Upload = wrap(CloudUploadIcon);
export const UserRound = wrap(UserIcon);
export const X = wrap(XIcon);
