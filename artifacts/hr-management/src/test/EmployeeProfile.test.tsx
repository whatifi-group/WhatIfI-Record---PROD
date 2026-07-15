import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeProfile from "@/pages/EmployeeProfile";

// ── Navigation ────────────────────────────────────────────────────────────────
vi.mock("wouter", () => ({
  useParams: () => ({ id: "1" }),
  useLocation: () => ["/employees/1", vi.fn()],
  useSearch: () => "",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ── API hooks ─────────────────────────────────────────────────────────────────
vi.mock("@workspace/api-client-react", () => ({
  useGetEmployee: vi.fn(),
  useUpdateEmployee: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteEmployee: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useListDepartments: vi.fn(() => ({ data: [] })),
  useListLovItems: vi.fn(() => ({ data: [] })),
  getGetEmployeeQueryKey: vi.fn(() => ["employee", 1]),
  getListEmployeesQueryKey: vi.fn(() => ["employees"]),
  EmployeeStatus: { active: "active", on_leave: "on_leave", leaver: "leaver" },
}));

// ── Auth ──────────────────────────────────────────────────────────────────────
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

// ── Silence child tabs (they have their own API calls; keep tests focused) ────
vi.mock("@/pages/MarkAsLeaverDialog", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeeAddressesTab", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeePayrollTab", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeeAttachmentsTab", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeeMedicalTab", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeeDietaryTab", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeeNextOfKinTab", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeeQualificationsTab", () => ({ default: () => null }));
vi.mock("@/pages/employee-tabs/EmployeeWorkRecordsTab", () => ({ default: () => null }));

// ── Imports that must come after vi.mock() calls ──────────────────────────────
import { useGetEmployee } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

// ── Shared fixture data ───────────────────────────────────────────────────────
const mockEmployee = {
  id: 1,
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  phone: null,
  jobTitle: "HR Manager",
  departmentId: null,
  departmentName: null,
  employmentType: "full_time",
  status: "active",
  startDate: "2023-01-15T00:00:00.000Z",
  salary: null,
  avatarUrl: null,
  leaverReason: null,
  leaverDate: null,
  createdAt: "2023-01-15T00:00:00.000Z",
};

/** Fresh QueryClient + Provider for each render to avoid cross-test cache. */
function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EmployeeProfile — action button visibility by permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetEmployee).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetEmployee>);
  });

  function mockAuth(hasPermission: (p: string) => boolean) {
    vi.mocked(useAuth).mockReturnValue({
      hasPermission,
      user: null,
      isLoading: false,
      isAuthenticated: true,
      error: null,
    } as unknown as ReturnType<typeof useAuth>);
  }

  it("edit_employees-only user: Mark as Leaver is present, Remove Employee is absent", () => {
    mockAuth((p) => p === "edit_employees");

    render(<EmployeeProfile />, { wrapper: Wrapper });

    expect(
      screen.getByRole("button", { name: /mark as leaver/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /remove employee/i }),
    ).not.toBeInTheDocument();
  });

  it("sysadmin-only user: Remove Employee is present, Mark as Leaver is absent", () => {
    mockAuth((p) => p === "sysadmin");

    render(<EmployeeProfile />, { wrapper: Wrapper });

    expect(
      screen.getByRole("button", { name: /remove employee/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /mark as leaver/i }),
    ).not.toBeInTheDocument();
  });

  it("user with both sysadmin and edit_employees: both action buttons are present", () => {
    mockAuth((p) => p === "sysadmin" || p === "edit_employees");

    render(<EmployeeProfile />, { wrapper: Wrapper });

    expect(
      screen.getByRole("button", { name: /mark as leaver/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove employee/i }),
    ).toBeInTheDocument();
  });

  it("neither action button appears when the employee is already a leaver", () => {
    vi.mocked(useGetEmployee).mockReturnValue({
      data: { ...mockEmployee, status: "leaver", leaverReason: "resignation", leaverDate: "2024-01-01T00:00:00.000Z" },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetEmployee>);

    // edit_employees user: canEdit=true but employee.status === 'leaver' suppresses the button
    mockAuth((p) => p === "edit_employees");

    render(<EmployeeProfile />, { wrapper: Wrapper });

    // Mark as Leaver is gated on active|on_leave status
    expect(
      screen.queryByRole("button", { name: /mark as leaver/i }),
    ).not.toBeInTheDocument();
  });
});
