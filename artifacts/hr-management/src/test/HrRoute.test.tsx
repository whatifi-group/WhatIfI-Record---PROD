/**
 * HrRoute guard — unit tests.
 *
 * Verifies that the HrRoute component in App.tsx blocks access and renders
 * AccessDenied for users who lack the hr:access (or sysadmin) permission,
 * and renders the protected component when the user does have access.
 *
 * These tests intentionally import HrRoute directly so that a future
 * refactor that accidentally removes or weakens the guard is caught here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HrRoute } from "@/App";

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

// App.tsx imports AppLayout which in turn imports a logo PNG from @assets.
// That file does not exist in the test environment so we stub the whole
// layout component out — HrRoute never uses it anyway.
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// wouter is used by App internals; provide a minimal stub so imports resolve.
vi.mock("wouter", () => ({
  useLocation: () => ["/employees", vi.fn()],
  useParams: () => ({}),
  Route: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Switch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Router: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Import after vi.mock() ────────────────────────────────────────────────────
import { useAuth } from "@/contexts/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ProtectedPage = () => <div>Protected content</div>;

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

describe("HrRoute — route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows AccessDenied when the user has no permissions at all", () => {
    mockAuth(() => false);

    render(<HrRoute component={ProtectedPage} />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows AccessDenied when the user has an unrelated permission but not hr:access", () => {
    mockAuth((p) => p === "edit_employees");

    render(<HrRoute component={ProtectedPage} />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the protected component when the user has hr:access", () => {
    mockAuth((p) => p === "hr:access");

    render(<HrRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it("renders the protected component when the user has sysadmin (but not hr:access)", () => {
    mockAuth((p) => p === "sysadmin");

    render(<HrRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it("renders the protected component when the user has both hr:access and sysadmin", () => {
    mockAuth((p) => p === "hr:access" || p === "sysadmin");

    render(<HrRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it("AccessDenied message tells the user to contact their system administrator", () => {
    mockAuth(() => false);

    render(<HrRoute component={ProtectedPage} />);

    expect(screen.getByText(/system administrator/i)).toBeInTheDocument();
  });
});
