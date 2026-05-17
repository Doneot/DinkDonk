import { useEffect, useRef, useState } from "react";
import api from "../services/api";

const StreamerSearch = ({ subscribedIds, setSubscribedIds, disabled }) => {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [searchCache, setSearchCache] = useState({});
  const [isFocused, setIsFocused] = useState(false);

  const wrapperRef = useRef(null);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search suggestions with debounce
  useEffect(() => {
    if (search.trim() === "") {
      setSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(() => {
      if (searchCache[search]) {
        setSuggestions(searchCache[search]);
        return;
      }

      api
        .get(`/streamers/search`, { params: { query: search } })
        .then((res) => {
          setSuggestions(res.data);
          setSearchCache((prev) => ({ ...prev, [search]: res.data }));
        })
        .catch(() => setSuggestions([]));
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, searchCache]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && suggestions[highlightIndex]) {
        const selected = suggestions[highlightIndex];
        setSearch(selected.name);
        setSuggestions([]);
        setHighlightIndex(-1);
      }
    }
  };

  const handleSubscribe = ({ streamer_id }) => {
    api
      .post("/streamers/subscribe", { streamer_id })
      .then(() => {
        setSubscribedIds((prev) => [...prev, streamer_id]);
      })
      .catch((err) => {
        console.error("Subscription failed", err);
      });
  };

  return (
    <div
      ref={wrapperRef}
      className="p-4 sm:p-6 bg-white rounded-xl shadow-lg mt-6 w-full max-w-full sm:max-w-xl mx-auto relative"
    >
      <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700">
        Search Streamers
      </h2>

      {/* Search Input */}
      <input
        className={`border border-gray-300 rounded-lg p-3 w-full focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 text-black ${
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

      {/* Dropdown suggestions */}
      {isFocused && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 mt-2 bg-white border rounded-lg shadow-md max-h-60 overflow-y-auto w-full max-w-full">
          {suggestions.map((s, index) => {
            const isSubscribed = subscribedIds.includes(s.streamer_id);

            return (
              <li
                key={s.streamer_id}
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 cursor-pointer transition ${
                  highlightIndex === index
                    ? "bg-indigo-100"
                    : "hover:bg-gray-100"
                }`}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                {/* Streamer info */}
                <div
                  className="flex items-center gap-3 w-full sm:w-auto"
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

                {/* Subscribe/Status */}
                {isSubscribed ? (
                  <span className="text-sm text-green-600 font-medium">
                    Subscribed
                  </span>
                ) : (
                  <button
                    className="text-sm bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-400 cursor-pointer transition w-full sm:w-auto"
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
