import { useState } from "react";
import {
  useListEmployeeQualifications,
  useCreateEmployeeQualification,
  useUpdateEmployeeQualification,
  useDeleteEmployeeQualification,
  getListEmployeeQualificationsQueryKey,
} from "@workspace/api-client-react";
import type { EmployeeQualification } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, GraduationCap } from "lucide-react";

interface Props {
  employeeId: number;
}

interface FormData {
  title: string;
  institution: string;
  yearObtained: string;
  notes: string;
}

const defaultForm: FormData = { title: "", institution: "", yearObtained: "", notes: "" };

export default function EmployeeQualificationsTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmployeeQualification | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const { data: records, isLoading } = useListEmployeeQualifications(employeeId);
  const createQual = useCreateEmployeeQualification();
  const updateQual = useUpdateEmployeeQualification();
  const deleteQual = useDeleteEmployeeQualification();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEmployeeQualificationsQueryKey(employeeId) });

  const openAdd = () => {
    setEditingRecord(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (record: EmployeeQualification) => {
    setEditingRecord(record);
    setForm({
      title: record.title,
      institution: record.institution || "",
      yearObtained: record.yearObtained?.toString() || "",
      notes: record.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const yearObtained = form.yearObtained ? parseInt(form.yearObtained, 10) : undefined;

    if (editingRecord) {
      updateQual.mutate(
        {
          id: employeeId,
          qualId: editingRecord.id,
          data: {
            title: form.title,
            institution: form.institution || null,
            yearObtained: yearObtained ?? null,
            notes: form.notes || null,
          },
        },
        {
          onSuccess: () => { toast({ title: "Qualification updated" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        }
      );
    } else {
      createQual.mutate(
        {
          id: employeeId,
          data: {
            title: form.title,
            institution: form.institution || undefined,
            yearObtained,
            notes: form.notes || undefined,
          },
        },
        {
          onSuccess: () => { toast({ title: "Qualification added" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Failed to add", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = (qualificationId: number) => {
    deleteQual.mutate(
      { id: employeeId, qualId: qualificationId },
      {
        onSuccess: () => { toast({ title: "Qualification removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  const isSaving = createQual.isPending || updateQual.isPending;

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Qualifications</h3>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      {!records || records.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No qualifications on record</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="border border-border/50 rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{record.title}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                    {record.institution && <span>{record.institution}</span>}
                    {record.yearObtained && <span>· {record.yearObtained}</span>}
                  </div>
                  {record.notes && <p className="text-xs text-muted-foreground mt-2 italic">{record.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(record)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this qualification?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(record.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit Qualification" : "Add Qualification"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Title *</Label>
              <Input className="mt-1" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Bachelor of Science, CIPD Level 5..." />
            </div>
            <div>
              <Label>Institution</Label>
              <Input className="mt-1" value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} placeholder="University name" />
            </div>
            <div>
              <Label>Year Obtained</Label>
              <Input className="mt-1" type="number" value={form.yearObtained} onChange={e => setForm(f => ({ ...f, yearObtained: e.target.value }))} placeholder="2020" min="1900" max="2100" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional details..." />
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
