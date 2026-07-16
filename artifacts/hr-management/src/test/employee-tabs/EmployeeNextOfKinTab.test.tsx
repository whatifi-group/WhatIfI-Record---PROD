import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeNextOfKinTab from "@/pages/employee-tabs/EmployeeNextOfKinTab";

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@workspace/api-client-react", () => ({
  // Next-of-kin hooks
  useListEmployeeNextOfKin: vi.fn(),
  useCreateEmployeeNextOfKin: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateEmployeeNextOfKin: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteEmployeeNextOfKin: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getListEmployeeNextOfKinQueryKey: vi.fn(() => ["nok"]),
  // Kin-phone hooks (used by both EmployeeNextOfKinTab and KinPhoneList / KinPrimaryPhone)
  useCreateKinPhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateKinPhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteKinPhone: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useListKinPhones: vi.fn(() => ({ data: [], isLoading: false })),
  getListKinPhonesQueryKey: vi.fn(() => ["kinPhones"]),
}));

import {
  useListEmployeeNextOfKin,
  useCreateEmployeeNextOfKin,
  useUpdateEmployeeNextOfKin,
  useCreateKinPhone,
  useUpdateKinPhone,
  useDeleteKinPhone,
  useListKinPhones,
} from "@workspace/api-client-react";

// ── Test helpers ──────────────────────────────────────────────────────────────

let queryClient: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const EMPLOYEE_ID = 5;

const baseKin = {
  id: 99,
  employeeId: EMPLOYEE_ID,
  name: "Jane Doe",
  relationship: "Spouse",
  email: "jane@example.com",
  address: null,
  createdAt: new Date().toISOString(),
};

function makeListOk(records: typeof baseKin[] = []) {
  vi.mocked(useListEmployeeNextOfKin).mockReturnValue({
    data: records,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as any);
}

// ── Suite: Add flow ───────────────────────────────────────────────────────────

describe("EmployeeNextOfKinTab — Add flow", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
    makeListOk();
  });

  it("sends kin and draft phones atomically in one createNok request", async () => {
    const user = userEvent.setup();

    const createNokMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess(baseKin));
    vi.mocked(useCreateEmployeeNextOfKin).mockReturnValue({
      mutate: createNokMutate,
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    // Open the Add dialog
    await user.click(screen.getByRole("button", { name: /add/i }));

    // Name input: Label isn't associated via htmlFor, so use textbox index (Name is [0])
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Jane Doe");

    // Add two draft phone rows
    await user.click(screen.getByRole("button", { name: /add phone number/i }));
    const phoneInputs = screen.getAllByPlaceholderText(/phone number/i);
    await user.type(phoneInputs[0], "07700111111");

    await user.click(screen.getByRole("button", { name: /add phone number/i }));
    const phoneInputs2 = screen.getAllByPlaceholderText(/phone number/i);
    await user.type(phoneInputs2[1], "07700222222");

    // Save
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    // Single createNok call carrying both phones in the data payload (atomic)
    expect(createNokMutate).toHaveBeenCalledOnce();
    expect(createNokMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      data: expect.objectContaining({
        name: "Jane Doe",
        phones: expect.arrayContaining([
          expect.objectContaining({ number: "07700111111" }),
          expect.objectContaining({ number: "07700222222" }),
        ]),
      }),
    });

    // Success toast shown and dialog dismissed
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Next of kin added" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a destructive toast and keeps the dialog open when createNok fails", async () => {
    const user = userEvent.setup();

    vi.mocked(useCreateEmployeeNextOfKin).mockReturnValue({
      mutate: vi.fn((_args: unknown, cbs: any) => cbs.onError(new Error("Network error"))),
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add/i }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Jane Doe");

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Failed to add",
        variant: "destructive",
      }),
    );
    // Dialog stays open so the user can retry
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("validates that empty draft phone numbers are rejected before save", async () => {
    const user = userEvent.setup();

    vi.mocked(useCreateEmployeeNextOfKin).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.type(within(screen.getByRole("dialog")).getAllByRole("textbox")[0], "Jane Doe");

    // Add draft phone but leave the number empty
    await user.click(screen.getByRole("button", { name: /add phone number/i }));
    // Do NOT type a number

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/phone number fields must be filled in/i),
        variant: "destructive",
      }),
    );
    // Kin creation must NOT have been called
    expect(vi.mocked(useCreateEmployeeNextOfKin)().mutate).not.toHaveBeenCalled();
  });
});

// ── Suite: Edit flow ──────────────────────────────────────────────────────────

