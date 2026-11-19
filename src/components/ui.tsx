import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "dashboard"
  | "teams"
  | "flag"
  | "score"
  | "exam"
  | "palette"
  | "report"
  | "users"
  | "history"
  | "logout"
  | "check"
  | "alert"
  | "clock"
  | "arrow"
  | "plus"
  | "shield"
  | "menu"
  | "help"
  | "trophy"
  | "download";

const PATHS: Record<IconName, string> = {
  dashboard: "M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7V11h-7v9Zm0-16v5h7V4h-7Z",
  teams: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19c0-2.8 2.7-5 6-5s6 2.2 6 5M16 19c0-2.2-1.4-4.1-3.5-4.8",
  flag: "M5 3v18M5 4h11l-1.5 4L16 12H5",
  score: "M4 5h16M4 12h16M4 19h9M7 3v4M14 10v4M10 17v4",
  exam: "M6 3h9l3 3v15H6V3Zm3 7h6M9 14h6M9 18h4",
  palette: "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a2 2 0 0 0 2-2 8 8 0 0 0-6-8Z",
  report: "M5 3h14v18H5V3Zm3 5h8M8 12h8M8 16h5",
  users: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c0-3.3 3.6-6 8-6s8 2.7 8 6",
  history: "M12 8v5l3 2M4 12a8 8 0 1 1 2.3 5.7M4 12H2v-3",
  logout: "M15 12H4m3-3-3 3 3 3M11 4h7v16h-7",
  check: "m4 12 5 5L20 6",
  alert: "M12 3 2 21h20L12 3Zm0 6v6m0 3h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  shield: "M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6l8-3Zm-3 9 2.5 2.5L16 9",
  menu: "M4 7h16M4 12h16M4 17h16",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2-12a2 2 0 1 1 3 1.7c-.6.4-1 1-1 1.8m0 3h.01",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 13v4M8 21h8M10 17h4",
  download: "M12 3v12m-5-5 5 5 5-5M4 21h16",
};

export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return <Tag className={`card p-5 sm:p-6 ${className}`}>{children}</Tag>;
}

export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">{children}</h2>
        {hint ? (
          <p className="mt-1 text-sm text-muted" style={{ color: "var(--c-muted)" }}>
            {hint}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "accent";
}) {
  const style: CSSProperties =
    tone === "success"
      ? { background: "rgba(96,106,70,0.14)", color: "var(--c-success)" }
      : tone === "danger"
        ? { background: "rgba(142,47,35,0.12)", color: "var(--c-danger)" }
        : tone === "accent"
          ? { background: "var(--c-accent-soft)", color: "var(--c-text)" }
          : {};
  return (
    <span className="badge" style={style}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--c-muted)" }}>
          {label}
        </span>
        {icon ? (
          <span style={{ color: "var(--c-accent)" }}>
            <Icon name={icon} />
          </span>
        ) : null}
      </div>
      <p className="num mt-2 text-3xl font-semibold">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs" style={{ color: "var(--c-muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "danger" | "warning";
  title?: string;
  children: ReactNode;
}) {
  const map = {
    info: { color: "var(--c-primary)", icon: "help" as IconName },
    success: { color: "var(--c-success)", icon: "check" as IconName },
    danger: { color: "var(--c-danger)", icon: "alert" as IconName },
    warning: { color: "var(--c-accent)", icon: "alert" as IconName },
  }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="flex items-start gap-3 rounded-xl border p-4 text-sm"
      style={{
        borderColor: "var(--c-border)",
        background: "var(--c-surface)",
        borderLeft: `4px solid ${map.color}`,
      }}
    >
      <span style={{ color: map.color }} className="mt-0.5 shrink-0">
        <Icon name={map.icon} size={18} />
      </span>
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div style={{ color: "var(--c-muted)" }}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "flag",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center" style={{ borderColor: "var(--c-border)" }}>
      <span style={{ color: "var(--c-accent)" }}>
        <Icon name={icon} size={28} />
      </span>
      <div>
        <p className="text-lg font-semibold">{title}</p>
        {children ? (
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--c-muted)" }}>
            {children}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs" style={{ color: "var(--c-muted)" }}>
        <span>{label ?? "Progres"}</span>
        <span className="num">
          {value}/{max}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full"
        style={{ background: "var(--c-primary-soft)" }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progres"}
      >
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--c-primary)" }} />
      </div>
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Link href={href} className={`btn btn-${variant} ${className}`}>
      {children}
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p
            className="mb-2 text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--c-accent)" }}
          >
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl" style={{ color: "var(--c-muted)" }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
