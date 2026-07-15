import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeePayrollTab from "@/pages/employee-tabs/EmployeePayrollTab";

vi.mock("@workspace/api-client-react", () => ({
  useGetEmployeePayroll: vi.fn(),
  useUpsertEmployeePayroll: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getGetEmployeePayrollQueryKey: vi.fn(() => ["payroll"]),
  // Pay-rates hooks
  useListEmployeePayRates: vi.fn(() => ({ data: [], isLoading: false })),
  getListEmployeePayRatesQueryKey: vi.fn(() => ["payRates"]),
  useCreateEmployeePayRate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateEmployeePayRate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteEmployeePayRate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useListLovItems: vi.fn(() => ({ data: [] })),
  // CopyPayRatesDialog hooks
  useListEmployees: vi.fn(() => ({ data: [], isLoading: false })),
  getListEmployeesQueryKey: vi.fn(() => ["employees"]),
  useCopyEmployeePayRates: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { useGetEmployeePayroll } from "@workspace/api-client-react";

let queryClient: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("EmployeePayrollTab — error state", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  it("shows error card for server errors (status 500)", () => {
    const refetch = vi.fn();
    vi.mocked(useGetEmployeePayroll).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, message: "Internal Server Error" },
      refetch,
    } as any);

    render(<EmployeePayrollTab employeeId={1} />, { wrapper: Wrapper });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/failed to load data/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("calls refetch when the Retry button is clicked", async () => {
    const refetch = vi.fn();
    vi.mocked(useGetEmployeePayroll).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, message: "Internal Server Error" },
      refetch,
    } as any);

    render(<EmployeePayrollTab employeeId={1} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("does NOT show error card for 404 (no payroll record yet)", () => {
    vi.mocked(useGetEmployeePayroll).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 404, message: "Not Found" },
      refetch: vi.fn(),
    } as any);

    render(<EmployeePayrollTab employeeId={1} />, { wrapper: Wrapper });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Should show the empty state with Add Details button instead
    expect(screen.getByText(/no payroll information on record/i)).toBeInTheDocument();
  });

  it("does not show error card when data loads successfully", () => {
    vi.mocked(useGetEmployeePayroll).mockReturnValue({
      data: {
        id: 1,
        employeeId: 1,
        employeeNumber: "EMP001",
        niNumber: null,
        bankName: null,
        accountHolder: null,
        sortCode: null,
        accountNumber: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<EmployeePayrollTab employeeId={1} />, { wrapper: Wrapper });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
