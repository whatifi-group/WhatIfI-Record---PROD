import { useState } from "react";
import {
  useListEmployees,
  useListEmployeePayRates,
  useCopyEmployeePayRates,
  getListEmployeesQueryKey,
  getListEmployeePayRatesQueryKey,
} from "@workspace/api-client-react";
import type { Employee, CopyPayRateSkip } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Copy, CheckCircle2, SkipForward, AlertTriangle } from "lucide-react";

const RATE_UNIT_LABELS: Record<string, string> = {
  hourly: "Hourly",
  daily: "Daily",
  flat: "Flat",
};

/** Human-readable labels for each skip reason code. */
const SKIP_REASON_LABELS: Record<CopyPayRateSkip["reason"], string> = {
  source_closed: "Rate has already ended on source",
  lov_inactive: "Shift type has been deactivated",
  conflict: "Target already has an active rate for this type",
  overlap_on_target: "Would create a conflicting overlap on the target",
};

interface Props {
  open: boolean;
  onClose: () => void;
  targetEmployeeId: number;
}

interface CopyResult {
  copiedCount: number;
  skipped: CopyPayRateSkip[];
}

export default function CopyPayRatesDialog({ open, onClose, targetEmployeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);

  // Search employees — debounceable, but immediate is fine for small lists
  const searchParams = search.trim().length > 0 ? { search: search.trim() } : undefined;
  const { data: employees = [], isLoading: searching } = useListEmployees(searchParams, {
    query: {
      enabled: search.trim().length > 0,
      queryKey: getListEmployeesQueryKey(searchParams),
    },
  });

  // Preview the source employee's rates once selected
  const { data: sourceRates = [], isLoading: loadingRates } = useListEmployeePayRates(
    selectedEmployee?.id ?? 0,
    {
      query: {
        enabled: !!selectedEmployee,
        queryKey: getListEmployeePayRatesQueryKey(selectedEmployee?.id ?? 0),
      },
    },
  );

  const copyMutation = useCopyEmployeePayRates();

  const filteredEmployees = employees.filter((e) => e.id !== targetEmployeeId);

  const handleConfirm = () => {
    if (!selectedEmployee) return;
    copyMutation.mutate(
      { id: targetEmployeeId, sourceId: selectedEmployee.id },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({
            queryKey: getListEmployeePayRatesQueryKey(targetEmployeeId),
          });
          setCopyResult({ copiedCount: result.copied.length, skipped: result.skipped });
          if (result.skipped.length === 0) {
            toast({ title: `${result.copied.length} rate${result.copied.length !== 1 ? "s" : ""} copied` });
          }
        },
        onError: () =>
          toast({ title: "Failed to copy pay rates", variant: "destructive" }),
      },
    );
  };

  const handleClose = () => {
    setSearch("");
    setSelectedEmployee(null);
    setCopyResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-4 h-4" /> Copy Pay Rates From Employee
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Step 3: Result ─────────────────────────────────────────── */}
          {copyResult && (
            <div className="space-y-3">
              {/* Copied summary */}
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span className="font-medium">
                  {copyResult.copiedCount} rate{copyResult.copiedCount !== 1 ? "s" : ""} copied
                  {copyResult.skipped.length > 0
                    ? `, ${copyResult.skipped.length} skipped`
                    : ""}
                </span>
              </div>

              {/* Skipped details */}
              {copyResult.skipped.length > 0 && (
                <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                  <div className="px-3 py-2 flex items-center gap-1.5 bg-muted/30">
                    <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Skipped — action may be needed
                    </p>
                  </div>
                  {copyResult.skipped.map((s) => (
                    <div key={s.shiftType} className="px-3 py-2.5 flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="font-medium capitalize">
                          {s.shiftType.replace(/_/g, " ")}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {SKIP_REASON_LABELS[s.reason] ?? s.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Search ─────────────────────────────────────────── */}
          {!copyResult && !selectedEmployee && (
            <>
              <p className="text-sm text-muted-foreground">
                Search for an employee to copy their pay rates from.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {searching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}

              {!searching && search.trim().length > 0 && filteredEmployees.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">
                  No employees found.
                </p>
              )}

              {filteredEmployees.length > 0 && (
                <div className="border border-border/50 rounded-lg divide-y divide-border/50 max-h-56 overflow-y-auto">
                  {filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors text-sm"
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setSearch("");
                      }}
                    >
                      <span className="font-medium text-foreground">
                        {emp.firstName} {emp.lastName}
                      </span>
                      <span className="ml-2 text-muted-foreground">{emp.jobTitle}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Preview & confirm ──────────────────────────────── */}
          {!copyResult && selectedEmployee && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedEmployee.jobTitle}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedEmployee(null)}
                  className="text-xs"
                >
                  Change
                </Button>
              </div>

              {loadingRates ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : sourceRates.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-6">
                  This employee has no pay rates to copy.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    The following {sourceRates.length} rate
                    {sourceRates.length !== 1 ? "s" : ""} will be copied. Any shift
                    types that already exist on this employee will be skipped.
                  </p>
                  <div className="border border-border/50 rounded-lg divide-y divide-border/50 max-h-48 overflow-y-auto">
                    {sourceRates.map((r) => (
                      <div
                        key={r.id}
                        className="px-4 py-2.5 flex items-center justify-between text-sm"
                      >
                        <span className="font-medium capitalize">
                          {r.shiftType.replace(/_/g, " ")}
                        </span>
                        <span className="font-mono text-foreground">
                          £{Number(r.rate).toFixed(2)}
                          <span className="ml-1 text-xs text-muted-foreground font-sans">
                            / {RATE_UNIT_LABELS[r.rateUnit] ?? r.rateUnit}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {copyResult ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={copyMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  !selectedEmployee ||
                  sourceRates.length === 0 ||
                  loadingRates ||
                  copyMutation.isPending
                }
              >
                {copyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Copy Rates
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
