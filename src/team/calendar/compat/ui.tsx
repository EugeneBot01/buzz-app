/**
 * The few UI parts the team calendar used from the 0.5 app, drawn with the
 * new app's colors. Inside the calendar page, Dialog renders in place.
 */
import {
  type ButtonHTMLAttributes,
  createContext,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useContext,
  useEffect,
} from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "destructive" | "secondary";
  size?: "default" | "sm" | "xs" | "icon" | "icon-xs";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-[var(--primary)] text-on-primary hover:opacity-90",
  secondary: "bg-soft text-ink hover:bg-hover",
  ghost: "bg-transparent text-ink hover:bg-hover",
  outline: "border border-line bg-transparent text-ink hover:bg-hover",
  destructive: "bg-danger text-white hover:opacity-90",
};
const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
  xs: "h-7 px-2 text-xs",
  icon: "h-8 w-8 p-0",
  "icon-xs": "h-6 w-6 p-0",
};

export function Button({
  variant = "default",
  size = "default",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

const FIELD =
  "w-full min-w-0 rounded-md border border-input-line bg-surface px-2.5 text-sm text-ink outline-none focus-visible:border-[var(--primary)]";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, "h-8", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(FIELD, "min-h-16 py-1.5", className)} {...props} />
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 cursor-pointer accent-[var(--primary)]",
        className,
      )}
      checked={!!checked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      {...props}
    />
  );
}

/** True inside the calendar page: dialogs render in place, not as a modal. */
export const InlineDialog = createContext(false);
const DialogClose = createContext<(() => void) | undefined>(undefined);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const inline = useContext(InlineDialog);
  const close = () => onOpenChange?.(false);
  useEffect(() => {
    if (!open || inline) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange?.(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, inline, onOpenChange]);
  if (!open) return null;
  if (inline) return <>{children}</>;
  return (
    <DialogClose value={close}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {children}
      </div>
    </DialogClose>
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const inline = useContext(InlineDialog);
  const close = useContext(DialogClose);
  return (
    <div
      role={inline ? undefined : "dialog"}
      aria-modal={inline ? undefined : true}
      className={cn(
        inline
          ? "flex w-full flex-col gap-4"
          : "relative flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-elevated p-5 text-ink shadow-xl",
        !inline && className,
      )}
      {...props}
    >
      {children}
      {close ? (
        <button
          type="button"
          aria-label="Close"
          className="absolute top-3 right-3 h-7 w-7 cursor-pointer rounded-md text-muted hover:bg-hover"
          onClick={close}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}
export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold text-ink">{children}</h2>;
}
export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
