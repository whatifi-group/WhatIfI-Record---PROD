import { useState } from "react";
import {
  useListEmployeeWorkRecords,
  useCreateEmployeeWorkRecord,
  useUpdateEmployeeWorkRecord,
  useDeleteEmployeeWorkRecord,
  getListEmployeeWorkRecordsQueryKey,
  useListLovItems,
} from "@workspace/api-client-react";
import type { EmployeeWorkRecord } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Clock } from "lucide-react";
import TabErrorState from "@/components/TabErrorState";
import { format } from "date-fns";


interface Props {
  employeeId: number;
}

interface FormData {
  shiftDate: string;
  startTime: string;
  endTime: string;
  hoursWorked: string;
  shiftType: string;
  notes: string;
}

const defaultForm: FormData = {
  shiftDate: new Date().toISOString().split("T")[0],
  startTime: "",
  endTime: "",
  hoursWorked: "",
  shiftType: "regular",
  notes: "",
};

const shiftTypeColor: Record<string, string> = {
  regular: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  overtime: "bg-amber-100 text-amber-800 border-amber-200",
  night: "bg-indigo-100 text-indigo-800 border-indigo-200",
  weekend: "bg-purple-100 text-purple-800 border-purple-200",
  holiday: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "on-call": "bg-orange-100 text-orange-800 border-orange-200",
  other: "bg-muted text-muted-foreground border-border",
};

export default function EmployeeWorkRecordsTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmployeeWorkRecord | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const { data: records, isLoading, isError, refetch } = useListEmployeeWorkRecords(employeeId);
  const { data: shiftTypes } = useListLovItems("shift_type");
  const createRecord = useCreateEmployeeWorkRecord();
  const updateRecord = useUpdateEmployeeWorkRecord();
  const deleteRecord = useDeleteEmployeeWorkRecord();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEmployeeWorkRecordsQueryKey(employeeId) });

  const openAdd = () => {
    setEditingRecord(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (record: EmployeeWorkRecord) => {
    setEditingRecord(record);
    setForm({
      shiftDate: record.shiftDate.split("T")[0],
      startTime: record.startTime || "",
      endTime: record.endTime || "",
      hoursWorked: record.hoursWorked?.toString() || "",
      shiftType: record.shiftType || "regular",
      notes: record.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.shiftDate) {
      toast({ title: "Shift date is required", variant: "destructive" });
      return;
    }
    const hoursWorked = form.hoursWorked ? parseFloat(form.hoursWorked) : undefined;

    if (editingRecord) {
      updateRecord.mutate(
        {
          id: employeeId,
          recordId: editingRecord.id,
          data: {
            shiftDate: form.shiftDate,
            startTime: form.startTime || null,
            endTime: form.endTime || null,
            hoursWorked: hoursWorked ?? null,
            shiftType: form.shiftType,
            notes: form.notes || null,
          },
        },
        {
          onSuccess: () => { toast({ title: "Work record updated" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        }
      );
    } else {
      createRecord.mutate(
        {
          id: employeeId,
          data: {
            shiftDate: form.shiftDate,
            startTime: form.startTime || undefined,
            endTime: form.endTime || undefined,
            hoursWorked,
            shiftType: form.shiftType,
            notes: form.notes || undefined,
          },
        },
        {
          onSuccess: () => { toast({ title: "Work record added" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Failed to add", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = (workRecordId: number) => {
    deleteRecord.mutate(
      { id: employeeId, recordId: workRecordId },
      {
        onSuccess: () => { toast({ title: "Work record removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  const isSaving = createRecord.isPending || updateRecord.isPending;

  const sortedRecords = records
    ? [...records].sort((a, b) => new Date(b.shiftDate).getTime() - new Date(a.shiftDate).getTime())
    : [];

  const totalHours = sortedRecords.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return <TabErrorState onRetry={refetch} message="Could not load work records. Check your connection and try again." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Work Record</h3>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Entry</Button>
      </div>

      {sortedRecords.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No work records on file</p>
        </div>
      ) : (
        <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>Date</TableHead>
                <TableHead>Shift Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecords.map((record) => (
                <TableRow key={record.id} className="border-border/30">
                  <TableCell className="text-sm font-medium whitespace-nowrap">
                    {format(new Date(record.shiftDate), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${shiftTypeColor[record.shiftType] || shiftTypeColor.other}`}
                    >
                      {shiftTypes?.find(t => t.value === record.shiftType)?.label ?? record.shiftType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{record.startTime || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{record.endTime || "—"}</TableCell>
                  <TableCell className="text-sm font-medium">{record.hoursWorked != null ? record.hoursWorked : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                    {record.notes || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(record)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(record.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex justify-end">
            <span className="text-sm text-muted-foreground">
              Total hours: <span className="font-semibold text-foreground">{totalHours.toFixed(1)}</span>
            </span>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit Work Record" : "Add Work Record"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="col-span-2">
              <Label>Date *</Label>
              <DatePicker className="mt-1" value={form.shiftDate} onChange={value => setForm(f => ({ ...f, shiftDate: value }))} />
            </div>
            <div className="col-span-2">
              <Label>Shift Type</Label>
              <Select value={form.shiftType} onValueChange={(v) => setForm(f => ({ ...f, shiftType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {shiftTypes?.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Time</Label>
              <Input className="mt-1" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <Label>End Time</Label>
              <Input className="mt-1" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Hours Worked</Label>
              <Input className="mt-1" type="number" step="0.5" min="0" value={form.hoursWorked} onChange={e => setForm(f => ({ ...f, hoursWorked: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRecord ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
