import { useState, useEffect } from "react";
import {
  useGetEmployeePayroll,
  useUpsertEmployeePayroll,
  getGetEmployeePayrollQueryKey,
  useListEmployeePayRates,
  getListEmployeePayRatesQueryKey,
  useCreateEmployeePayRate,
  useUpdateEmployeePayRate,
  useDeleteEmployeePayRate,
  useListLovItems,
} from "@workspace/api-client-react";
import type {
  EmployeePayrollInput,
  EmployeePayRate,
  EmployeePayRateInput,
  EmployeePayRateInputRateUnit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Save,
  X,
  CreditCard,
  DollarSign,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import TabErrorState from "@/components/TabErrorState";
import CopyPayRatesDialog from "./CopyPayRatesDialog";

interface Props {
  employeeId: number;
  /** Passed from EmployeeProfile; drives the re-hire banner logic. */
  employeeStatus?: string;
}

interface FormData {
  employeeNumber: string;
  niNumber: string;
  bankName: string;
  accountHolder: string;
  sortCode: string;
  accountNumber: string;
}

const defaultForm: FormData = {
  employeeNumber: "",
  niNumber: "",
  bankName: "",
  accountHolder: "",
  sortCode: "",
  accountNumber: "",
};

interface PayRateForm {
  shiftType: string;
  rate: string;
  rateUnit: EmployeePayRateInputRateUnit;
  notes: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string;   // YYYY-MM-DD or "" = open
}

/**
 * Normalise a date value to a YYYY-MM-DD string for display and form inputs.
 * Accepts Date objects (UTC midnight), ISO datetime strings, plain date strings,
 * null, or undefined.  Returns "" when the value is absent.
 */
function dateToIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Today as YYYY-MM-DD (local time). */
function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** A pay rate is active when effectiveTo is absent or not yet in the past. */
function isRateActive(rate: EmployeePayRate): boolean {
  if (!rate.effectiveTo) return true;
  return dateToIso(rate.effectiveTo) >= todayIso();
}

function defaultPayRateFormWithDate(): PayRateForm {
  return { shiftType: "", rate: "", rateUnit: "hourly", notes: "", effectiveFrom: todayIso(), effectiveTo: "" };
}

const defaultPayRateForm: PayRateForm = {
  shiftType: "",
  rate: "",
  rateUnit: "hourly",
  notes: "",
  effectiveFrom: "",
  effectiveTo: "",
};

function maskValue(value: string | null | undefined, showLastN = 4): string {
  if (!value) return "—";
  if (value.length <= showLastN) return value;
  return "•".repeat(value.length - showLastN) + value.slice(-showLastN);
}

const RATE_UNIT_LABELS: Record<string, string> = {
  hourly: "Hourly",
  daily: "Daily",
  flat: "Flat",
};

// ── Pay Rates Card ────────────────────────────────────────────────────────────

interface PayRatesCardProps {
  employeeId: number;
  employeeStatus?: string;
}

/** Inline edit form shared between add and edit modes */
function PayRateFormFields({
  form,
  onChange,
  shiftTypes,
  lockShiftType,
}: {
  form: PayRateForm;
  onChange: (patch: Partial<PayRateForm>) => void;
  shiftTypes: { value: string; label: string }[];
  lockShiftType?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">Shift Type</Label>
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
          value={form.shiftType}
          disabled={lockShiftType}
          onChange={(e) => onChange({ shiftType: e.target.value })}
        >
          <option value="">Select shift type…</option>
          {shiftTypes.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">Rate (£)</Label>
        <Input
          className="mt-1"
          type="number"
          min="0"
          step="0.01"

          value={form.rate}
          onChange={(e) => onChange({ rate: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Rate Unit</Label>
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={form.rateUnit}
          onChange={(e) => onChange({ rateUnit: e.target.value as EmployeePayRateInputRateUnit })}
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="flat">Flat</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Input
          className="mt-1"

          value={form.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Effective From <span className="text-destructive">*</span></Label>
        <DatePicker
          className="mt-1"
          value={form.effectiveFrom}
          onChange={(value) => onChange({ effectiveFrom: value })}
        />
      </div>
      <div>
        <Label className="text-xs">Effective To (leave blank = open)</Label>
        <DatePicker
          className="mt-1"
          value={form.effectiveTo}
          onChange={(value) => onChange({ effectiveTo: value })}
        />
      </div>
    </div>
  );
}

function PayRatesCard({ employeeId, employeeStatus }: PayRatesCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [addForm, setAddForm] = useState<PayRateForm>(defaultPayRateFormWithDate);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PayRateForm>(defaultPayRateFormWithDate);
  // Track which shift-type groups have their history expanded
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  // Re-hire banner dismissed state (session-only; auto-clears when an open rate is added)
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { data: rates = [], isLoading: ratesLoading } =
    useListEmployeePayRates(employeeId, {
      query: { queryKey: getListEmployeePayRatesQueryKey(employeeId) },
    });

  // Show re-hire banner when the employee is active but has only closed historical rates
  // (the typical state after a leaver is re-hired). Auto-hides once an open rate exists.
  const hasNoOpenRates = rates.length > 0 && !rates.some((r) => !r.effectiveTo);
  const showRehireBanner = employeeStatus === "active" && hasNoOpenRates && !bannerDismissed;

  const { data: shiftTypes = [] } = useListLovItems("shift_type");

  const createMutation = useCreateEmployeePayRate();
  const updateMutation = useUpdateEmployeePayRate();
  const deleteMutation = useDeleteEmployeePayRate();

  const invalidateRates = () =>
    queryClient.invalidateQueries({
      queryKey: getListEmployeePayRatesQueryKey(employeeId),
    });

  const shiftTypeLabel = (value: string) =>
    shiftTypes.find((s) => s.value === value)?.label ?? value;

  const handleAdd = () => {
    if (!addForm.shiftType || !addForm.rate) {
      toast({ title: "Shift type and rate are required", variant: "destructive" });
      return;
    }
    if (!addForm.effectiveFrom) {
      toast({ title: "Effective from date is required", variant: "destructive" });
      return;
    }
    const payload: EmployeePayRateInput = {
      shiftType: addForm.shiftType,
      rate: parseFloat(addForm.rate),
      rateUnit: addForm.rateUnit,
      notes: addForm.notes || undefined,
      effectiveFrom: addForm.effectiveFrom as string & Date,
      effectiveTo: (addForm.effectiveTo || undefined) as (string & Date) | undefined,
    };
    createMutation.mutate(
      { id: employeeId, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Pay rate added" });
          setAddForm(defaultPayRateFormWithDate());
          setShowAddForm(false);
          invalidateRates();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to add pay rate";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  const startEdit = (rate: EmployeePayRate) => {
    setEditingId(rate.id);
    setEditForm({
      shiftType: rate.shiftType,
      rate: String(rate.rate),
      rateUnit: rate.rateUnit as EmployeePayRateInputRateUnit,
      notes: rate.notes ?? "",
      effectiveFrom: dateToIso(rate.effectiveFrom),
      effectiveTo: dateToIso(rate.effectiveTo),
    });
  };

  const handleUpdate = (rateId: number) => {
    if (!editForm.shiftType || !editForm.rate) {
      toast({ title: "Shift type and rate are required", variant: "destructive" });
      return;
    }
    const payload: EmployeePayRateInput = {
      shiftType: editForm.shiftType,
      rate: parseFloat(editForm.rate),
      rateUnit: editForm.rateUnit,
      notes: editForm.notes || undefined,
      effectiveFrom: editForm.effectiveFrom as string & Date,
      effectiveTo: (editForm.effectiveTo || undefined) as (string & Date) | undefined,
    };
    updateMutation.mutate(
      { id: employeeId, rateId, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Pay rate updated" });
          setEditingId(null);
          invalidateRates();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to update pay rate";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  const handleDelete = (rateId: number) => {
    deleteMutation.mutate(
      { id: employeeId, rateId },
      {
        onSuccess: () => {
          toast({ title: "Pay rate deleted" });
          invalidateRates();
        },
        onError: () =>
          toast({ title: "Failed to delete pay rate", variant: "destructive" }),
      },
    );
  };

  const toggleHistory = (shiftType: string) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(shiftType)) {
        next.delete(shiftType);
      } else {
        next.add(shiftType);
      }
      return next;
    });
  };

  // Group rates by shiftType, sort each group newest-first by effectiveFrom
  const groupedRates = (() => {
    const map = new Map<string, EmployeePayRate[]>();
    for (const rate of rates) {
      if (!map.has(rate.shiftType)) map.set(rate.shiftType, []);
      map.get(rate.shiftType)!.push(rate);
    }
    // Sort each group newest → oldest
    for (const group of map.values()) {
      group.sort((a, b) => {
        const af = dateToIso(a.effectiveFrom);
        const bf = dateToIso(b.effectiveFrom);
        return bf.localeCompare(af);
      });
    }
    // Sort groups: groups with any active rate first, then alphabetically by label
    return Array.from(map.entries()).sort(([aKey, aRates], [bKey, bRates]) => {
      const aActive = aRates.some(isRateActive);
      const bActive = bRates.some(isRateActive);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return shiftTypeLabel(aKey).localeCompare(shiftTypeLabel(bKey));
    });
  })();

  /** Render a single rate row (read mode) */
  const renderRateRow = (rate: EmployeePayRate, isHistory: boolean) => {
    const active = isRateActive(rate);
    if (editingId === rate.id) {
      return (
        <div key={rate.id} className="px-5 py-4 bg-muted/30">
          <PayRateFormFields
            form={editForm}
            onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
            shiftTypes={shiftTypes}
            lockShiftType
          />
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => handleUpdate(rate.id)} disabled={updateMutation.isPending}>
              {updateMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={rate.id}
        className={`px-5 py-3 flex items-center justify-between gap-4 ${isHistory ? "bg-muted/20" : ""} ${!active ? "opacity-70" : ""}`}
      >
        {/* Timeline connector for history rows */}
        <div className="min-w-0 flex-1 flex items-start gap-3">
          {isHistory && (
            <div className="flex flex-col items-center shrink-0 mt-1">
              <div className="w-px h-2 bg-border/60" />
              <div className="w-1.5 h-1.5 rounded-full bg-border/60 shrink-0" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-medium whitespace-nowrap ${!active ? "text-muted-foreground" : "text-foreground"}`}>
                £{Number(rate.rate).toFixed(2)}
                <span className="ml-1 text-xs text-muted-foreground font-sans font-normal">
                  / {RATE_UNIT_LABELS[rate.rateUnit] ?? rate.rateUnit}
                </span>
              </span>
              {!active && (
                <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  Closed
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-muted-foreground/60 shrink-0" />
              <span className="text-xs text-muted-foreground">
                {dateToIso(rate.effectiveFrom)}
                {rate.effectiveTo ? ` → ${dateToIso(rate.effectiveTo)}` : " → present"}
              </span>
              {rate.notes && (
                <span className="text-xs text-muted-foreground truncate">· {rate.notes}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(rate)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => handleDelete(rate.id)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="border border-border/50 rounded-lg bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold text-foreground">Pay Rates</h4>
        </div>
        {!showAddForm && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowCopyDialog(true)}>
              <Copy className="w-4 h-4 mr-1" /> Copy from…
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Rate
            </Button>
          </div>
        )}
      </div>

      {/* Re-hire banner — active employee with no open pay rates */}
      {showRehireBanner && (
        <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-800">No active pay rates</p>
            <p className="text-amber-700 mt-0.5 text-xs">
              All pay rates for this employee are closed. Add a new rate before the next payroll run.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => { setShowAddForm(true); setBannerDismissed(true); }}
            >
              Add Rate
            </Button>
            <button
              aria-label="Dismiss"
              className="text-amber-400 hover:text-amber-600 transition-colors"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="px-5 py-4 border-b border-border/50 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-3">New Pay Rate</p>
          <PayRateFormFields
            form={addForm}
            onChange={(patch) => setAddForm((f) => ({ ...f, ...patch }))}
            shiftTypes={shiftTypes}
          />
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setAddForm(defaultPayRateFormWithDate()); }}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Rate list — grouped by shift type */}
      {ratesLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : groupedRates.length === 0 && !showAddForm ? (
        <div className="text-center py-10 text-muted-foreground">
          <DollarSign className="w-7 h-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm mb-3">No pay rates on record</p>
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Rate
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {groupedRates.map(([shiftType, group]) => {
            // Newest rate is first; subsequent ones are history
            const [current, ...history] = group;
            const hasHistory = history.length > 0;
            const isExpanded = expandedHistory.has(shiftType);
            const groupActive = isRateActive(current);

            return (
              <div key={shiftType}>
                {/* Shift type header */}
                <div className={`px-5 py-2 flex items-center gap-2 ${groupActive ? "bg-transparent" : "bg-muted/30"}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${groupActive ? "text-primary" : "text-muted-foreground"}`}>
                    {shiftTypeLabel(shiftType)}
                  </span>
                  {!groupActive && (
                    <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      All closed
                    </span>
                  )}
                  {hasHistory && (
                    <button
                      className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleHistory(shiftType)}
                    >
                      {isExpanded
                        ? <><ChevronDown className="w-3.5 h-3.5" /> Hide history</>
                        : <><ChevronRight className="w-3.5 h-3.5" /> {history.length} earlier {history.length === 1 ? "rate" : "rates"}</>}
                    </button>
                  )}
                </div>

                {/* Current (most recent) rate */}
                {renderRateRow(current, false)}

                {/* Historical rates — collapsible */}
                {hasHistory && isExpanded && (
                  <div className="border-t border-border/30">
                    {history.map((rate) => renderRateRow(rate, true))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CopyPayRatesDialog
        open={showCopyDialog}
        onClose={() => setShowCopyDialog(false)}
        targetEmployeeId={employeeId}
      />
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function EmployeePayrollTab({ employeeId, employeeStatus }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormData>(defaultForm);

  const {
    data: payroll,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetEmployeePayroll(employeeId, {
    query: { queryKey: getGetEmployeePayrollQueryKey(employeeId), retry: false },
  });
  const upsert = useUpsertEmployeePayroll();

  useEffect(() => {
    if (payroll) {
      setForm({
        employeeNumber: payroll.employeeNumber || "",
        niNumber: payroll.niNumber || "",
        bankName: payroll.bankName || "",
        accountHolder: payroll.accountHolder || "",
        sortCode: payroll.sortCode || "",
        accountNumber: payroll.accountNumber || "",
      });
    }
  }, [payroll]);

  const handleSave = () => {
    const payload: EmployeePayrollInput = {
      employeeNumber: form.employeeNumber || null,
      niNumber: form.niNumber || null,
      bankName: form.bankName || null,
      accountHolder: form.accountHolder || null,
      sortCode: form.sortCode || null,
      accountNumber: form.accountNumber || null,
    };
    upsert.mutate(
      { id: employeeId, data: payload },
      {
        onSuccess: (data) => {
          toast({ title: "Payroll information saved" });
          queryClient.setQueryData(
            getGetEmployeePayrollQueryKey(employeeId),
            data,
          );
          setIsEditing(false);
        },
        onError: () =>
          toast({
            title: "Failed to save payroll information",
            variant: "destructive",
          }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // 404 means no record exists yet — show empty state below. Other errors are real failures.
  if (isError && (error as any)?.status !== 404) {
    return (
      <TabErrorState
        onRetry={refetch}
        message="Could not load payroll information. Check your connection and try again."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Bank / payroll details ── */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-foreground">
            Payroll Information
          </h3>
          {!isEditing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="w-4 h-4 mr-1" /> Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (payroll) {
                    setForm({
                      employeeNumber: payroll.employeeNumber || "",
                      niNumber: payroll.niNumber || "",
                      bankName: payroll.bankName || "",
                      accountHolder: payroll.accountHolder || "",
                      sortCode: payroll.sortCode || "",
                      accountNumber: payroll.accountNumber || "",
                    });
                  } else {
                    setForm(defaultForm);
                  }
                  setIsEditing(false);
                }}
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={upsert.isPending}
              >
                {upsert.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                Save
              </Button>
            </div>
          )}
        </div>

        {!payroll && !isEditing && (
          <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
            <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm mb-3">No payroll information on record</p>
            <Button size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="w-4 h-4 mr-1" /> Add Details
            </Button>
          </div>
        )}

        {isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border border-border/50 rounded-lg p-5 bg-card">
            <div>
              <Label>Employee Number</Label>
              <Input
                className="mt-1"
                value={form.employeeNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, employeeNumber: e.target.value }))
                }

              />
            </div>
            <div>
              <Label>NI Number</Label>
              <Input
                className="mt-1"
                value={form.niNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, niNumber: e.target.value }))
                }

              />
            </div>
            <div>
              <Label>Bank Name</Label>
              <Input
                className="mt-1"
                value={form.bankName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bankName: e.target.value }))
                }

              />
            </div>
            <div>
              <Label>Account Holder</Label>
              <Input
                className="mt-1"
                value={form.accountHolder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountHolder: e.target.value }))
                }

              />
            </div>
            <div>
              <Label>Sort Code</Label>
              <Input
                className="mt-1"
                value={form.sortCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sortCode: e.target.value }))
                }

              />
            </div>
            <div>
              <Label>Account Number</Label>
              <Input
                className="mt-1"
                value={form.accountNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountNumber: e.target.value }))
                }

              />
            </div>
          </div>
        ) : payroll ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12 border border-border/50 rounded-lg p-5 bg-card">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Employee Number
              </p>
              <p className="text-sm font-medium">
                {payroll.employeeNumber || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                NI Number
              </p>
              <p className="text-sm font-medium">
                {payroll.niNumber ? maskValue(payroll.niNumber, 4) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Bank Name
              </p>
              <p className="text-sm font-medium">{payroll.bankName || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Account Holder
              </p>
              <p className="text-sm font-medium">
                {payroll.accountHolder || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Sort Code
              </p>
              <p className="text-sm font-medium">
                {payroll.sortCode ? maskValue(payroll.sortCode, 4) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Account Number
              </p>
              <p className="text-sm font-medium">
                {payroll.accountNumber
                  ? maskValue(payroll.accountNumber, 4)
                  : "—"}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Pay Rates ── */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3">
          Pay Rates
        </h3>
        <PayRatesCard employeeId={employeeId} employeeStatus={employeeStatus} />
      </div>
    </div>
  );
}
