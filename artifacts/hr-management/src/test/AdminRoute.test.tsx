/**
 * AdminRoute guard — unit tests.
 *
 * Verifies that the AdminRoute component in App.tsx blocks access for users
 * who lack the sysadmin permission, renders AccessDenied on non-sysadmin
 * guarded paths (e.g. /departments), and redirects to /?reason=access_denied
 * on /sysadmin/* paths. Also confirms the protected component renders when
 * the user does have the sysadmin permission.
 *
 * These tests intentionally import AdminRoute directly so that a future
 * refactor that accidentally removes or weakens the guard is caught here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminRoute } from "@/App";

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

// App.tsx imports AppLayout which in turn imports a logo PNG from @assets.
// That file does not exist in the test environment so we stub the whole
// layout component out — AdminRoute never uses it anyway.
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Provide a mutable location so individual tests can simulate different paths.
let mockLocation = "/departments";
const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, mockSetLocation],
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

describe("AdminRoute — route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = "/departments";
  });

  // ── Non-sysadmin path (/departments) ─────────────────────────────────────

  it("shows AccessDenied on /departments when the user has no permissions at all", () => {
    mockLocation = "/departments";
    mockAuth(() => false);

    render(<AdminRoute component={ProtectedPage} />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows AccessDenied on /departments when the user has hr:access but not sysadmin", () => {
    mockLocation = "/departments";
    mockAuth((p) => p === "hr:access");

    render(<AdminRoute component={ProtectedPage} />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("does NOT redirect to /?reason=access_denied on non-sysadmin paths", () => {
    mockLocation = "/departments";
    mockAuth(() => false);

    render(<AdminRoute component={ProtectedPage} />);

    // The redirect is only fired for /sysadmin/* paths
    expect(mockSetLocation).not.toHaveBeenCalledWith("/?reason=access_denied");
  });

  it("AccessDenied message tells the user to contact their system administrator", () => {
    mockLocation = "/departments";
    mockAuth(() => false);

    render(<AdminRoute component={ProtectedPage} />);

    expect(screen.getByText(/system administrator/i)).toBeInTheDocument();
  });

  // ── Sysadmin path (/sysadmin) ─────────────────────────────────────────────

  it("renders null (not AccessDenied) on /sysadmin when the user lacks sysadmin permission", () => {
    mockLocation = "/sysadmin";
    mockAuth(() => false);

    const { container } = render(<AdminRoute component={ProtectedPage} />);

    // No AccessDenied UI — it silently suppresses while redirect fires
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("redirects to /?reason=access_denied on /sysadmin when the user lacks sysadmin permission", () => {
    mockLocation = "/sysadmin";
    mockAuth(() => false);

    render(<AdminRoute component={ProtectedPage} />);

    expect(mockSetLocation).toHaveBeenCalledWith("/?reason=access_denied");
  });

  it("renders null on /sysadmin/users when the user lacks sysadmin permission", () => {
    mockLocation = "/sysadmin/users";
    mockAuth(() => false);

    const { container } = render(<AdminRoute component={ProtectedPage} />);

    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("redirects to /?reason=access_denied on /sysadmin/users when the user lacks sysadmin permission", () => {
    mockLocation = "/sysadmin/users";
    mockAuth(() => false);

    render(<AdminRoute component={ProtectedPage} />);

    expect(mockSetLocation).toHaveBeenCalledWith("/?reason=access_denied");
  });

  // ── Authorised user ───────────────────────────────────────────────────────

  it("renders the protected component on /departments when the user has sysadmin", () => {
    mockLocation = "/departments";
    mockAuth((p) => p === "sysadmin");

    render(<AdminRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it("renders the protected component on /sysadmin when the user has sysadmin", () => {
    mockLocation = "/sysadmin";
    mockAuth((p) => p === "sysadmin");

    render(<AdminRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it("renders the protected component on /sysadmin/roles when the user has sysadmin", () => {
    mockLocation = "/sysadmin/roles";
    mockAuth((p) => p === "sysadmin");

    render(<AdminRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it("does not redirect when the user has sysadmin permission", () => {
    mockLocation = "/sysadmin";
    mockAuth((p) => p === "sysadmin");

    render(<AdminRoute component={ProtectedPage} />);

    expect(mockSetLocation).not.toHaveBeenCalled();
  });
});
