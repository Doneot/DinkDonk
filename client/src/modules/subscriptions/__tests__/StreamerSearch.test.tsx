import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import StreamerSearch from "../components/StreamerSearch";
import type { StreamerSummary } from "../../../shared/types/api";

interface PendingRequest {
  query: string;
  resolve: (value: StreamerSummary[]) => void;
  reject: (reason?: unknown) => void;
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
      pending.push({ query, resolve, reject });
    });
  }),
}));

describe("StreamerSearch", () => {
  beforeEach(() => {
    pending.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not let an older, slower response overwrite a newer one", async () => {
    render(<StreamerSearch subscribedIds={[]} onSubscribe={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search Twitch streamers...");

    // First keystroke burst - debounce fires, request for "a" goes out.
    fireEvent.change(input, { target: { value: "a" } });
    await vi.advanceTimersByTimeAsync(300);

    // User keeps typing before "a" resolves - this aborts the "a" request
    // (effect cleanup) and starts a new debounce window for "ab".
    fireEvent.change(input, { target: { value: "ab" } });
    await vi.advanceTimersByTimeAsync(300);

    expect(pending).toHaveLength(2);
    expect(pending[0].query).toBe("a");
    expect(pending[1].query).toBe("ab");

    vi.useRealTimers();

    // Newer request resolves first, as it would on a real slow network.
    pending[1].resolve([{ id: "2", name: "ab-streamer", avatar: "" }]);
    expect(await screen.findByText("ab-streamer")).toBeInTheDocument();

    // Stale response for "a" finally arrives - it must not clobber the
    // already-rendered, newer suggestions.
    pending[0].resolve([{ id: "1", name: "a-streamer", avatar: "" }]);
    await waitFor(() => {
      expect(screen.getByText("ab-streamer")).toBeInTheDocument();
    });
    expect(screen.queryByText("a-streamer")).not.toBeInTheDocument();
  });

  it("does not reopen the dropdown after selecting a suggestion by keyboard", async () => {
    const onSubscribe = vi.fn();
    render(<StreamerSearch subscribedIds={[]} onSubscribe={onSubscribe} />);
    const input = screen.getByPlaceholderText("Search Twitch streamers...");

    fireEvent.change(input, { target: { value: "al" } });
    await vi.advanceTimersByTimeAsync(300);

    expect(pending).toHaveLength(1);
    pending[0].resolve([{ id: "1", name: "alpha", avatar: "" }]);
    vi.useRealTimers();
    expect(await screen.findByText("alpha")).toBeInTheDocument();
    vi.useFakeTimers();

    // Highlight and select the only suggestion via keyboard.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByText("alpha")).not.toBeInTheDocument();

    // If the debounce effect were to fire again for the now-accepted query
    // text ("alpha"), the dropdown would silently reopen ~300ms later.
    await vi.advanceTimersByTimeAsync(300);

    expect(pending).toHaveLength(1);
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
  });
});
