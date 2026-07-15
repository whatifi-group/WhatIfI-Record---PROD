/**
 * Confirm the PastEmployeesList search filter handles null/undefined email
 * gracefully so the page does not crash when a leaver has no email on record.
 *
 * Tests cover:
 * - A leaver with a null email is not excluded from the list when no search is active
 * - Searching by name still returns the null-email row (name match)
 * - Searching by a string that would only match an email excludes the null-email row
 *   without throwing a runtime error
 * - A leaver with an undefined email is handled identically to null
 * - Mix of rows with and without email renders correctly and the search works for
 *   the rows that do have an email
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Navigation ─────────────────────────────────────────────────────────────────
vi.mock("wouter", () => ({
  useLocation: () => ["/past-employees", vi.fn()],
}));

// ── API hooks ──────────────────────────────────────────────────────────────────
vi.mock("@workspace/api-client-react", () => ({
  useListEmployees: vi.fn(),
  EmployeeStatus: { leaver: "leaver" },
}));

import { useListEmployees } from "@workspace/api-client-react";
import PastEmployeesList from "@/pages/PastEmployeesList";

// ── Helpers ────────────────────────────────────────────────────────────────────
function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeLeaver(overrides: Record<string, unknown>) {
  return {
    id: 1,
    firstName: "Alice",
    lastName: "Example",
    email: "alice@example.com",
    startDate: "2022-01-01",
    leaverDate: "2025-06-01",
    ...overrides,
  };
}

function renderPage() {
  render(<PastEmployeesList />, { wrapper: Wrapper });
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("PastEmployeesList — null/undefined email handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a leaver with a null email without crashing", () => {
    vi.mocked(useListEmployees).mockReturnValue({
      data: [makeLeaver({ email: null })],
      isLoading: false,
    } as ReturnType<typeof useListEmployees>);

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("Alice Example")).toBeInTheDocument();
  });

  it("renders a leaver with an undefined email without crashing", () => {
    vi.mocked(useListEmployees).mockReturnValue({
      data: [makeLeaver({ email: undefined })],
      isLoading: false,
    } as ReturnType<typeof useListEmployees>);

    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText("Alice Example")).toBeInTheDocument();
  });

  it("keeps the null-email row visible when searching by name", async () => {
    vi.mocked(useListEmployees).mockReturnValue({
      data: [makeLeaver({ email: null })],
      isLoading: false,
    } as ReturnType<typeof useListEmployees>);

    renderPage();
    const searchInput = screen.getByPlaceholderText(/search by name or email/i);
    await userEvent.type(searchInput, "Alice");

    expect(screen.getByText("Alice Example")).toBeInTheDocument();
  });

  it("excludes the null-email row from results when searching by an email string without throwing", async () => {
    vi.mocked(useListEmployees).mockReturnValue({
      data: [makeLeaver({ email: null })],
      isLoading: false,
    } as ReturnType<typeof useListEmployees>);

    renderPage();
    const searchInput = screen.getByPlaceholderText(/search by name or email/i);

    // This must not throw even though the row has no email
    await userEvent.type(searchInput, "someone@example.com");

    // The row does not match the search term — it should be excluded, not crash
    expect(screen.queryByText("Alice Example")).not.toBeInTheDocument();
    expect(screen.getByText(/no matches found/i)).toBeInTheDocument();
  });

  it("returns email-matched rows while null-email rows are excluded — no crash", async () => {
    vi.mocked(useListEmployees).mockReturnValue({
      data: [
        makeLeaver({ id: 1, firstName: "Alice", lastName: "NoEmail", email: null }),
        makeLeaver({ id: 2, firstName: "Bob", lastName: "HasEmail", email: "bob@company.com" }),
      ],
      isLoading: false,
    } as ReturnType<typeof useListEmployees>);

    renderPage();
    const searchInput = screen.getByPlaceholderText(/search by name or email/i);
    await userEvent.type(searchInput, "bob@company.com");

    expect(screen.getByText("Bob HasEmail")).toBeInTheDocument();
    expect(screen.queryByText("Alice NoEmail")).not.toBeInTheDocument();
  });

  it("shows all leavers (including null-email ones) when search is empty", () => {
    vi.mocked(useListEmployees).mockReturnValue({
      data: [
        makeLeaver({ id: 1, firstName: "Alice", lastName: "NoEmail", email: null }),
        makeLeaver({ id: 2, firstName: "Bob", lastName: "HasEmail", email: "bob@company.com" }),
      ],
      isLoading: false,
    } as ReturnType<typeof useListEmployees>);

    renderPage();

    expect(screen.getByText("Alice NoEmail")).toBeInTheDocument();
    expect(screen.getByText("Bob HasEmail")).toBeInTheDocument();
  });
});
