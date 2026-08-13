import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import api from "../../../shared/api/client";
import { fetchStatus, fetchUserCount } from "../api";
import StatusCard from "../components/StatusCard";
import BotUsersCard from "../components/BotUsersCard";

vi.mock("../../../shared/api/client", () => ({
  default: { get: vi.fn() },
}));

const mockedApi = api as unknown as { get: Mock };

describe("dashboard/api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchStatus resolves the online flag from GET /status", async () => {
    mockedApi.get.mockResolvedValue({ data: { online: true } });

    await expect(fetchStatus()).resolves.toBe(true);
    expect(mockedApi.get).toHaveBeenCalledWith("/status");
  });

  it("fetchUserCount resolves the count from GET /user-count", async () => {
    mockedApi.get.mockResolvedValue({ data: { count: 42 } });

    await expect(fetchUserCount()).resolves.toBe(42);
    expect(mockedApi.get).toHaveBeenCalledWith("/user-count");
  });
});

describe("StatusCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Online once the bot status resolves true", async () => {
    mockedApi.get.mockResolvedValue({ data: { online: true } });

    render(<StatusCard />);

    expect(await screen.findByText("Online")).toBeInTheDocument();
  });

  it("shows Offline when the bot status resolves false", async () => {
    mockedApi.get.mockResolvedValue({ data: { online: false } });

    render(<StatusCard />);

    expect(await screen.findByText("Offline")).toBeInTheDocument();
  });

  it("shows Unknown rather than getting stuck loading when the status request fails", async () => {
    mockedApi.get.mockRejectedValue(new Error("network down"));

    render(<StatusCard />);

    expect(await screen.findByText("Unknown")).toBeInTheDocument();
  });
});

describe("BotUsersCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the resolved user count", async () => {
    mockedApi.get.mockResolvedValue({ data: { count: 7 } });

    render(<BotUsersCard />);

    expect(await screen.findByText("7")).toBeInTheDocument();
  });

  it("falls back to a dash rather than getting stuck loading when the request fails", async () => {
    mockedApi.get.mockRejectedValue(new Error("network down"));

    render(<BotUsersCard />);

    expect(await screen.findByText("—")).toBeInTheDocument();
  });
});
