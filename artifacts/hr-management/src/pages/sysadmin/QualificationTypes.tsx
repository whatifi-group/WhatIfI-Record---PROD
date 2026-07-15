import { useState } from "react";
import { Link } from "wouter";
import {
  useListQualificationTypes,
  useCreateQualificationType,
  useUpdateQualificationType,
  useDeleteQualificationType,
  getListQualificationTypesQueryKey,
} from "@workspace/api-client-react";
import type { QualificationType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, GraduationCap, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CsvImportDialog } from "@/components/sysadmin/CsvImportDialog";

interface FormData {
  name: string;
  awardingBody: string;
  validityValue: string;
  validityUnit: string;
  isActive: boolean;
}

const defaultForm: FormData = {
  name: "",
  awardingBody: "",
  validityValue: "",
  validityUnit: "",
  isActive: true,
};

export default function QualificationTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<QualificationType | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const { data: types, isLoading } = useListQualificationTypes();
  const createType = useCreateQualificationType();
  const updateType = useUpdateQualificationType();
  const deleteType = useDeleteQualificationType();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListQualificationTypesQueryKey() });

  const openAdd = () => {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (item: QualificationType) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      awardingBody: item.awardingBody ?? "",
      validityValue: item.validityValue?.toString() ?? "",
      validityUnit: item.validityUnit ?? "",
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const validityValue = form.validityValue ? parseInt(form.validityValue, 10) : undefined;
    const payload = {
      name: form.name.trim(),
      awardingBody: form.awardingBody.trim() || undefined,
      validityValue: validityValue && !isNaN(validityValue) ? validityValue : undefined,
      validityUnit: (form.validityUnit || undefined) as "days" | "months" | "years" | undefined,
      isActive: form.isActive,
    };

    if (editingItem) {
      updateType.mutate(
        { id: editingItem.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Qualification type updated" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        },
      );
    } else {
      createType.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Qualification type created" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to create", variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (deletingId === null) return;
    deleteType.mutate(
      { id: deletingId },
      {
        onSuccess: () => {
          toast({ title: "Qualification type deleted" });
          invalidate();
          setDeletingId(null);
        },
        onError: () => {
          toast({ title: "Failed to delete", variant: "destructive" });
          setDeletingId(null);
        },
      },
    );
  };

  const isSaving = createType.isPending || updateType.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <Link
        href="/sysadmin"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to SysAdmin
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
              Qualification Types
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Define qualifications employees can hold, including validity periods.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => setCsvImportOpen(true)} className="gap-2">
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" /> Add Type
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Awarding Body</th>
                  <th className="px-6 py-4 font-semibold">Validity</th>
                  <th className="px-6 py-4 font-semibold w-[120px]">Status</th>
                  <th className="px-6 py-4 font-semibold text-right w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {!types || types.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-muted-foreground text-sm"
                    >
                      No qualification types yet. Click "Add Type" to get started.
                    </td>
                  </tr>
                ) : (
                  types.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/20 transition-colors ${!item.isActive ? "opacity-60" : ""}`}
                    >
                      <td className="px-6 py-3 align-middle font-medium text-foreground">
                        {item.name}
                      </td>
                      <td className="px-6 py-3 align-middle text-muted-foreground">
                        {item.awardingBody ?? <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="px-6 py-3 align-middle text-muted-foreground">
                        {item.validityValue && item.validityUnit ? (
                          `${item.validityValue} ${item.validityUnit}`
                        ) : (
                          <span className="italic opacity-50">No expiry</span>
                        )}
                      </td>
                      <td className="px-6 py-3 align-middle">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border shadow-sm ${
                            item.isActive
                              ? "bg-secondary/10 text-secondary border-secondary/20"
                              : "bg-muted text-muted-foreground border-border/50"
                          }`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-3 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingId(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Qualification Type" : "Add Qualification Type"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Name *</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. First Aid Certificate"
              />
            </div>
            <div>
              <Label>Awarding Body</Label>
              <Input
                className="mt-1"
                value={form.awardingBody}
                onChange={(e) => setForm((f) => ({ ...f, awardingBody: e.target.value }))}
                placeholder="e.g. British Red Cross"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Validity Period</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="1"
                  value={form.validityValue}
                  onChange={(e) => setForm((f) => ({ ...f, validityValue: e.target.value }))}
                  placeholder="e.g. 3"
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Select
                  value={form.validityUnit}
                  onValueChange={(v) => setForm((f) => ({ ...f, validityUnit: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="years">Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <Label className="text-base">Active</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingItem ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import */}
      <CsvImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        onImported={invalidate}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this qualification type?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Existing qualification records that reference this type
              will be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
