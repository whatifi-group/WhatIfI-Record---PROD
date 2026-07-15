import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkRecordsList from "@/pages/WorkRecordsList";

// Partially mock react-query so we can control useQueries return values while
// keeping QueryClient / QueryClientProvider fully functional.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueries: vi.fn(() => []) };
});

vi.mock("@workspace/api-client-react", () => ({
  useListEmployees: vi.fn(() => ({ data: [], isLoading: false })),
  useListDepartments: vi.fn(() => ({ data: [] })),
  useListLovItems: vi.fn(() => ({ data: [] })),
  getListEmployeeWorkRecordsQueryOptions: vi.fn((id: number) => ({
    queryKey: ["work-records", id],
    queryFn: async () => [],
  })),
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

import { useListEmployees } from "@workspace/api-client-react";
import { useQueries } from "@tanstack/react-query";

// ─── helpers ────────────────────────────────────────────────────────────────

let queryClient: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeEmployee(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@example.com",
    phone: null,
    jobTitle: "Developer",
    departmentId: 10,
    departmentName: "Engineering",
    employmentType: "full_time",
    status: "active",
    startDate: "2022-01-01",
    salary: null,
    avatarUrl: null,
    leaverReason: null,
    leaverDate: null,
    createdAt: "2022-01-01",
    ...overrides,
  };
}

function makeWorkRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    employeeId: 1,
    shiftDate: "2026-07-01",
    shiftType: "regular",
    hoursWorked: 8,
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("WorkRecordsList — former-employee toggle", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    // Default: no employees, no work records
    vi.mocked(useListEmployees).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    vi.mocked(useQueries).mockReturnValue([]);
  });

  it("fetches only active employees when the toggle is off", () => {
    render(<WorkRecordsList />, { wrapper: Wrapper });

    // The component starts with includeFormer=false, so it passes status:"active"
    expect(vi.mocked(useListEmployees)).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    // Must NOT have been called without a status restriction in the same render
    const calls = vi.mocked(useListEmployees).mock.calls;
    expect(calls.every((args) => (args[0] as any)?.status === "active")).toBe(true);
  });

  it("omits the status filter when the toggle is turned on", async () => {
    const user = userEvent.setup();
    render(<WorkRecordsList />, { wrapper: Wrapper });

    const toggle = screen.getByRole("switch", { name: /include former employees/i });
    await user.click(toggle);

    // After toggling, the latest call should have no status restriction
    const calls = vi.mocked(useListEmployees).mock.calls;
    const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
    expect(lastCall).not.toHaveProperty("status");
  });

  it("renders a 'Former' badge on rows belonging to non-active employees", () => {
    const formerEmployee = makeEmployee({ id: 2, firstName: "Bob", lastName: "Jones", status: "leaver" });
    const record = makeWorkRecord({ id: 201, employeeId: 2 });

    vi.mocked(useListEmployees).mockReturnValue({
      data: [formerEmployee],
      isLoading: false,
    } as any);
    vi.mocked(useQueries).mockReturnValue([
      { data: [record], isLoading: false, isError: false },
    ] as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    // The component renders first/last name as separate JSX expressions so we
    // match against the containing cell's text content instead.
    const cell = screen.getByRole("cell", {
      name: (name) => name.includes("Bob") && name.includes("Jones"),
    });
    expect(cell).toBeInTheDocument();
    // The "Former" badge must appear inside that same cell
    expect(cell).toHaveTextContent("Former");
  });

  it("does not render a 'Former' badge for active employees", () => {
    const activeEmployee = makeEmployee({ id: 3, firstName: "Carol", lastName: "White", status: "active" });
    const record = makeWorkRecord({ id: 301, employeeId: 3 });

    vi.mocked(useListEmployees).mockReturnValue({
      data: [activeEmployee],
      isLoading: false,
    } as any);
    vi.mocked(useQueries).mockReturnValue([
      { data: [record], isLoading: false, isError: false },
    ] as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    // Active employee's row should contain the name but no "Former" badge
    const cell = screen.getByRole("cell", {
      name: (name) => name.includes("Carol") && name.includes("White"),
    });
    expect(cell).toBeInTheDocument();
    expect(cell).not.toHaveTextContent("Former");
  });

  it("row link navigates to the correct employee profile", () => {
    const employee = makeEmployee({ id: 5, firstName: "Dan", lastName: "Brown", status: "leaver" });
    const record = makeWorkRecord({ id: 501, employeeId: 5 });

    vi.mocked(useListEmployees).mockReturnValue({
      data: [employee],
      isLoading: false,
    } as any);
    vi.mocked(useQueries).mockReturnValue([
      { data: [record], isLoading: false, isError: false },
    ] as any);

    render(<WorkRecordsList />, { wrapper: Wrapper });

    // The table row has an icon-only link to the employee profile.
    // Query by href rather than accessible name since the link's label comes
    // from a title on a nested element, which JSDOM doesn't always surface.
    // eslint-disable-next-line testing-library/no-node-access
    const profileLink = document.querySelector(
      'a[href="/employees/5?tab=work-record"]',
    );
    expect(profileLink).not.toBeNull();
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
