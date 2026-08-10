interface ChannelToggleProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
}

const ChannelToggle = ({
  checked,
  disabled,
  label,
  onChange,
}: ChannelToggleProps) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? "bg-accent" : "bg-seam"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
};

export default ChannelToggle;
