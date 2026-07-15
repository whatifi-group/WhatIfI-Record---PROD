/**
 * SelfServiceRoute guard + Router isSelfServiceOnly redirect — unit tests.
 *
 * Verifies:
 * 1. SelfServiceRoute blocks users who lack `view_own_profile` (AccessDenied).
 * 2. SelfServiceRoute renders the protected component for users with
 *    `view_own_profile`.
 * 3. The Router component redirects to `/self-service` when a user has
 *    `view_own_profile` but no `hr:access` or `sysadmin` permission and the
 *    current location is `/`.
 * 4. The Router does NOT redirect a user who also has `hr:access`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelfServiceRoute, Router } from "@/App";

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mutable location for Router-level redirect tests.
let mockLocation = "/";
const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, mockSetLocation],
  useParams: () => ({}),
  Route: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Switch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Router: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub all page components that Router pulls in so we don't need their assets.
vi.mock("@/pages/CompanyDashboard", () => ({ default: () => <div>Dashboard</div> }));
vi.mock("@/pages/EmployeesList", () => ({ default: () => <div>Employees</div> }));
vi.mock("@/pages/EmployeeProfile", () => ({ default: () => <div>Employee Profile</div> }));
vi.mock("@/pages/DepartmentsList", () => ({ default: () => <div>Departments</div> }));
vi.mock("@/pages/LeaveRequestsList", () => ({ default: () => <div>Leave</div> }));
vi.mock("@/pages/sysadmin/SysadminDashboard", () => ({ default: () => <div>Sysadmin</div> }));
vi.mock("@/pages/sysadmin/UsersList", () => ({ default: () => <div>Users</div> }));
vi.mock("@/pages/sysadmin/RolesList", () => ({ default: () => <div>Roles</div> }));
vi.mock("@/pages/sysadmin/ListOfValues", () => ({ default: () => <div>LOV</div> }));
vi.mock("@/pages/sysadmin/LovCategoryDetail", () => ({ default: () => <div>LOV Category</div> }));
vi.mock("@/pages/sysadmin/QualificationTypes", () => ({ default: () => <div>Qual Types</div> }));
vi.mock("@/pages/PastEmployeesList", () => ({ default: () => <div>Past Employees</div> }));
vi.mock("@/pages/WorkRecordsList", () => ({ default: () => <div>Work Records</div> }));
vi.mock("@/pages/ExpiringQualifications", () => ({ default: () => <div>Expiring Quals</div> }));
vi.mock("@/pages/CourseManagement", () => ({ default: () => <div>Courses</div> }));
vi.mock("@/pages/Safety", () => ({ default: () => <div>Safety</div> }));
vi.mock("@/pages/LoginPage", () => ({ default: () => <div>Login</div> }));
vi.mock("@/pages/ForgotPasswordPage", () => ({ default: () => <div>Forgot Password</div> }));
vi.mock("@/pages/ResetPasswordPage", () => ({ default: () => <div>Reset Password</div> }));
vi.mock("@/pages/not-found", () => ({ default: () => <div>Not Found</div> }));
vi.mock("@/pages/OnboardingPortal", () => ({ default: () => <div>Onboarding Portal</div> }));
vi.mock("@/pages/OnboardingQueue", () => ({ default: () => <div>Onboarding Queue</div> }));
vi.mock("@/pages/SelfServicePortal", () => ({ default: () => <div>Self-Service Portal</div> }));

// ── Import after vi.mock() ────────────────────────────────────────────────────
import { useAuth } from "@/contexts/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ProtectedPage = () => <div>Protected content</div>;

function mockAuth(opts: {
  hasPermission: (p: string) => boolean;
  isAuthenticated?: boolean;
  isLoading?: boolean;
}) {
  vi.mocked(useAuth).mockReturnValue({
    hasPermission: opts.hasPermission,
    user: null,
    isLoading: opts.isLoading ?? false,
    isAuthenticated: opts.isAuthenticated ?? true,
    error: null,
  } as unknown as ReturnType<typeof useAuth>);
}

// ── SelfServiceRoute guard tests ──────────────────────────────────────────────

describe("SelfServiceRoute — route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows AccessDenied when the user has no permissions at all", () => {
    mockAuth({ hasPermission: () => false });

    render(<SelfServiceRoute component={ProtectedPage} />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows AccessDenied when the user has hr:access but not view_own_profile", () => {
    mockAuth({ hasPermission: (p) => p === "hr:access" });

    render(<SelfServiceRoute component={ProtectedPage} />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the protected component when the user has view_own_profile", () => {
    mockAuth({ hasPermission: (p) => p === "view_own_profile" });

    render(<SelfServiceRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it("renders the protected component when the user has view_own_profile and hr:access", () => {
    mockAuth({ hasPermission: (p) => p === "view_own_profile" || p === "hr:access" });

    render(<SelfServiceRoute component={ProtectedPage} />);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });
});

// ── Router — isSelfServiceOnly redirect tests ─────────────────────────────────

describe("Router — isSelfServiceOnly redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = "/";
    mockSetLocation.mockReset();
  });

  it("redirects to /self-service when the user has view_own_profile but no hr:access or sysadmin", () => {
    mockAuth({
      isAuthenticated: true,
      hasPermission: (p) => p === "view_own_profile",
    });

    render(<Router />);

    expect(mockSetLocation).toHaveBeenCalledWith("/self-service");
  });

  it("does NOT redirect when the user also has hr:access", () => {
    mockAuth({
      isAuthenticated: true,
      hasPermission: (p) => p === "view_own_profile" || p === "hr:access",
    });

    render(<Router />);

    expect(mockSetLocation).not.toHaveBeenCalledWith("/self-service");
  });

  it("does NOT redirect when the user also has sysadmin", () => {
    mockAuth({
      isAuthenticated: true,
      hasPermission: (p) => p === "view_own_profile" || p === "sysadmin",
    });

    render(<Router />);

    expect(mockSetLocation).not.toHaveBeenCalledWith("/self-service");
  });

  it("does NOT redirect when the user is not authenticated", () => {
    mockAuth({
      isAuthenticated: false,
      hasPermission: () => false,
    });

    render(<Router />);

    expect(mockSetLocation).not.toHaveBeenCalledWith("/self-service");
  });

  it("does NOT redirect when the current location is not /", () => {
    mockLocation = "/self-service";
    mockAuth({
      isAuthenticated: true,
      hasPermission: (p) => p === "view_own_profile",
    });

    render(<Router />);

    expect(mockSetLocation).not.toHaveBeenCalledWith("/self-service");
  });
});