describe("EmployeeNextOfKinTab — Edit flow", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("shows KinPhoneList inside the edit dialog", async () => {
    const user = userEvent.setup();

    makeListOk([baseKin]);

    // KinPhoneList will render "No phone numbers on record." when the list is empty
    vi.mocked(useListKinPhones).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    // The edit button is an icon-only button (Pencil). Navigate to it via the card.
    const kinNameEl = screen.getByText("Jane Doe");
    const card = kinNameEl.closest(".bg-card") as HTMLElement;
    const [editBtn] = within(card).getAllByRole("button");
    await user.click(editBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/edit next of kin/i)).toBeInTheDocument();

    // The embedded phone list empty-state text should appear
    expect(
      within(dialog).getByText(/no phone numbers on record/i),
    ).toBeInTheDocument();
  });

  it("fires the update-kin mutation when Save is clicked and does not call createKinPhone", async () => {
    const user = userEvent.setup();

    makeListOk([baseKin]);

    vi.mocked(useListKinPhones).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    const updateNokMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess({}));
    vi.mocked(useUpdateEmployeeNextOfKin).mockReturnValue({
      mutate: updateNokMutate,
      isPending: false,
    } as any);
    const createPhoneMutate = vi.fn();
    vi.mocked(useCreateKinPhone).mockReturnValue({
      mutate: createPhoneMutate,
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    // Navigate to the edit button (icon-only, no accessible name)
    const kinNameEl = screen.getByText("Jane Doe");
    const card = kinNameEl.closest(".bg-card") as HTMLElement;
    const [editBtn] = within(card).getAllByRole("button");
    await user.click(editBtn);

    // Change the name — textbox[0] is the Name field
    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getAllByRole("textbox")[0];
    await user.clear(nameInput);
    await user.type(nameInput, "Jane Smith");

    await user.click(screen.getByRole("button", { name: /update/i }));

    // Update mutation called with new name
    expect(updateNokMutate).toHaveBeenCalledOnce();
    expect(updateNokMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      kinId: baseKin.id,
      data: expect.objectContaining({ name: "Jane Smith" }),
    });

    // Phone creation must NOT be touched by the edit save
    expect(createPhoneMutate).not.toHaveBeenCalled();

    // Success toast
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Next of kin updated" }),
    );
  });
});

// ── Suite: Edit dialog — KinPhoneList phone operations ────────────────────────
//
// These tests open the Edit dialog and interact with the embedded KinPhoneList
// to verify that add, edit, and delete phone operations fire the correct
// mutations and show the expected toasts without silently failing.

const PHONE_ROW = { id: 7, number: "07700111111", label: "Mobile", isPrimary: false };

/** Open the edit dialog for baseKin (assumes makeListOk([baseKin]) already called). */
async function openEditDialog(user: ReturnType<typeof userEvent.setup>) {
  const kinNameEl = screen.getByText("Jane Doe");
  const card = kinNameEl.closest(".bg-card") as HTMLElement;
  const [editBtn] = within(card).getAllByRole("button");
  await user.click(editBtn);
  return screen.getByRole("dialog");
}

