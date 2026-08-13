import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect } from "vitest";

import { AuthContext, type AuthContextValue } from "../../../context/authContextValue";
import ProtectedRoute from "../components/ProtectedRoute";
import RedirectIfAuthenticated from "../components/RedirectIfAuthenticated";

const defaultAuthValue: AuthContextValue = {
  user: null,
  setUser: () => {},
  loading: false,
  logout: async () => {},
};

function renderProtected(
  authValue: Partial<AuthContextValue>,
  initialPath = "/dashboard",
) {
  return render(
    <AuthContext.Provider value={{ ...defaultAuthValue, ...authValue }}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<div>Home page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function renderRedirectIfAuthenticated(authValue: Partial<AuthContextValue>) {
  return render(
    <AuthContext.Provider value={{ ...defaultAuthValue, ...authValue }}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <RedirectIfAuthenticated>
                <div>Login page</div>
              </RedirectIfAuthenticated>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("shows a loading state while auth is resolving", () => {
    renderProtected({ user: null, loading: true });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("redirects to home when there is no authenticated user", () => {
    renderProtected({ user: null, loading: false });
    expect(screen.getByText("Home page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
  });

  it("renders the protected content for an authenticated user", () => {
    renderProtected({ user: { id: "u1" }, loading: false });
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });
});

describe("RedirectIfAuthenticated", () => {
  it("renders children while there is no authenticated user", () => {
    renderRedirectIfAuthenticated({ user: null, loading: false });
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("redirects an already-authenticated user to the dashboard", async () => {
    renderRedirectIfAuthenticated({ user: { id: "u1" }, loading: false });
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });
});
