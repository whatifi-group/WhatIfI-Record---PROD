import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CopyPayRatesDialog from "@/pages/employee-tabs/CopyPayRatesDialog";

vi.mock("@workspace/api-client-react", () => ({
  useListEmployees: vi.fn(),
  useListEmployeePayRates: vi.fn(),
  useCopyEmployeePayRates: vi.fn(),
  getListEmployeesQueryKey: vi.fn(() => ["employees"]),
  getListEmployeePayRatesQueryKey: vi.fn((id: number) => ["payRates", id]),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import {
  useListEmployees,
  useListEmployeePayRates,
  useCopyEmployeePayRates,
} from "@workspace/api-client-react";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TARGET_ID = 99;

const mockEmployee = {
  id: 1,
  firstName: "Alice",
  lastName: "Smith",
  jobTitle: "Developer",
  email: "alice@example.com",
  status: "active",
};

function makeRate(overrides: Partial<{
  id: number; employeeId: number; shiftType: string; rate: string; rateUnit: string;
}> = {}) {
  return {
    id: 10,
    employeeId: 1,
    shiftType: "standard",
    rate: "15.00",
    rateUnit: "hourly",
    notes: null,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let queryClient: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * Set up mocks so the dialog opens, a search returns `mockEmployee`, and
 * the source employee has `sourceRates`. The target employee starts with
 * `targetRates` (default: none).
 */
function setupMocks(sourceRates: ReturnType<typeof makeRate>[], targetRates: ReturnType<typeof makeRate>[] = []) {
  vi.mocked(useListEmployees).mockReturnValue({ data: [mockEmployee], isLoading: false } as any);

  vi.mocked(useListEmployeePayRates).mockImplementation((id: number) => {
    // Source employee (id 1) or target employee (TARGET_ID 99)
    const data = id === mockEmployee.id ? sourceRates : targetRates;
    return { data, isLoading: false } as any;
  });
}

/**
 * Simulate navigating from Step 1 (search) → Step 2 (preview).
 * Returns the `userEvent` instance for further interactions.
 */
async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/search by name/i), "Alice");
  const empButton = await screen.findByRole("button", { name: /alice smith/i });
  await user.click(empButton);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CopyPayRatesDialog — control locking", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("disables overwrite switch and date input while copy mutation is pending", async () => {
    const user = userEvent.setup();
    setupMocks([makeRate()]);

    vi.mocked(useCopyEmployeePayRates).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as any);

    render(
      <CopyPayRatesDialog open={true} onClose={vi.fn()} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );

    await navigateToStep2(user);

    // Both controls must be disabled while a copy is in flight
    expect(screen.getByRole("switch", { name: /overwrite existing rates/i })).toBeDisabled();
    expect(screen.getByLabelText(/effective from/i)).toBeDisabled();
  });

  it("enables overwrite switch and date input when no copy is in flight", async () => {
    const user = userEvent.setup();
    setupMocks([makeRate()]);

    vi.mocked(useCopyEmployeePayRates).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(
      <CopyPayRatesDialog open={true} onClose={vi.fn()} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );

    await navigateToStep2(user);

    expect(screen.getByRole("switch", { name: /overwrite existing rates/i })).not.toBeDisabled();
    expect(screen.getByLabelText(/effective from/i)).not.toBeDisabled();
  });
});

describe("CopyPayRatesDialog — result counts", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it('renders "1 updated" (not "1 inserted") when the API reports 1 updated rate', async () => {
    const user = userEvent.setup();
    setupMocks([makeRate()]);

    const updatedRate = makeRate();
    vi.mocked(useCopyEmployeePayRates).mockReturnValue({
      mutate: vi.fn().mockImplementation((_args, { onSuccess }: any) => {
        onSuccess({ copied: [updatedRate], updated: [updatedRate], skipped: [] });
      }),
      isPending: false,
    } as any);

    render(
      <CopyPayRatesDialog open={true} onClose={vi.fn()} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );

    await navigateToStep2(user);
    await user.click(screen.getByRole("button", { name: /copy rates/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 updated/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/1 inserted/i)).not.toBeInTheDocument();
  });

  it("shows all three counts for a mixed result (1 inserted, 1 updated, 1 skipped)", async () => {
    const user = userEvent.setup();
    const rate1 = makeRate({ id: 10, shiftType: "standard" });
    const rate2 = makeRate({ id: 11, shiftType: "night" });
    setupMocks([rate1, rate2]);

    vi.mocked(useCopyEmployeePayRates).mockReturnValue({
      mutate: vi.fn().mockImplementation((_args, { onSuccess }: any) => {
        // copied has 2 entries, updated has 1 → insertedCount = 2 - 1 = 1
        onSuccess({
          copied: [rate1, rate2],
          updated: [rate2],
          skipped: [{ shiftType: "weekend", reason: "conflict" }],
        });
      }),
      isPending: false,
    } as any);

    render(
      <CopyPayRatesDialog open={true} onClose={vi.fn()} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );

    await navigateToStep2(user);
    await user.click(screen.getByRole("button", { name: /copy rates/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 inserted/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/1 updated/i)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/i)).toBeInTheDocument();
  });
});

