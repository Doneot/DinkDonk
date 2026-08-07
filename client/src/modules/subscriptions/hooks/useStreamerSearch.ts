import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { searchStreamers } from "../api";
import type { StreamerSummary } from "../../../shared/types/api";

// Debounced, race-condition-guarded streamer search. `suggestions` is a
// value derived from `query`, but selecting/subscribing needs to clear the
// dropdown *immediately* rather than wait for the derivation to catch up -
// dismiss(nextQuery) does that, and also suppresses the debounce effect
// from re-searching for the exact text that was just accepted (otherwise,
// since the caller typically sets the search text to the selected
// streamer's full name right before calling dismiss, the effect would see
// that as a fresh, changed query and silently reopen the dropdown ~300ms
// later with the same streamer as a suggestion again).
export function useStreamerSearch(query: string) {
  const [suggestions, setSuggestions] = useState<StreamerSummary[]>([]);
  const dismissedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!query.trim() || query === dismissedQueryRef.current) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      searchStreamers(query, controller.signal)
        .then(setSuggestions)
        .catch((err: unknown) => {
          if (axios.isCancel(err)) return;
          setSuggestions([]);
        });
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function dismiss(nextQuery: string) {
    dismissedQueryRef.current = nextQuery;
    setSuggestions([]);
  }

  return { suggestions, dismiss };
}
