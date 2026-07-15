/**
 * ProfileCompletionModal
 *
 * Shown immediately after an onboarding submission is approved.
 * HR can fill in Employment Details and Payroll Details for the new employee
 * before navigating away.  All fields are optional — "Skip for now" leaves
 * the form untouched.
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  User,
  CreditCard,
  ArrowRight,
  X,
} from "lucide-react";
import { useListDepartments } from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  /** The newly created employee's ID. */
  employeeId: number;
  /** Temporary password generated at approval time. */
  tempPassword: string;
  /**
   * Called when the modal closes.
   * @param navigateToProfile  true  → caller should navigate to /employees/:id
   *                           false → return to queue
   */
  onClose: (navigateToProfile: boolean) => void;
}

interface EmploymentForm {
  jobTitle: string;
  departmentId: string;
  employmentType: string;
}

interface PayrollForm {
  employeeNumber: string;
  niNumber: string;
  bankName: string;
  accountHolder: string;
  sortCode: string;
  accountNumber: string;
}

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "apprentice", label: "Apprentice" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfileCompletionModal({
  employeeId,
  tempPassword,
  onClose,
}: Props) {
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [employment, setEmployment] = useState<EmploymentForm>({
    jobTitle: "",
    departmentId: "",
    employmentType: "",
  });

  const [payroll, setPayroll] = useState<PayrollForm>({
    employeeNumber: "",
    niNumber: "",
    bankName: "",
    accountHolder: "",
    sortCode: "",
    accountNumber: "",
  });

  const { data: departments = [] } = useListDepartments();

  function copyPassword() {
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    });
  }

  function patchEmployment(patch: Partial<EmploymentForm>) {
    setEmployment((f) => ({ ...f, ...patch }));
  }

  function patchPayroll(patch: Partial<PayrollForm>) {
    setPayroll((f) => ({ ...f, ...patch }));
  }

  /** Returns true if there is anything non-empty to save. */
  function hasData(): boolean {
    return (
      Object.values(employment).some((v) => v.trim() !== "") ||
      Object.values(payroll).some((v) => v.trim() !== "")
    );
  }

  async function save(navigateToProfile: boolean) {
    setSaving(true);
    setSaveError("");
    try {
      const employmentPayload: Record<string, unknown> = {};
      if (employment.jobTitle.trim())
        employmentPayload.jobTitle = employment.jobTitle.trim();
      if (employment.departmentId)
        employmentPayload.departmentId = parseInt(employment.departmentId, 10);
      if (employment.employmentType)
        employmentPayload.employmentType = employment.employmentType;

      const payrollPayload: Record<string, unknown> = {};
      if (payroll.employeeNumber.trim())
        payrollPayload.employeeNumber = payroll.employeeNumber.trim();
      if (payroll.niNumber.trim())
        payrollPayload.niNumber = payroll.niNumber.trim();
      if (payroll.bankName.trim())
        payrollPayload.bankName = payroll.bankName.trim();
      if (payroll.accountHolder.trim())
        payrollPayload.accountHolder = payroll.accountHolder.trim();
      if (payroll.sortCode.trim())
        payrollPayload.sortCode = payroll.sortCode.trim();
      if (payroll.accountNumber.trim())
        payrollPayload.accountNumber = payroll.accountNumber.trim();

      const requests: Promise<Response>[] = [];

      if (Object.keys(employmentPayload).length > 0) {
        requests.push(
          fetch(`/api/hr/employees/${employeeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(employmentPayload),
          }),
        );
      }

      if (Object.keys(payrollPayload).length > 0) {
        requests.push(
          fetch(`/api/hr/employees/${employeeId}/payroll`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payrollPayload),
          }),
        );
      }

      const responses = await Promise.all(requests);
      for (const res of responses) {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to save profile details.");
        }
      }

      onClose(navigateToProfile);
    } catch (err: any) {
      setSaveError(err.message ?? "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(false); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Account Created — Complete Profile
          </DialogTitle>
          <DialogDescription>
            All fields are optional. You can fill them now or skip and update the
            employee's profile later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ── Temporary Password ───────────────────────────────────────── */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
            <p className="text-sm font-medium text-emerald-800">Temporary Password</p>
            <p className="text-xs text-emerald-700">
              Share this securely with the new employee. They'll be prompted to
              change it on first login.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm bg-white rounded px-3 py-1.5 border border-emerald-200 text-emerald-900">
                {tempPassword}
              </code>
              <Button size="sm" variant="outline" onClick={copyPassword} className="shrink-0">
                {copiedPassword ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* ── Employment Details ───────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border/50">
              <User className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Employment Details</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs">Job Title</Label>
                <Input
                  className="mt-1"

                  value={employment.jobTitle}
                  onChange={(e) => patchEmployment({ jobTitle: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={employment.departmentId}
                  onChange={(e) => patchEmployment({ departmentId: e.target.value })}
                >
                  <option value="">Select department…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id.toString()}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Employment Type</Label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={employment.employmentType}
                  onChange={(e) => patchEmployment({ employmentType: e.target.value })}
                >
                  <option value="">Select type…</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Payroll Details ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border/50">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Payroll Details</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Employee Number</Label>
                <Input
                  className="mt-1"

                  value={payroll.employeeNumber}
                  onChange={(e) => patchPayroll({ employeeNumber: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">NI Number</Label>
                <Input
                  className="mt-1"

                  value={payroll.niNumber}
                  onChange={(e) => patchPayroll({ niNumber: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Bank Name</Label>
                <Input
                  className="mt-1"

                  value={payroll.bankName}
                  onChange={(e) => patchPayroll({ bankName: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Account Holder Name</Label>
                <Input
                  className="mt-1"

                  value={payroll.accountHolder}
                  onChange={(e) => patchPayroll({ accountHolder: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Sort Code</Label>
                <Input
                  className="mt-1"

                  value={payroll.sortCode}
                  onChange={(e) => patchPayroll({ sortCode: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Account Number</Label>
                <Input
                  className="mt-1"

                  value={payroll.accountNumber}
                  onChange={(e) => patchPayroll({ accountNumber: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* ── Error ────────────────────────────────────────────────────── */}
          {saveError && (
            <p className="text-sm text-destructive">{saveError}</p>
          )}

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => save(true)}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                Save &amp; Go to Profile
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => save(false)}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save &amp; Close
              </Button>
            </div>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline text-center py-1 transition-colors"
              onClick={() => onClose(false)}
              disabled={saving}
            >
              Skip for now
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
