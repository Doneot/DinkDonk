import { useRef, useState, type KeyboardEvent } from "react";
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
      className="p-4 sm:p-6 bg-white rounded-xl shadow-lg mt-6 w-full max-w-full sm:max-w-xl mx-auto relative"
    >
      <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700">
        Search Streamers
      </h2>

      {/* Input */}
      <input
        className={`border border-gray-300 rounded-lg p-3 w-full focus:ring-indigo-500 focus:border-indigo-500 transition text-black ${
          disabled ? "bg-gray-200 cursor-not-allowed text-gray-500" : "bg-white"
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
      {isFocused && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 mt-2 bg-white border rounded-lg shadow-md max-h-60 overflow-y-auto w-full">
          {suggestions.map((s, index) => {
            const isSubscribed = subscribedIds.includes(s.id);

            return (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-3 transition ${
                  highlightIndex === index ? "bg-indigo-100" : "hover:bg-gray-100"
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
                  <span className="text-gray-700 truncate">{s.name}</span>
                </button>

                {/* Action */}
                {isSubscribed ? (
                  <span className="text-sm text-green-600 font-medium pr-3">
                    Subscribed
                  </span>
                ) : (
                  <button
                    className="text-sm bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-400 transition cursor-pointer mr-3"
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
