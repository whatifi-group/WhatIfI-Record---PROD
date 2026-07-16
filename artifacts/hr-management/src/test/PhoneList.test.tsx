/**
 * PhoneList — employee phone interaction tests.
 *
 * Covers EmployeePhoneList (the employee variant of the shared PhoneList):
 *   - Primary badge renders for isPrimary=true entries
 *   - Add form opens, accepts input, and fires the create mutation
 *   - Edit form pre-fills with existing values and fires the update mutation
 *   - Delete confirmation dialog fires the delete mutation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmployeePhoneList } from "@/components/PhoneList";

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListEmployeePhones: vi.fn(),
  useCreateEmployeePhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateEmployeePhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteEmployeePhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getListEmployeePhonesQueryKey: vi.fn(() => ["employee-phones", 1]),
  // Kin variants are imported at module level by PhoneList.tsx — stub them too
  useListKinPhones: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateKinPhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateKinPhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteKinPhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getListKinPhonesQueryKey: vi.fn(() => ["kin-phones"]),
}));

import {
  useListEmployeePhones,
  useCreateEmployeePhone,
  useUpdateEmployeePhone,
  useDeleteEmployeePhone,
} from "@workspace/api-client-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPLOYEE_ID = 42;

const PHONE_A = { id: 1, number: "07700111111", label: "Mobile", isPrimary: true };
const PHONE_B = { id: 2, number: "07700222222", label: "Work", isPrimary: false };

function makeListOk(phones: typeof PHONE_A[] = []) {
  vi.mocked(useListEmployeePhones).mockReturnValue({
    data: phones,
    isLoading: false,
  } as any);
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// ── Suite: primary badge ──────────────────────────────────────────────────────

describe("EmployeePhoneList — primary badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Primary badge for an isPrimary=true entry", () => {
    makeListOk([PHONE_A]);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    expect(screen.getByText(/primary/i)).toBeInTheDocument();
    expect(screen.getByText(PHONE_A.number)).toBeInTheDocument();
  });

  it("does not render a Primary badge for an isPrimary=false entry", () => {
    makeListOk([PHONE_B]);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    expect(screen.queryByText(/primary/i)).not.toBeInTheDocument();
    expect(screen.getByText(PHONE_B.number)).toBeInTheDocument();
  });

  it("shows the empty-state message when there are no phones", () => {
    makeListOk([]);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    expect(screen.getByText(/no phone numbers on record/i)).toBeInTheDocument();
  });
});

// ── Suite: Add flow ───────────────────────────────────────────────────────────

describe("EmployeePhoneList — Add flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeListOk([]);
  });

  it("opens the add form when 'Add phone number' is clicked", async () => {
    const user = userEvent.setup();
    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add phone number/i }));

    // The add form contains a text input for the number
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls createEmployeePhone with the entered number and closes the form on success", async () => {
    const user = userEvent.setup();

    const createMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess({}));
    vi.mocked(useCreateEmployeePhone).mockReturnValue({
      mutate: createMutate,
      isPending: false,
    } as any);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add phone number/i }));
    await user.type(screen.getByRole("textbox"), "07700999999");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(createMutate).toHaveBeenCalledOnce();
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      data: expect.objectContaining({ number: "07700999999" }),
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Phone number added" }),
    );

    // Form should be hidden again
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not fire the mutation when the number field is empty", async () => {
    const user = userEvent.setup();

    const createMutate = vi.fn();
    vi.mocked(useCreateEmployeePhone).mockReturnValue({
      mutate: createMutate,
      isPending: false,
    } as any);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add phone number/i }));
    // Leave the number empty
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(createMutate).not.toHaveBeenCalled();
  });
});

// ── Suite: Edit flow ──────────────────────────────────────────────────────────

describe("EmployeePhoneList — Edit flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeListOk([PHONE_A]);
  });

  it("pre-fills the edit form with the existing number and calls updateEmployeePhone on save", async () => {
    const user = userEvent.setup();

    const updateMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess({}));
    vi.mocked(useUpdateEmployeePhone).mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as any);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    // The phone row carries the class "group"; find the edit (pencil) button
    const phoneEl = screen.getByText(PHONE_A.number);
    const row = phoneEl.closest(".group") as HTMLElement;
    const [editBtn] = within(row).getAllByRole("button");
    await user.click(editBtn);

    // The inline edit textbox should be pre-filled with the existing number
    const editInput = screen.getByRole("textbox") as HTMLInputElement;
    expect(editInput.value).toBe(PHONE_A.number);

    // Clear and type a new number
    await user.clear(editInput);
    await user.type(editInput, "07788888888");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateMutate).toHaveBeenCalledOnce();
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      phoneId: PHONE_A.id,
      data: expect.objectContaining({ number: "07788888888" }),
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Phone number updated" }),
    );
  });

  it("cancels the edit without calling the mutation when Cancel is clicked", async () => {
    const user = userEvent.setup();

    const updateMutate = vi.fn();
    vi.mocked(useUpdateEmployeePhone).mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as any);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    const phoneEl = screen.getByText(PHONE_A.number);
    const row = phoneEl.closest(".group") as HTMLElement;
    const [editBtn] = within(row).getAllByRole("button");
    await user.click(editBtn);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(updateMutate).not.toHaveBeenCalled();
    // The phone number is still visible in the list view
    expect(screen.getByText(PHONE_A.number)).toBeInTheDocument();
  });
});

// ── Suite: Delete flow ────────────────────────────────────────────────────────

describe("EmployeePhoneList — Delete flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeListOk([PHONE_A]);
  });

  it("calls deleteEmployeePhone with the correct phoneId after confirmation", async () => {
    const user = userEvent.setup();

    const deleteMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess({}));
    vi.mocked(useDeleteEmployeePhone).mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as any);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    const phoneEl = screen.getByText(PHONE_A.number);
    const row = phoneEl.closest(".group") as HTMLElement;
    const rowButtons = within(row).getAllByRole("button");
    // Trash button is the second button in the row
    await user.click(rowButtons[1]);

    // AlertDialog confirmation
    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    expect(deleteMutate).toHaveBeenCalledOnce();
    expect(deleteMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      phoneId: PHONE_A.id,
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Phone number removed" }),
    );
  });

  it("shows a destructive toast when deleteEmployeePhone fails", async () => {
    const user = userEvent.setup();

    vi.mocked(useDeleteEmployeePhone).mockReturnValue({
      mutate: vi.fn((_args: unknown, cbs: any) => cbs.onError(new Error("Network error"))),
      isPending: false,
    } as any);

    render(<EmployeePhoneList employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    const phoneEl = screen.getByText(PHONE_A.number);
    const row = phoneEl.closest(".group") as HTMLElement;
    const rowButtons = within(row).getAllByRole("button");
    await user.click(rowButtons[1]);

    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Failed to remove phone",
        variant: "destructive",
      }),
    );
  });
});
