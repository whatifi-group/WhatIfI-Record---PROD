/**
 * Confirm the Mark as Leaver dialog validates and submits correctly.
 *
 * Tests cover:
 * - Confirm button is disabled when no reason is selected (client-side guard)
 * - Confirm button is enabled once a reason is chosen
 * - Inactive LOV reasons are filtered out of the dropdown
 * - Submitting passes the correct payload (status=leaver, leaverReason, leaverDate)
 * - onSuccess callback is invoked and toast is shown on a successful mutation
 * - onError callback shows a destructive toast on failure
 * - Both buttons are disabled while the mutation is pending
 * - Cancel calls onClose
 * - Blank leaving date shows an inline error and disables Confirm
 * - Any future leaving date shows an error and disables Confirm
 *
 * Note: Radix Select renders to a portal that JSDOM cannot trigger via pointer
 * events, so `@/components/ui/select` is replaced with native <select> elements
 * for this test file only.  The behaviour under test (disabled state, payload,
 * callbacks) is in the dialog's own logic, not in the Select widget itself.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Replace Radix Select with native <select> so JSDOM can interact with it ──
vi.mock("@/components/ui/select", () => ({
  Select: ({
    onValueChange,
    value,
    children,
  }: {
    onValueChange: (v: string) => void;
    value: string;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="reason-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="" disabled>
      {placeholder ?? ""}
    </option>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

// ── Mock API hooks ─────────────────────────────────────────────────────────────
vi.mock("@workspace/api-client-react", () => ({
  useUpdateEmployee: vi.fn(),
  useListLovItems: vi.fn(),
  getGetEmployeeQueryKey: vi.fn(() => ["employee", 42]),
  getListEmployeesQueryKey: vi.fn(() => ["employees"]),
  EmployeeStatus: { leaver: "leaver", active: "active" },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { useUpdateEmployee, useListLovItems } from "@workspace/api-client-react";
import MarkAsLeaverDialog from "@/pages/MarkAsLeaverDialog";

const mockToast = vi.fn();

const MOCK_REASONS = [
  { id: 1, value: "resignation", label: "Resignation", isActive: true },
  { id: 2, value: "redundancy", label: "Redundancy", isActive: true },
  { id: 3, value: "old_reason", label: "Old Reason", isActive: false },
];

const MOCK_UPDATED_EMPLOYEE = {
  id: 42,
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  status: "leaver",
  leaverReason: "resignation",
  leaverDate: "2026-07-15",
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog(opts: {
  isPending?: boolean;
  mutateFn?: ReturnType<typeof vi.fn>;
} = {}) {
  const mutateFn = opts.mutateFn ?? vi.fn();

  vi.mocked(useUpdateEmployee).mockReturnValue({
    mutate: mutateFn,
    isPending: opts.isPending ?? false,
  } as unknown as ReturnType<typeof useUpdateEmployee>);

  vi.mocked(useListLovItems).mockReturnValue({
    data: MOCK_REASONS,
    isLoading: false,
  } as ReturnType<typeof useListLovItems>);

  const onClose = vi.fn();
  const onSuccess = vi.fn();

  render(
    <MarkAsLeaverDialog
      open={true}
      onClose={onClose}
      employeeId={42}
      employeeName="Jane Smith"
      onSuccess={onSuccess}
    />,
    { wrapper: Wrapper },
  );

  return { mutateFn, onClose, onSuccess };
}

/** Returns an ISO date string offset by `days` from today (local time). */
function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Validation ────────────────────────────────────────────────────────────────
describe("MarkAsLeaverDialog — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Confirm button is disabled when no reason has been selected", () => {
    renderDialog();
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).toBeDisabled();
  });

  it("Confirm button is enabled after a reason is selected (date defaults to today)", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).not.toBeDisabled();
  });

  it("only active reasons are rendered as options", () => {
    renderDialog();
    const select = screen.getByTestId("reason-select");
    expect(select).toContainElement(
      screen.getByRole("option", { name: /resignation/i }),
    );
    expect(select).toContainElement(
      screen.getByRole("option", { name: /redundancy/i }),
    );
    expect(
      screen.queryByRole("option", { name: /old reason/i }),
    ).not.toBeInTheDocument();
  });

  it("Confirm button is disabled when the leaving date is cleared", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).toBeDisabled();
  });

  it("shows a required-field error immediately when the date is blank", async () => {
    renderDialog();
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/leaving date is required/i);
    });
  });

  it("shows an error when the leaving date is 1 day in the future", async () => {
    renderDialog();
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, offsetDate(1));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/cannot be in the future/i);
    });
  });

  it("Confirm button is disabled when the leaving date is 1 day in the future", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, offsetDate(1));
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).toBeDisabled();
  });

  it("Confirm button is disabled when the leaving date is 30 days in the future", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, offsetDate(30));
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).toBeDisabled();
  });

  it("Confirm button is enabled when the date is today", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    // Date defaults to today — button should be enabled already
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).not.toBeDisabled();
  });

  it("Confirm button is enabled when the date is in the past", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, offsetDate(-7));
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).not.toBeDisabled();
  });
});

