import type { ReactNode } from "react";
import ChannelToggle from "./ChannelToggle";

interface ChannelCellProps {
  label: string;
  statusText: string;
  subCaption: string;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onToggle: (enabled: boolean) => void;
  children?: ReactNode;
}

// Deliberately styled as one more instrument-strip cell (matching
// StatusCard/BotUsersCard's label -> tally+value -> caption layout) rather
// than a separate settings list - a channel is exactly the same kind of
// system state as "bot online" or "watchers", it just happens to be a state
// you can flip yourself, hence the toggle riding next to the label instead
// of a whole distinct component style.
const ChannelCell = ({
  label,
  statusText,
  subCaption,
  checked,
  disabled,
  busy,
  onToggle,
  children,
}: ChannelCellProps) => {
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-mono text-[0.66rem] uppercase tracking-widest text-ink-faint">
          {label}
        </div>
        <ChannelToggle
          checked={checked}
          disabled={disabled || busy}
          label={`Toggle ${label}`}
          onChange={onToggle}
        />
      </div>

      <div className="flex items-center gap-2 font-mono text-2xl tabular-nums">
        <span className={`tally ${checked ? "is-on" : ""}`} />
        <span className={checked ? "text-online" : "text-ink-dim"}>
          {statusText}
        </span>
      </div>

      <div className="font-mono text-[0.7rem] text-ink-faint mt-1">
        {subCaption}
      </div>

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};

export default ChannelCell;