describe("EmployeeNextOfKinTab — Edit dialog KinPhoneList operations", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
    makeListOk([baseKin]);
  });

  // ── Phone add ────────────────────────────────────────────────────────────────

  it("adds a phone via the embedded KinPhoneList and calls createKinPhone", async () => {
    const user = userEvent.setup();

    vi.mocked(useListKinPhones).mockReturnValue({ data: [], isLoading: false } as any);

    const createPhoneMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess({}));
    vi.mocked(useCreateKinPhone).mockReturnValue({
      mutate: createPhoneMutate,
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });
    const dialog = await openEditDialog(user);

    // The embedded KinPhoneList shows its "Add phone number" toggle
    await user.click(within(dialog).getByRole("button", { name: /add phone number/i }));

    // Fill in the add form that appears inside the KinPhoneList.
    // The dialog already has 4 kin-field textboxes; the phone input is the last.
    const allTextboxes = within(dialog).getAllByRole("textbox");
    const phoneInput = allTextboxes[allTextboxes.length - 1];
    await user.type(phoneInput, "07700999999");

    await user.click(within(dialog).getByRole("button", { name: /^add$/i }));

    expect(createPhoneMutate).toHaveBeenCalledOnce();
    expect(createPhoneMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      kinId: baseKin.id,
      data: expect.objectContaining({ number: "07700999999" }),
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Phone number added" }),
    );
  });

  // ── Phone edit ───────────────────────────────────────────────────────────────

  it("edits an existing phone via the embedded KinPhoneList and calls updateKinPhone", async () => {
    const user = userEvent.setup();

    vi.mocked(useListKinPhones).mockReturnValue({
      data: [PHONE_ROW],
      isLoading: false,
    } as any);

    const updatePhoneMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess({}));
    vi.mocked(useUpdateKinPhone).mockReturnValue({
      mutate: updatePhoneMutate,
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });
    await openEditDialog(user);

    // The phone row carries class "group"; navigate to it from the number text
    const phoneNumberEl = screen.getByText(PHONE_ROW.number);
    const phoneRow = phoneNumberEl.closest(".group") as HTMLElement;
    const [editPhoneBtn] = within(phoneRow).getAllByRole("button");
    await user.click(editPhoneBtn);

    // Inline edit form appears — update the number field
    const editInput = screen.getAllByRole("textbox").find(
      (el) => (el as HTMLInputElement).value === PHONE_ROW.number,
    ) as HTMLInputElement;
    await user.clear(editInput);
    await user.type(editInput, "07799999999");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updatePhoneMutate).toHaveBeenCalledOnce();
    expect(updatePhoneMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      kinId: baseKin.id,
      phoneId: PHONE_ROW.id,
      data: expect.objectContaining({ number: "07799999999" }),
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Phone number updated" }),
    );
  });

  // ── Phone delete — success ───────────────────────────────────────────────────

  it("deletes a phone via the embedded KinPhoneList and calls deleteKinPhone on confirm", async () => {
    const user = userEvent.setup();

    vi.mocked(useListKinPhones).mockReturnValue({
      data: [PHONE_ROW],
      isLoading: false,
    } as any);

    const deletePhoneMutate = vi.fn((_args: unknown, cbs: any) => cbs.onSuccess({}));
    vi.mocked(useDeleteKinPhone).mockReturnValue({
      mutate: deletePhoneMutate,
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });
    await openEditDialog(user);

    // Find the phone row and click its trash (second button)
    const phoneNumberEl = screen.getByText(PHONE_ROW.number);
    const phoneRow = phoneNumberEl.closest(".group") as HTMLElement;
    const rowButtons = within(phoneRow).getAllByRole("button");
    await user.click(rowButtons[1]); // trash = second button

    // AlertDialog confirmation — "Remove" is the destructive action
    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    expect(deletePhoneMutate).toHaveBeenCalledOnce();
    expect(deletePhoneMutate.mock.calls[0][0]).toMatchObject({
      id: EMPLOYEE_ID,
      kinId: baseKin.id,
      phoneId: PHONE_ROW.id,
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Phone number removed" }),
    );
  });

  // ── Phone delete — error path ────────────────────────────────────────────────

  it("shows a destructive toast when deleteKinPhone fails", async () => {
    const user = userEvent.setup();

    vi.mocked(useListKinPhones).mockReturnValue({
      data: [PHONE_ROW],
      isLoading: false,
    } as any);

    vi.mocked(useDeleteKinPhone).mockReturnValue({
      mutate: vi.fn((_args: unknown, cbs: any) => cbs.onError(new Error("Network error"))),
      isPending: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });
    await openEditDialog(user);

    const phoneNumberEl = screen.getByText(PHONE_ROW.number);
    const phoneRow = phoneNumberEl.closest(".group") as HTMLElement;
    const rowButtons = within(phoneRow).getAllByRole("button");
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

// ── Suite: KinPrimaryPhone card display ───────────────────────────────────────

describe("EmployeeNextOfKinTab — card primary-phone display", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("shows the phone flagged isPrimary=true", () => {
    makeListOk([baseKin]);
    vi.mocked(useListKinPhones).mockReturnValue({
      data: [
        { id: 1, number: "07700000001", label: "Work", isPrimary: false },
        { id: 2, number: "07700000002", label: "Mobile", isPrimary: true },
      ],
      isLoading: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    // Primary phone should appear on the card
    expect(screen.getByText(/07700000002/)).toBeInTheDocument();
    // Non-primary phone should NOT appear on the card
    expect(screen.queryByText(/07700000001/)).not.toBeInTheDocument();
  });

  it("falls back to the first phone when none is flagged primary", () => {
    makeListOk([baseKin]);
    vi.mocked(useListKinPhones).mockReturnValue({
      data: [
        { id: 1, number: "07700111111", label: "Home", isPrimary: false },
        { id: 2, number: "07700222222", label: "Work", isPrimary: false },
      ],
      isLoading: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    expect(screen.getByText(/07700111111/)).toBeInTheDocument();
    expect(screen.queryByText(/07700222222/)).not.toBeInTheDocument();
  });

  it("shows nothing when the phone list is empty", () => {
    makeListOk([baseKin]);
    vi.mocked(useListKinPhones).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(<EmployeeNextOfKinTab employeeId={EMPLOYEE_ID} />, { wrapper: Wrapper });

    // No phone icon / number should appear on the card
    expect(screen.queryByText(/📞/)).not.toBeInTheDocument();
  });
});