// ── Submission ────────────────────────────────────────────────────────────────
describe("MarkAsLeaverDialog — submission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls updateEmployee.mutate with correct payload on submit", async () => {
    const { mutateFn } = renderDialog();

    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    await userEvent.click(screen.getByRole("button", { name: /confirm leaver/i }));

    expect(mutateFn).toHaveBeenCalledOnce();
    const [payload] = mutateFn.mock.calls[0];
    expect(payload.id).toBe(42);
    expect(payload.data.status).toBe("leaver");
    expect(payload.data.leaverReason).toBe("resignation");
    expect(payload.data.leaverDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the user-supplied leaverDate when changed to a past date", async () => {
    const { mutateFn } = renderDialog();

    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "redundancy",
    );
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    const pastDate = offsetDate(-14);
    await userEvent.type(dateInput, pastDate);

    await userEvent.click(screen.getByRole("button", { name: /confirm leaver/i }));

    const [payload] = mutateFn.mock.calls[0];
    expect(payload.data.leaverDate).toBe(pastDate);
  });

  it("does not call mutate when leaving date is blank", async () => {
    const { mutateFn } = renderDialog();

    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);

    expect(screen.getByRole("button", { name: /confirm leaver/i })).toBeDisabled();
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it("does not call mutate when leaving date is in the future", async () => {
    const { mutateFn } = renderDialog();

    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    const dateInput = screen.getByLabelText(/leaving date/i);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, offsetDate(5));

    expect(screen.getByRole("button", { name: /confirm leaver/i })).toBeDisabled();
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it("invokes onSuccess and shows a success toast after the mutation resolves", async () => {
    const mutateFn = vi
      .fn()
      .mockImplementation((_args: unknown, { onSuccess }: { onSuccess: (v: unknown) => void }) => {
        onSuccess(MOCK_UPDATED_EMPLOYEE);
      });
    const { onSuccess } = renderDialog({ mutateFn });

    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    await userEvent.click(screen.getByRole("button", { name: /confirm leaver/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(MOCK_UPDATED_EMPLOYEE);
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/leaver/i) }),
    );
  });

  it("shows a destructive toast when the mutation fails", async () => {
    const mutateFn = vi
      .fn()
      .mockImplementation((_args: unknown, { onError }: { onError: (e: Error) => void }) => {
        onError(new Error("Network error"));
      });
    renderDialog({ mutateFn });

    await userEvent.selectOptions(
      screen.getByTestId("reason-select"),
      "resignation",
    );
    await userEvent.click(screen.getByRole("button", { name: /confirm leaver/i }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });
});

// ── Pending state ─────────────────────────────────────────────────────────────
describe("MarkAsLeaverDialog — pending state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables Cancel and Confirm while the mutation is in flight", () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /confirm leaver/i }),
    ).toBeDisabled();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────────────
describe("MarkAsLeaverDialog — cancel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Cancel button calls onClose", async () => {
    const { onClose } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("mutate is NOT called when the dialog is cancelled", async () => {
    const { mutateFn, onClose } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mutateFn).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
