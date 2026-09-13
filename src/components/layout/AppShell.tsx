import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Backdrop } from "../design/Backdrop";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" fill="currentColor" />
      <path
        d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 7.4V12l3 2.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M12 3.4v2.2m0 12.8v2.2M20.6 12h-2.2M5.6 12H3.4m14.7-5.1-1.5 1.5M7.4 15.6l-1.5 1.5m9.2-9.2 1.5-1.5M7.4 8.4 5.9 6.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function TabLink({
  to,
  label,
  end,
  icon,
}: {
  to: string;
  label: string;
  end: boolean;
  icon: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 py-1.5 pt-1 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
          isActive ? "text-ink" : "text-muted hover:text-soft"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={`absolute inset-x-0.5 inset-y-0.5 rounded-[1.15rem] transition-colors ${
              isActive ? "bg-gold/80" : "bg-transparent"
            }`}
          />
          <span
            className={`relative flex h-10 w-10 items-center justify-center rounded-full ${
              isActive ? "bg-sun" : "bg-transparent"
            }`}
          >
            {icon}
            {isActive ? (
              <span className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-tomato" />
            ) : null}
          </span>
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe relative min-h-dvh">
      <Backdrop />
      <div className="relative z-10 pb-24">{children}</div>
      <nav
        aria-label="Primary"
        className="nav-max fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.875rem)]"
      >
        <div className="relative rounded-[1.6rem] border-2 border-ink bg-surface px-2 pb-1.5 pt-1.5 shadow-[5px_6px_0_0_var(--fo-ink)]">
          <span
            aria-hidden="true"
            className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 rounded-[3px] bg-tomato"
          />
          <div className="flex items-stretch">
            <TabLink to="/" label="Today" end icon={<SunIcon />} />
            <TabLink to="/history" label="History" end={false} icon={<ClockIcon />} />
            <NavLink
              to="/new"
              end
              aria-label="Add an order"
              className="relative flex min-w-0 flex-1 flex-col items-center justify-end pb-1.5"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`mb-0.5 mt-[-1.375rem] flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink transition-transform active:scale-95 ${
                      isActive
                        ? "bg-gold shadow-[3px_4px_0_0_var(--fo-ink)]"
                        : "bg-tomato shadow-[3px_4px_0_0_var(--fo-ink)]"
                    }`}
                  >
                    <span className={isActive ? "text-ink-fixed" : "text-ink-fixed"}>
                      <PlusIcon />
                    </span>
                  </span>
                  <span
                    className={`relative text-[11px] font-extrabold uppercase tracking-wide ${
                      isActive ? "text-ink" : "text-muted"
                    }`}
                  >
                    Add
                  </span>
                </>
              )}
            </NavLink>
            <TabLink to="/settings" label="Settings" end={false} icon={<GearIcon />} />
          </div>
        </div>
      </nav>
    </div>
  );
}