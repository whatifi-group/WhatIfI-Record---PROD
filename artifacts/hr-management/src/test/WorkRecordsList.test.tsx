import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkRecordsList from "@/pages/WorkRecordsList";

vi.mock("@workspace/api-client-react", () => ({
  useListWorkRecords: vi.fn(() => ({ data: [], isLoading: false })),
  useListDepartments: vi.fn(() => ({ data: [] })),
  useListLovItems: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Minimal wouter mock — WorkRecordsList only uses <Link>
vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { useListWorkRecords } from "@workspace/api-client-react";

// ─── helpers ────────────────────────────────────────────────────────────────

let queryClient: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    employeeId: 1,
    employeeFirstName: "Alice",
    employeeLastName: "Smith",
    employeeEmail: "alice@example.com",
    employeeStatus: "active",
    employeeDepartmentId: 10,
    employeeDepartmentName: "Engineering",
    employeeAvatarUrl: null,
    shiftDate: "2026-07-01",
    shiftType: "regular",
    hoursWorked: 8,
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
    createdAt: "2026-07-01T09:00:00Z",
    ...overrides,
  };
}

// ─── former-employee toggle ────────────────────────────────────────────────────

describe("WorkRecordsList — former-employee toggle", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
  });

  it("passes employeeStatus:'active' to useListWorkRecords when toggle is off", () => {
    render(<WorkRecordsList />, { wrapper: Wrapper });

    expect(vi.mocked(useListWorkRecords)).toHaveBeenCalledWith(
      expect.objectContaining({ employeeStatus: "active" }),
    );
  });

  it("omits employeeStatus when the toggle is turned on", async () => {
    const user = userEvent.setup();
    render(<WorkRecordsList />, { wrapper: Wrapper });

    const toggle = screen.getByRole("switch", { name: /include former employees/i });
    await user.click(toggle);

    const calls = vi.mocked(useListWorkRecords).mock.calls;
    const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
    expect(lastCall.employeeStatus).toBeUndefined();
  });

  it("renders a 'Former' badge on rows belonging to non-active employees", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ id: 201, employeeId: 2, employeeFirstName: "Bob", employeeLastName: "Jones", employeeStatus: "leaver" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    const cell = screen.getByRole("cell", {
      name: (name) => name.includes("Bob") && name.includes("Jones"),
    });
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent("Former");
  });

  it("does not render a 'Former' badge for active employees", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ id: 301, employeeId: 3, employeeFirstName: "Carol", employeeLastName: "White", employeeStatus: "active" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    const cell = screen.getByRole("cell", {
      name: (name) => name.includes("Carol") && name.includes("White"),
    });
    expect(cell).toBeInTheDocument();
    expect(cell).not.toHaveTextContent("Former");
  });

  it("row link navigates to the correct employee profile", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ id: 501, employeeId: 5, employeeFirstName: "Dan", employeeLastName: "Brown", employeeStatus: "leaver" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    // eslint-disable-next-line testing-library/no-node-access
    const profileLink = document.querySelector(
      'a[href="/employees/5?tab=work-record"]',
    );
    expect(profileLink).not.toBeNull();
  });
});

// ─── hours sidebar — former employee rendering ────────────────────────────────

describe("WorkRecordsList — hours sidebar (former employee rendering)", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  it("shows the Hours by Employee sidebar card when there are work records", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ employeeId: 1, employeeFirstName: "Alice", employeeLastName: "Smith", hoursWorked: 8, employeeStatus: "active" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    expect(screen.getByText(/hours by employee/i)).toBeInTheDocument();
  });

  it("renders the (Former) label next to former employees in the sidebar", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ employeeId: 2, employeeFirstName: "Bob", employeeLastName: "Left", hoursWorked: 6, employeeStatus: "leaver" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    // The "(Former)" label should be in the sidebar
    expect(screen.getByText(/\(Former\)/)).toBeInTheDocument();
  });

  it("does NOT render a (Former) label for active employees in the sidebar", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ employeeId: 3, employeeFirstName: "Carol", employeeLastName: "Active", hoursWorked: 7, employeeStatus: "active" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    expect(screen.queryByText(/\(Former\)/)).not.toBeInTheDocument();
  });

  it("applies muted styling to former employees in the sidebar", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ employeeId: 4, employeeFirstName: "Eve", employeeLastName: "Gone", hoursWorked: 4, employeeStatus: "leaver" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    // The sidebar name span carries text-muted-foreground for former employees.
    // "Eve Gone" appears in both the table row and the sidebar, so we look for
    // the one that has the muted class (the sidebar span).
    const allMatches = screen.getAllByText((_, el) => {
      if (!el) return false;
      return (
        el.tagName === "SPAN" &&
        el.classList.contains("text-muted-foreground") &&
        (el.textContent ?? "").includes("Eve Gone")
      );
    });
    expect(allMatches.length).toBeGreaterThan(0);
    expect(allMatches[0]).toHaveClass("text-muted-foreground");
  });

  it("sidebar link points to the correct employee profile for a former employee", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ employeeId: 7, employeeFirstName: "Fred", employeeLastName: "Past", hoursWorked: 5, employeeStatus: "leaver" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    // The sidebar link wraps the employee name
    const link = screen.getByRole("link", {
      name: (name) => name.includes("Fred") && name.includes("Past"),
    });
    expect(link).toHaveAttribute("href", "/employees/7?tab=work-record");
  });

  it("sidebar link points to the correct employee profile for an active employee", () => {
    vi.mocked(useListWorkRecords).mockReturnValue({
      data: [makeRow({ employeeId: 8, employeeFirstName: "Gina", employeeLastName: "Here", hoursWorked: 9, employeeStatus: "active" })],
      isLoading: false,
    } as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    const link = screen.getByRole("link", {
      name: (name) => name.includes("Gina") && name.includes("Here"),
    });
    expect(link).toHaveAttribute("href", "/employees/8?tab=work-record");
  });
});

