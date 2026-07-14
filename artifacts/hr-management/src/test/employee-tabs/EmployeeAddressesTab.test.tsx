import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeAddressesTab from "@/pages/employee-tabs/EmployeeAddressesTab";

vi.mock("@workspace/api-client-react", () => ({
  useListEmployeeAddresses: vi.fn(),
  useCreateEmployeeAddress: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateEmployeeAddress: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteEmployeeAddress: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getListEmployeeAddressesQueryKey: vi.fn(() => ["addresses"]),
  useListLovItems: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { useListEmployeeAddresses } from "@workspace/api-client-react";

let queryClient: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("EmployeeAddressesTab — error state", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  it("shows error card when the address list fails to load", () => {
    vi.mocked(useListEmployeeAddresses).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: vi.fn(),
    } as any);

    render(<EmployeeAddressesTab employeeId={1} />, { wrapper: Wrapper });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/failed to load data/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("calls refetch when the Retry button is clicked", async () => {
    const refetch = vi.fn();
    vi.mocked(useListEmployeeAddresses).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch,
    } as any);

    render(<EmployeeAddressesTab employeeId={1} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("does not show error card when data loads successfully", () => {
    vi.mocked(useListEmployeeAddresses).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<EmployeeAddressesTab employeeId={1} />, { wrapper: Wrapper });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
