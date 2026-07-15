/**
 * PastEmployeesRoute guard — unit tests.
 *
 * Verifies that the PastEmployeesRoute component in App.tsx:
 *  - Renders null and redirects to "/" when the user lacks hr:past_employees
 *    (and is not sysadmin).
 *  - Renders the protected component when the user has hr:past_employees.
 *  - Renders the protected component when the user is sysadmin (bypass).
 *
 * Uses the same test pattern as HrRoute.test.tsx and AdminRoute.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/past-employees", mockSetLocation],
  useParams: () => ({}),
  Route: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Switch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Router: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Import after vi.mock() ────────────────────────────────────────────────────

import { useAuth } from "@/contexts/AuthContext";
import { PastEmployeesRoute } from "@/App";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ProtectedPage = () => <div>Past Employees content</div>;

function mockAuth(hasPermission: (p: string) => boolean) {
  vi.mocked(useAuth).mockReturnValue({
    hasPermission,
    user: null,
    isLoading: false,
    isAuthenticated: true,
    error: null,
  } as unknown as ReturnType<typeof useAuth>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PastEmployeesRoute — route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null (not the page) when the user has no permissions", () => {
    mockAuth(() => false);

    const { container } = render(
      <PastEmployeesRoute component={ProtectedPage} />,
    );

    expect(screen.queryByText("Past Employees content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("redirects to / when the user lacks hr:past_employees and is not sysadmin", () => {
    mockAuth(() => false);

    render(<PastEmployeesRoute component={ProtectedPage} />);

    expect(mockSetLocation).toHaveBeenCalledWith("/");
  });

  it("does NOT redirect when the user has hr:past_employees", () => {
    mockAuth((p) => p === "hr:past_employees");

    render(<PastEmployeesRoute component={ProtectedPage} />);

    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it("renders the protected component when the user has hr:past_employees", () => {
    mockAuth((p) => p === "hr:past_employees");

    render(<PastEmployeesRoute component={ProtectedPage} />);

    expect(screen.getByText("Past Employees content")).toBeInTheDocument();
  });

  it("renders the protected component when the user has hr:past_employees AND hr:access", () => {
    mockAuth((p) => p === "hr:past_employees" || p === "hr:access");

    render(<PastEmployeesRoute component={ProtectedPage} />);

    expect(screen.getByText("Past Employees content")).toBeInTheDocument();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it("renders the protected component when the user is sysadmin (no hr:past_employees)", () => {
    mockAuth((p) => p === "sysadmin");

    render(<PastEmployeesRoute component={ProtectedPage} />);

    expect(screen.getByText("Past Employees content")).toBeInTheDocument();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it("renders the protected component when the user has both hr:past_employees and sysadmin", () => {
    mockAuth((p) => p === "hr:past_employees" || p === "sysadmin");

    render(<PastEmployeesRoute component={ProtectedPage} />);

    expect(screen.getByText("Past Employees content")).toBeInTheDocument();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it("renders null (not AccessDenied) while redirect fires — no flash of content", () => {
    mockAuth(() => false);

    const { container } = render(
      <PastEmployeesRoute component={ProtectedPage} />,
    );

    // Unlike HrRoute which shows AccessDenied, PastEmployeesRoute silently
    // suppresses while the redirect fires (avoids a flash of an error page).
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