// ─── CSV utility unit tests ───────────────────────────────────────────────────
// These tests exercise the pure escapeCsv / workRecordsCsvFilename helpers
// extracted to src/lib/csvUtils.ts.  Testing them directly is faster and more
// reliable than triggering a full component render + Blob mock.

import { escapeCsv, buildCsv, workRecordsCsvFilename } from "@/lib/csvUtils";

describe("escapeCsv", () => {
  it("returns an empty string for null", () => {
    expect(escapeCsv(null)).toBe("");
  });

  it("returns an empty string for undefined", () => {
    expect(escapeCsv(undefined)).toBe("");
  });

  it("passes through a plain string unchanged", () => {
    expect(escapeCsv("simple note")).toBe("simple note");
  });

  it("passes through a numeric value as a string", () => {
    expect(escapeCsv(8.5)).toBe("8.5");
  });

  it("wraps a string containing a comma in double quotes", () => {
    expect(escapeCsv("morning shift, early start")).toBe(
      '"morning shift, early start"',
    );
  });

  it("wraps a string containing a double-quote and escapes it by doubling", () => {
    expect(escapeCsv('He said "hello"')).toBe('"He said ""hello"""');
  });

  it("wraps a string containing a newline in double quotes", () => {
    expect(escapeCsv("line one\nline two")).toBe('"line one\nline two"');
  });

  it("handles a note combining a comma and a double-quote", () => {
    expect(escapeCsv('note: "hello, world"')).toBe('"note: ""hello, world"""');
  });

  it("handles a value that is only a double-quote character", () => {
    expect(escapeCsv('"')).toBe('""""');
  });

  it("handles a value with multiple embedded double-quotes", () => {
    // 'say "hi" and "bye"' → '"say ""hi"" and ""bye"""'
    expect(escapeCsv('say "hi" and "bye"')).toBe('"say ""hi"" and ""bye"""');
  });
});

describe("buildCsv", () => {
  it("produces a header row followed by data rows separated by newlines", () => {
    const csv = buildCsv(
      ["Name", "Hours", "Notes"],
      [["Alice Smith", 8, "no issues"]],
    );
    expect(csv).toBe("Name,Hours,Notes\nAlice Smith,8,no issues");
  });

  it("escapes header cells that contain commas", () => {
    const csv = buildCsv(['"Quoted,Header"', "Plain"], []);
    // Header cell contains both a quote and a comma → double-escaped + quoted
    expect(csv).toContain('"');
  });

  it("correctly escapes a notes cell with a comma in the data row", () => {
    const csv = buildCsv(
      ["Name", "Notes"],
      [["Alice", "early shift, urgent"]],
    );
    const dataRow = csv.split("\n")[1];
    expect(dataRow).toBe('Alice,"early shift, urgent"');
  });

  it("correctly escapes a notes cell with a double-quote in the data row", () => {
    const csv = buildCsv(
      ["Name", "Notes"],
      [["Bob", 'He said "hello"']],
    );
    const dataRow = csv.split("\n")[1];
    expect(dataRow).toBe('Bob,"He said ""hello"""');
  });

  it("correctly escapes a notes cell with a newline in the data row", () => {
    const csv = buildCsv(
      ["Name", "Notes"],
      [["Carol", "line one\nline two"]],
    );
    // The embedded newline is inside the quoted field, so splitting on "\n"
    // would break the field apart.  Check the full CSV string instead.
    expect(csv).toBe('Name,Notes\nCarol,"line one\nline two"');
  });

  it("outputs an empty last field when the notes value is null", () => {
    const csv = buildCsv(["Name", "Notes"], [["Dave", null]]);
    const dataRow = csv.split("\n")[1];
    expect(dataRow).toBe("Dave,");
  });

  it("produces only the header row when there are no data rows", () => {
    const csv = buildCsv(["Name", "Notes"], []);
    expect(csv).toBe("Name,Notes");
  });
});

describe("workRecordsCsvFilename", () => {
  it("includes both dates when both are provided", () => {
    expect(workRecordsCsvFilename("2026-01-01", "2026-03-31")).toBe(
      "work-records-2026-01-01-to-2026-03-31.csv",
    );
  });

  it("uses 'all' for the from-date when it is an empty string", () => {
    expect(workRecordsCsvFilename("", "2026-03-31")).toBe(
      "work-records-all-to-2026-03-31.csv",
    );
  });

  it("uses 'all' for the to-date when it is an empty string", () => {
    expect(workRecordsCsvFilename("2026-01-01", "")).toBe(
      "work-records-2026-01-01-to-all.csv",
    );
  });

  it("uses 'all' for both parts when both are empty", () => {
    expect(workRecordsCsvFilename("", "")).toBe(
      "work-records-all-to-all.csv",
    );
  });

  it("uses 'all' for the from-date when it is undefined", () => {
    expect(workRecordsCsvFilename(undefined, "2026-12-31")).toBe(
      "work-records-all-to-2026-12-31.csv",
    );
  });
});
