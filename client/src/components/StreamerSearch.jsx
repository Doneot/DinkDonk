import { useEffect, useRef, useState } from "react";
import api from "../services/api";

const StreamerSearch = ({ subscribedIds, onSubscribe, disabled }) => {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  const wrapperRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search (no cache needed)
  useEffect(() => {
    if (!search.trim()) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(() => {
      api
        .get("/streamers/search", {
          params: { query: search },
        })
        .then((res) => {
          setSuggestions(res.data);
        })
        .catch(() => {
          setSuggestions([]);
        });
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
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
        setSuggestions([]);
        setHighlightIndex(-1);
      }
    }
  };

  const handleSubscribe = (streamer) => {
    onSubscribe(streamer);
    setSearch("");
    setSuggestions([]);
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
                className={`flex items-center justify-between gap-3 p-3 cursor-pointer transition ${
                  highlightIndex === index
                    ? "bg-indigo-100"
                    : "hover:bg-gray-100"
                }`}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                {/* Streamer info */}
                <div
                  className="flex items-center gap-3"
                  onClick={() => {
                    setSearch(s.name);
                    setSuggestions([]);
                    setHighlightIndex(-1);
                  }}
                >
                  <img
                    src={s.avatar}
                    alt={s.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-gray-700 truncate">{s.name}</span>
                </div>

                {/* Action */}
                {isSubscribed ? (
                  <span className="text-sm text-green-600 font-medium">
                    Subscribed
                  </span>
                ) : (
                  <button
                    className="text-sm bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-400 transition cursor-pointer"
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
