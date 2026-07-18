import { useState } from "react";
import { format } from "date-fns";
import {
  useListEmployeeServicePeriods,
  useCreateEmployeeServicePeriod,
  useUpdateEmployeeServicePeriod,
  useDeleteEmployeeServicePeriod,
  getListEmployeeServicePeriodsQueryKey,
  type EmployeeServicePeriod,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  CalendarDays,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PeriodFormValues {
  startDate: string;
  endDate: string;
  endReason: string;
  notes: string;
}

const emptyForm = (): PeriodFormValues => ({
  startDate: "",
  endDate: "",
  endReason: "",
  notes: "",
});

function periodFromRow(row: EmployeeServicePeriod): PeriodFormValues {
  return {
    startDate: row.startDate ? String(row.startDate).slice(0, 10) : "",
    endDate: row.endDate ? String(row.endDate).slice(0, 10) : "",
    endReason: row.endReason ?? "",
    notes: row.notes ?? "",
  };
}

function formatDate(val: string | Date | null | undefined): string {
  if (!val) return "Present";
  const str = typeof val === "string" ? val : val.toISOString();
  try {
    return format(new Date(str.slice(0, 10) + "T00:00:00"), "dd/MM/yyyy");
  } catch {
    return String(val);
  }
}

interface Props {
  employeeId: number;
  canEdit: boolean;
}

export default function EmployeeServiceHistoryTab({ employeeId, canEdit }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: periods, isLoading } = useListEmployeeServicePeriods(employeeId);

  const createMutation = useCreateEmployeeServicePeriod();
  const updateMutation = useUpdateEmployeeServicePeriod();
  const deleteMutation = useDeleteEmployeeServicePeriod();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<PeriodFormValues>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PeriodFormValues>(emptyForm());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListEmployeeServicePeriodsQueryKey(employeeId) });

  const handleAdd = () => {
    if (!addForm.startDate) {
      toast({ title: "Start date required", variant: "destructive" });
      return;
    }
    if (addForm.endDate && addForm.endDate <= addForm.startDate) {
      toast({ title: "End date must be after start date", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      {
        id: employeeId,
        data: {
          startDate: addForm.startDate,
          endDate: addForm.endDate || null,
          endReason: addForm.endReason || null,
          notes: addForm.notes || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Service period added" });
          setShowAddForm(false);
          setAddForm(emptyForm());
          invalidate();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not add service period";
          toast({ title: "Failed to add period", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const startEdit = (row: EmployeeServicePeriod) => {
    setEditingId(row.id);
    setEditForm(periodFromRow(row));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm());
  };

  const handleSaveEdit = (periodId: number) => {
    if (!editForm.startDate) {
      toast({ title: "Start date required", variant: "destructive" });
      return;
    }
    if (editForm.endDate && editForm.endDate <= editForm.startDate) {
      toast({ title: "End date must be after start date", variant: "destructive" });
      return;
    }
    updateMutation.mutate(
      {
        id: employeeId,
        periodId,
        data: {
          startDate: editForm.startDate,
          endDate: editForm.endDate || null,
          endReason: editForm.endReason || null,
          notes: editForm.notes || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Service period updated" });
          cancelEdit();
          invalidate();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not update service period";
          toast({ title: "Update failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const handleDelete = (periodId: number) => {
    deleteMutation.mutate(
      { id: employeeId, periodId },
      {
        onSuccess: () => {
          toast({ title: "Service period deleted" });
          invalidate();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not delete service period";
          toast({ title: "Delete failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  // Sort periods reverse-chronological (most recent first)
  const sorted = [...(periods ?? [])].sort((a, b) => {
    const aStr = typeof a.startDate === "string" ? a.startDate : String(a.startDate ?? "");
    const bStr = typeof b.startDate === "string" ? b.startDate : String(b.startDate ?? "");
    return bStr.localeCompare(aStr);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Employment History</h3>
        {canEdit && !showAddForm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowAddForm(true);
              setAddForm(emptyForm());
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Period
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card className="border-primary/30 bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-foreground mb-3">New Service Period</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="add-start">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  id="add-start"
                  value={addForm.startDate}
                  onChange={(value) => setAddForm((f) => ({ ...f, startDate: value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-end">End Date</Label>
                <DatePicker
                  id="add-end"
                  value={addForm.endDate}
                  onChange={(value) => setAddForm((f) => ({ ...f, endDate: value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-reason">End Reason</Label>
                <Input
                  id="add-reason"

                  value={addForm.endReason}
                  onChange={(e) => setAddForm((f) => ({ ...f, endReason: e.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="add-notes">Notes</Label>
                <Textarea
                  id="add-notes"
                  rows={2}

                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowAddForm(false); setAddForm(emptyForm()); }}
                disabled={createMutation.isPending}
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period rows */}
      {sorted.length === 0 && !showAddForm && (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No service periods recorded.
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((period) => (
          <Card key={period.id} className="border-border/50">
            <CardContent className="pt-4 pb-4">
              {editingId === period.id ? (
                /* Edit form */
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`edit-start-${period.id}`}>
                        Start Date <span className="text-destructive">*</span>
                      </Label>
                      <DatePicker
                        id={`edit-start-${period.id}`}
                        value={editForm.startDate}
                        onChange={(value) => setEditForm((f) => ({ ...f, startDate: value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`edit-end-${period.id}`}>End Date</Label>
                      <DatePicker
                        id={`edit-end-${period.id}`}
                        value={editForm.endDate}
                        onChange={(value) => setEditForm((f) => ({ ...f, endDate: value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`edit-reason-${period.id}`}>End Reason</Label>
                      <Input
                        id={`edit-reason-${period.id}`}

                        value={editForm.endReason}
                        onChange={(e) => setEditForm((f) => ({ ...f, endReason: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`edit-notes-${period.id}`}>Notes</Label>
                      <Textarea
                        id={`edit-notes-${period.id}`}
                        rows={2}
                        value={editForm.notes}
                        onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={cancelEdit}
                      disabled={updateMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(period.id)}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-1" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                /* Read-only row */
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatDate(period.startDate as string)} &rarr;{" "}
                        {formatDate(period.endDate as string | null)}
                      </p>
                      {period.endReason && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Reason: {period.endReason}
                        </p>
                      )}
                      {period.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                          {period.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(period)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this service period?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the period starting{" "}
                              {formatDate(period.startDate as string)}. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(period.id)}
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
