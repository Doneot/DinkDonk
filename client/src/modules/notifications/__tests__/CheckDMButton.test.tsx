import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import CheckDMButton from "../components/CheckDMButton";
import { notifyActionError as notifyActionErrorImport } from "../../../shared/api/errorToast";

vi.mock("../../../shared/api/errorToast", () => ({
  notifyActionError: vi.fn(),
}));

const notifyActionError = vi.mocked(notifyActionErrorImport);

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("CheckDMButton", () => {
  it("shows the can-DM result then reverts to idle after a delay", async () => {
    vi.useFakeTimers();
    const checkDMFunction = vi.fn().mockResolvedValue(true);

    render(<CheckDMButton checkDMFunction={checkDMFunction} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(screen.getByText("✓ DinkDonk can DM you")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(
      screen.getByText("Not receiving notifications?"),
    ).toBeInTheDocument();
  });

  it("shows the cannot-DM result for a false response", async () => {
    const checkDMFunction = vi.fn().mockResolvedValue(false);

    render(<CheckDMButton checkDMFunction={checkDMFunction} />);
    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("✗ Can't DM you yet")).toBeInTheDocument();
  });

  it("reverts to idle and surfaces an error toast when the check fails", async () => {
    const checkDMFunction = vi.fn().mockRejectedValue(new Error("boom"));

    render(<CheckDMButton checkDMFunction={checkDMFunction} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(notifyActionError).toHaveBeenCalledWith(
        expect.any(Error),
        "Failed to check DM ability.",
      );
    });
    expect(
      screen.getByText("Not receiving notifications?"),
    ).toBeInTheDocument();
  });

  it("disables the button while the check is in flight", async () => {
    let resolveCheck: (value: boolean) => void = () => {};
    const checkDMFunction = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCheck = resolve;
        }),
    );

    render(<CheckDMButton checkDMFunction={checkDMFunction} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();

    await act(async () => {
      resolveCheck(true);
    });

    expect(screen.getByRole("button")).not.toBeDisabled();
  });
});
