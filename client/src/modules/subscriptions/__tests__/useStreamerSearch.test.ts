import { renderHook, act } from "@testing-library/react";
import axios from "axios";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { StreamerSummary } from "../../../shared/types/api";
import { useStreamerSearch } from "../hooks/useStreamerSearch";

interface PendingRequest {
  query: string;
  resolve: (value: StreamerSummary[]) => void;
}

const { pending } = vi.hoisted(() => ({ pending: [] as PendingRequest[] }));

vi.mock("../api", () => ({
  searchStreamers: vi.fn((query: string, signal?: AbortSignal) => {
    return new Promise<StreamerSummary[]>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new axios.CanceledError("canceled"));
        return;
      }
      signal?.addEventListener?.("abort", () => {
        reject(new axios.CanceledError("canceled"));
      });
      pending.push({ query, resolve });
    });
  }),
}));

// Direct hook-level coverage of the debounce/abort/dismiss logic - separate
// from StreamerSearch.test.tsx's component-level race test, which exercises
// the same hook only indirectly through one consumer.
describe("useStreamerSearch", () => {
  beforeEach(() => {
    pending.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not search for a blank query", async () => {
    const { result } = renderHook(() => useStreamerSearch("   "));

    await vi.advanceTimersByTimeAsync(300);

    expect(pending).toHaveLength(0);
    expect(result.current.suggestions).toEqual([]);
  });

  it("waits out the full debounce window before searching", async () => {
    renderHook(() => useStreamerSearch("al"));

    await vi.advanceTimersByTimeAsync(299);
    expect(pending).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(pending).toHaveLength(1);
    expect(pending[0].query).toBe("al");
  });

  it("aborts the in-flight request when the query changes before it resolves", async () => {
    const { rerender } = renderHook(({ query }) => useStreamerSearch(query), {
      initialProps: { query: "a" },
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(pending).toHaveLength(1);

    rerender({ query: "ab" });
    await vi.advanceTimersByTimeAsync(300);

    expect(pending).toHaveLength(2);
    expect(pending[1].query).toBe("ab");
  });

  it("populates suggestions once the debounced search resolves", async () => {
    const { result } = renderHook(() => useStreamerSearch("alpha"));
    await vi.advanceTimersByTimeAsync(300);
    expect(pending).toHaveLength(1);

    await act(async () => {
      pending[0].resolve([{ id: "1", name: "alpha-streamer", avatar: "" }]);
    });

    expect(result.current.suggestions).toEqual([
      { id: "1", name: "alpha-streamer", avatar: "" },
    ]);
  });

  it("dismiss() clears suggestions immediately and suppresses a re-search for the accepted query", async () => {
    const { result, rerender } = renderHook(({ query }) => useStreamerSearch(query), {
      initialProps: { query: "alph" },
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(pending).toHaveLength(1);

    await act(async () => {
      pending[0].resolve([{ id: "1", name: "alpha", avatar: "" }]);
    });
    expect(result.current.suggestions).toHaveLength(1);

    // Selecting the suggestion: the caller sets the input text to the full
    // matched name ("alph" -> "alpha", a real dependency change) and calls
    // dismiss() with that same text.
    act(() => {
      result.current.dismiss("alpha");
    });
    expect(result.current.suggestions).toEqual([]);

    rerender({ query: "alpha" });
    await vi.advanceTimersByTimeAsync(300);

    // Without the dismissedQueryRef guard, this rerender's query change
    // would fire a second, redundant search and silently reopen the
    // dropdown for the streamer the user just picked.
    expect(pending).toHaveLength(1);
    expect(result.current.suggestions).toEqual([]);
  });
});
