import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";
import { useStreamerSearch } from "../hooks/useStreamerSearch";
import type { StreamerSummary } from "../../../shared/types/api";

interface StreamerSearchProps {
  subscribedIds: string[];
  onSubscribe: (streamer: StreamerSummary) => void;
  disabled?: boolean;
}

const StreamerSearch = ({ subscribedIds, onSubscribe, disabled }: StreamerSearchProps) => {
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const { suggestions, dismiss } = useStreamerSearch(search);

  // WAI-ARIA APG combobox pattern: the listbox and each option need stable
  // ids so the input's aria-controls/aria-activedescendant can reference
  // them - useId() rather than s.id directly so the DOM id stays valid even
  // if a streamer id ever contains characters that aren't legal there.
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const isOpen = isFocused && suggestions.length > 0;

  // Close dropdown on outside click
  useClickOutside(wrapperRef, () => setIsFocused(false));

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      );
    }

    if (e.key === "Enter") {
      e.preventDefault();

      const selected = suggestions[highlightIndex];
      if (selected) {
        setSearch(selected.name);
        dismiss(selected.name);
        setHighlightIndex(-1);
      }
    }
  };

  const handleSubscribe = (streamer: StreamerSummary) => {
    onSubscribe(streamer);
    setSearch("");
    dismiss("");
    setHighlightIndex(-1);
  };

  return (
    <div
      ref={wrapperRef}
      className="p-4 sm:p-6 bg-panel rounded-lg border border-seam-soft mt-6 w-full relative"
    >
      <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-faint mb-3">
        Search streamers
      </h2>

      {/* Input */}
      <input
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          isOpen && highlightIndex >= 0 ? optionId(highlightIndex) : undefined
        }
        autoComplete="off"
        className={`border rounded-md p-3 w-full focus:outline-none focus:ring-2 focus:ring-accent transition text-ink placeholder:text-ink-faint ${
          disabled
            ? "bg-panel-2 border-seam-soft cursor-not-allowed text-ink-faint"
            : "bg-tile border-seam"
        }`}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setHighlightIndex(-1);
          setIsFocused(true);
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search Twitch streamers..."
        disabled={disabled}
      />

      {/* Suggestions */}
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 mt-2 bg-panel-2 border border-seam rounded-md shadow-lg max-h-60 overflow-y-auto w-full"
        >
          {suggestions.map((s, index) => {
            const isSubscribed = subscribedIds.includes(s.id);

            return (
              <li
                key={s.id}
                id={optionId(index)}
                role="option"
                aria-selected={highlightIndex === index}
                className={`flex items-center justify-between gap-3 transition border-t border-seam-soft first:border-t-0 ${
                  highlightIndex === index ? "bg-accent/10" : "hover:bg-tile"
                }`}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                {/* Streamer info */}
                <button
                  type="button"
                  onClick={() => {
                    setSearch(s.name);
                    dismiss(s.name);
                    setHighlightIndex(-1);
                  }}
                  className="flex items-center gap-3 p-3 flex-1 min-w-0 text-left cursor-pointer"
                >
                  <img
                    src={s.avatar}
                    alt=""
                    loading="lazy"
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-ink truncate">{s.name}</span>
                </button>

                {/* Action */}
                {isSubscribed ? (
                  <span className="font-mono text-[0.68rem] uppercase tracking-wider text-online pr-3">
                    Subscribed
                  </span>
                ) : (
                  <button
                    className="font-mono text-[0.68rem] uppercase tracking-wider bg-accent/10 text-accent px-3 py-1 rounded-full hover:bg-accent/20 transition cursor-pointer mr-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSubscribe(s);
                    }}
                    disabled={disabled}
                  >
                    Subscribe
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default StreamerSearch;