describe("CopyPayRatesDialog — state reset on close/reopen", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("resets to defaults (search cleared, overwrite=false) when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    setupMocks([makeRate()]);

    vi.mocked(useCopyEmployeePayRates).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    const onClose = vi.fn();
    const { rerender } = render(
      <CopyPayRatesDialog open={true} onClose={onClose} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );

    // Navigate to Step 2 and turn on overwrite
    await navigateToStep2(user);
    const toggle = screen.getByRole("switch", { name: /overwrite existing rates/i });
    await user.click(toggle);
    expect(toggle).toBeChecked();

    // Close the dialog via Cancel
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();

    // Reopen the dialog
    rerender(
      <CopyPayRatesDialog open={true} onClose={onClose} targetEmployeeId={TARGET_ID} />,
    );

    // Should be back to Step 1 (search box visible, overwrite switch gone)
    expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /overwrite existing rates/i })).not.toBeInTheDocument();
  });
});

describe("CopyPayRatesDialog — per-row conflict badges", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it('shows "Will insert" for a rate that does not conflict with any target rate', async () => {
    const user = userEvent.setup();
    // Source has "standard", target has "night" → no conflict
    setupMocks([makeRate({ shiftType: "standard" })], [makeRate({ id: 20, employeeId: TARGET_ID, shiftType: "night" })]);
    vi.mocked(useCopyEmployeePayRates).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);

    render(
      <CopyPayRatesDialog open={true} onClose={vi.fn()} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );
    await navigateToStep2(user);

    expect(screen.getByText("Will insert")).toBeInTheDocument();
    expect(screen.queryByText("Will update")).not.toBeInTheDocument();
    expect(screen.queryByText("Will skip")).not.toBeInTheDocument();
  });

  it('shows "Will skip" for a conflicting rate when overwrite is off', async () => {
    const user = userEvent.setup();
    // Both source and target have "standard" → conflict; overwrite defaults to off
    setupMocks(
      [makeRate({ shiftType: "standard" })],
      [makeRate({ id: 20, employeeId: TARGET_ID, shiftType: "standard" })],
    );
    vi.mocked(useCopyEmployeePayRates).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);

    render(
      <CopyPayRatesDialog open={true} onClose={vi.fn()} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );
    await navigateToStep2(user);

    expect(screen.getByText("Will skip")).toBeInTheDocument();
    expect(screen.queryByText("Will insert")).not.toBeInTheDocument();
    expect(screen.queryByText("Will update")).not.toBeInTheDocument();
  });

  it('shows "Will update" for a conflicting rate when overwrite is on', async () => {
    const user = userEvent.setup();
    // Both source and target have "standard" → conflict
    setupMocks(
      [makeRate({ shiftType: "standard" })],
      [makeRate({ id: 20, employeeId: TARGET_ID, shiftType: "standard" })],
    );
    vi.mocked(useCopyEmployeePayRates).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);

    render(
      <CopyPayRatesDialog open={true} onClose={vi.fn()} targetEmployeeId={TARGET_ID} />,
      { wrapper: Wrapper },
    );
    await navigateToStep2(user);

    // Turn on overwrite
    await user.click(screen.getByRole("switch", { name: /overwrite existing rates/i }));

    expect(screen.getByText("Will update")).toBeInTheDocument();
    expect(screen.queryByText("Will skip")).not.toBeInTheDocument();
    expect(screen.queryByText("Will insert")).not.toBeInTheDocument();
  });
});
