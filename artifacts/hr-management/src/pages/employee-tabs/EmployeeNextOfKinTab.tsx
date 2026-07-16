import { useState } from "react";
import {
  useListEmployeeNextOfKin,
  useCreateEmployeeNextOfKin,
  useUpdateEmployeeNextOfKin,
  useDeleteEmployeeNextOfKin,
  getListEmployeeNextOfKinQueryKey,
  useListKinPhones,
} from "@workspace/api-client-react";
import type { EmployeeNextOfKin, PhoneLabel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Users, X } from "lucide-react";
import TabErrorState from "@/components/TabErrorState";
import { KinPhoneList } from "@/components/PhoneList";

interface Props {
  employeeId: number;
}

interface FormData {
  name: string;
  relationship: string;
  email: string;
  address: string;
}

interface DraftPhone {
  number: string;
  label: PhoneLabel;
  isPrimary: boolean;
}

const PHONE_LABELS: PhoneLabel[] = ["Mobile", "Home", "Work", "Other"];

const defaultForm: FormData = { name: "", relationship: "", email: "", address: "" };

const blankDraftPhone = (): DraftPhone => ({ number: "", label: "Mobile", isPrimary: false });

// Small component to fetch and display the primary phone for a kin card
function KinPrimaryPhone({ employeeId, kinId }: { employeeId: number; kinId: number }) {
  const { data: phones = [] } = useListKinPhones(employeeId, kinId);
  const primary = phones.find((p) => p.isPrimary) ?? phones[0] ?? null;
  if (!primary) return null;
  return <span>📞 {primary.number}</span>;
}

export default function EmployeeNextOfKinTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmployeeNextOfKin | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  // Draft phones for the Add flow only
  const [draftPhones, setDraftPhones] = useState<DraftPhone[]>([]);

  const { data: records, isLoading, isError, refetch } = useListEmployeeNextOfKin(employeeId);
  const createNok = useCreateEmployeeNextOfKin();
  const updateNok = useUpdateEmployeeNextOfKin();
  const deleteNok = useDeleteEmployeeNextOfKin();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEmployeeNextOfKinQueryKey(employeeId) });

  const openAdd = () => {
    setEditingRecord(null);
    setForm(defaultForm);
    setDraftPhones([]);
    setDialogOpen(true);
  };

  const openEdit = (record: EmployeeNextOfKin) => {
    setEditingRecord(record);
    setDraftPhones([]); // edit flow doesn't use draft phones
    setForm({
      name: record.name,
      relationship: record.relationship || "",
      email: record.email || "",
      address: record.address || "",
    });
    setDialogOpen(true);
  };

  // Add a blank draft phone row
  const addDraftPhone = () => setDraftPhones((prev) => [...prev, blankDraftPhone()]);

  const updateDraftPhone = (idx: number, patch: Partial<DraftPhone>) =>
    setDraftPhones((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const removeDraftPhone = (idx: number) =>
    setDraftPhones((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    // Validate draft phones — no empty numbers (add flow only)
    if (!editingRecord && draftPhones.some((p) => !p.number.trim())) {
      toast({ title: "All phone number fields must be filled in", variant: "destructive" });
      return;
    }

    if (editingRecord) {
      // Edit flow — just update the kin record; phones managed via embedded KinPhoneList
      updateNok.mutate(
        {
          id: employeeId,
          kinId: editingRecord.id,
          data: {
            name: form.name,
            relationship: form.relationship || null,
            email: form.email || null,
            address: form.address || null,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Next of kin updated" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        }
      );
    } else {
      // Add flow — create kin and phones atomically in a single request
      createNok.mutate(
        {
          id: employeeId,
          data: {
            name: form.name,
            relationship: form.relationship || undefined,
            email: form.email || undefined,
            address: form.address || undefined,
            phones: draftPhones,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Next of kin added" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to add", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = (nokId: number) => {
    deleteNok.mutate(
      { id: employeeId, kinId: nokId },
      {
        onSuccess: () => { toast({ title: "Record removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  const isSaving = createNok.isPending || updateNok.isPending;

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return <TabErrorState onRetry={refetch} message="Could not load next of kin records. Check your connection and try again." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Next of Kin</h3>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      {!records || records.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No next of kin on record</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="border border-border/50 rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{record.name}</p>
                  {record.relationship && <p className="text-xs text-muted-foreground mt-0.5 capitalize">{record.relationship}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    {record.email && <span>✉ {record.email}</span>}
                    {record.address && <span>📍 {record.address}</span>}
                    <KinPrimaryPhone employeeId={employeeId} kinId={record.id} />
                  </div>
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
                        <AlertDialogTitle>Remove {record.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This will also remove all their phone numbers and cannot be undone.</AlertDialogDescription>
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!isSaving) { setDialogOpen(open); if (!open) setDraftPhones([]); } }}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit Next of Kin" : "Add Next of Kin"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Name *</Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Relationship</Label>
              <Input className="mt-1" value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Address</Label>
              <Input className="mt-1" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>

            {/* Phone numbers section */}
            <div className="space-y-2">
              <Label>Phone Numbers</Label>
              {editingRecord ? (
                // Edit flow: embed live KinPhoneList
                <div className="mt-1 rounded-md border border-border/50 p-3">
                  <KinPhoneList employeeId={employeeId} kinId={editingRecord.id} />
                </div>
              ) : (
                // Add flow: draft phone rows
                <div className="space-y-2 mt-1">
                  {draftPhones.map((phone, idx) => (
                    <div key={idx} className="rounded-md border border-border/50 p-3 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            placeholder="Phone number"
                            value={phone.number}
                            onChange={e => updateDraftPhone(idx, { number: e.target.value })}
                          />
                        </div>
                        <Select
                          value={phone.label}
                          onValueChange={(v) => updateDraftPhone(idx, { label: v as PhoneLabel })}
                        >
                          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PHONE_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeDraftPhone(idx)}
                          type="button"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={phone.isPrimary}
                          onChange={e => updateDraftPhone(idx, { isPrimary: e.target.checked })}
                          className="accent-primary"
                        />
                        Set as primary
                      </label>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={addDraftPhone}
                    type="button"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add phone number
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
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
