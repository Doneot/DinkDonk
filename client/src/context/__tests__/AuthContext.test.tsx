import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import api from "../../shared/api/client";
import { AuthProvider } from "../AuthContext";
import { useAuth } from "../authContextValue";

vi.mock("../../shared/api/client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApi = api as unknown as { get: Mock; post: Mock };

function Consumer() {
  const { user, loading, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.id : "none"}</span>
      <button onClick={() => void logout()}>Log out</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in a loading state and resolves the session user from GET /auth/user", async () => {
    mockedApi.get.mockResolvedValue({ data: { id: "u1" } });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("u1");
    expect(mockedApi.get).toHaveBeenCalledWith("/auth/user");
  });

  it("treats a failed session check as logged out rather than leaving state stuck loading", async () => {
    mockedApi.get.mockRejectedValue(new Error("no session"));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("clears the user and calls POST /auth/logout on logout()", async () => {
    mockedApi.get.mockResolvedValue({ data: { id: "u1" } });
    mockedApi.post.mockResolvedValue({ data: undefined });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("u1"));

    fireEvent.click(screen.getByText("Log out"));

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("none"));
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/logout");
  });
});
