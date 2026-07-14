import { useState, useEffect } from "react";
import {
  useGetEmployeePayroll,
  useUpsertEmployeePayroll,
  getGetEmployeePayrollQueryKey,
} from "@workspace/api-client-react";
import type { EmployeePayrollInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Save, X, CreditCard } from "lucide-react";
import TabErrorState from "@/components/TabErrorState";

interface Props {
  employeeId: number;
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

function maskValue(value: string | null | undefined, showLastN = 4): string {
  if (!value) return "—";
  if (value.length <= showLastN) return value;
  return "•".repeat(value.length - showLastN) + value.slice(-showLastN);
}

export default function EmployeePayrollTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormData>(defaultForm);

  const { data: payroll, isLoading, isError, error, refetch } = useGetEmployeePayroll(employeeId, {
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
          queryClient.setQueryData(getGetEmployeePayrollQueryKey(employeeId), data);
          setIsEditing(false);
        },
        onError: () => toast({ title: "Failed to save payroll information", variant: "destructive" }),
      }
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
    return <TabErrorState onRetry={refetch} message="Could not load payroll information. Check your connection and try again." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Payroll Information</h3>
        {!isEditing ? (
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
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
            }}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {!payroll && !isEditing && (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm mb-3">No payroll information on record</p>
          <Button size="sm" onClick={() => setIsEditing(true)}><Pencil className="w-4 h-4 mr-1" /> Add Details</Button>
        </div>
      )}

      {isEditing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border border-border/50 rounded-lg p-5 bg-card">
          <div>
            <Label>Employee Number</Label>
            <Input className="mt-1" value={form.employeeNumber} onChange={e => setForm(f => ({ ...f, employeeNumber: e.target.value }))} placeholder="EMP001" />
          </div>
          <div>
            <Label>NI Number</Label>
            <Input className="mt-1" value={form.niNumber} onChange={e => setForm(f => ({ ...f, niNumber: e.target.value }))} placeholder="AB 12 34 56 C" />
          </div>
          <div>
            <Label>Bank Name</Label>
            <Input className="mt-1" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="Barclays" />
          </div>
          <div>
            <Label>Account Holder</Label>
            <Input className="mt-1" value={form.accountHolder} onChange={e => setForm(f => ({ ...f, accountHolder: e.target.value }))} placeholder="Full name on account" />
          </div>
          <div>
            <Label>Sort Code</Label>
            <Input className="mt-1" value={form.sortCode} onChange={e => setForm(f => ({ ...f, sortCode: e.target.value }))} placeholder="00-00-00" />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input className="mt-1" value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="12345678" />
          </div>
        </div>
      ) : payroll ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12 border border-border/50 rounded-lg p-5 bg-card">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Employee Number</p>
            <p className="text-sm font-medium">{payroll.employeeNumber || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">NI Number</p>
            <p className="text-sm font-medium">{payroll.niNumber ? maskValue(payroll.niNumber, 4) : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Bank Name</p>
            <p className="text-sm font-medium">{payroll.bankName || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Account Holder</p>
            <p className="text-sm font-medium">{payroll.accountHolder || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Sort Code</p>
            <p className="text-sm font-medium">{payroll.sortCode ? maskValue(payroll.sortCode, 4) : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Account Number</p>
            <p className="text-sm font-medium">{payroll.accountNumber ? maskValue(payroll.accountNumber, 4) : "—"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
