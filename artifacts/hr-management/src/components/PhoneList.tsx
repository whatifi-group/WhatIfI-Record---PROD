/**
 * PhoneList — reusable phone number manager.
 *
 * Two variants:
 *   <EmployeePhoneList employeeId={n} />
 *   <KinPhoneList employeeId={n} kinId={k} />
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, Star, Phone } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListEmployeePhones,
  useCreateEmployeePhone,
  useUpdateEmployeePhone,
  useDeleteEmployeePhone,
  getListEmployeePhonesQueryKey,
  useListKinPhones,
  useCreateKinPhone,
  useUpdateKinPhone,
  useDeleteKinPhone,
  getListKinPhonesQueryKey,
} from "@workspace/api-client-react";
import type { EmployeePhoneEntry, KinPhoneEntry, PhoneLabel } from "@workspace/api-client-react";

const PHONE_LABELS: PhoneLabel[] = ["Mobile", "Home", "Work", "Other"];

interface PhoneEntry {
  id: number;
  number: string;
  label: string;
  isPrimary: boolean;
}

interface PhoneFormState {
  number: string;
  label: PhoneLabel;
  isPrimary: boolean;
}

const defaultForm: PhoneFormState = { number: "", label: "Mobile", isPrimary: false };

// ── Shared inner component ────────────────────────────────────────────────────

interface InnerProps {
  phones: PhoneEntry[];
  isLoading: boolean;
  onCreate: (form: PhoneFormState) => void;
  onUpdate: (phoneId: number, form: Partial<PhoneFormState>) => void;
  onDelete: (phoneId: number) => void;
  isMutating: boolean;
}

function PhoneListInner({ phones, isLoading, onCreate, onUpdate, onDelete, isMutating }: InnerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addForm, setAddForm] = useState<PhoneFormState>(defaultForm);
  const [editForms, setEditForms] = useState<Record<number, PhoneFormState>>({});

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>;
  }

  const handleAdd = () => {
    if (!addForm.number.trim()) return;
    onCreate(addForm);
    setAddForm(defaultForm);
    setShowAdd(false);
  };

  const handleEditSave = (phoneId: number) => {
    const form = editForms[phoneId];
    if (!form || !form.number.trim()) return;
    onUpdate(phoneId, form);
    setEditingId(null);
  };

  return (
    <div className="space-y-2">
      {phones.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground italic">No phone numbers on record.</p>
      )}

      {phones.map((ph) =>
        editingId === ph.id ? (
          <div key={ph.id} className="border border-primary/30 rounded-lg p-3 bg-muted/20 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  value={editForms[ph.id]?.number ?? ph.number}
                  onChange={(e) =>
                    setEditForms((f) => ({ ...f, [ph.id]: { ...(f[ph.id] ?? { number: ph.number, label: ph.label as PhoneLabel, isPrimary: ph.isPrimary }), number: e.target.value } }))
                  }

                />
              </div>
              <Select
                value={editForms[ph.id]?.label ?? ph.label}
                onValueChange={(v) =>
                  setEditForms((f) => ({ ...f, [ph.id]: { ...(f[ph.id] ?? { number: ph.number, label: ph.label as PhoneLabel, isPrimary: ph.isPrimary }), label: v as PhoneLabel } }))
                }
              >
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHONE_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForms[ph.id]?.isPrimary ?? ph.isPrimary}
                  onChange={(e) =>
                    setEditForms((f) => ({ ...f, [ph.id]: { ...(f[ph.id] ?? { number: ph.number, label: ph.label as PhoneLabel, isPrimary: ph.isPrimary }), isPrimary: e.target.checked } }))
                  }
                  className="accent-primary"
                />
                Set as primary
              </label>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                <Button size="sm" onClick={() => handleEditSave(ph.id)} disabled={isMutating}>
                  {isMutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div key={ph.id} className="flex items-center gap-2 group">
            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm flex-1">{ph.number}</span>
            <Badge variant="outline" className="text-xs py-0 px-1.5 font-normal">{ph.label}</Badge>
            {ph.isPrimary && (
              <Badge variant="secondary" className="text-xs py-0 px-1.5 gap-0.5">
                <Star className="w-2.5 h-2.5" /> Primary
              </Badge>
            )}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => {
                  setEditForms((f) => ({ ...f, [ph.id]: { number: ph.number, label: ph.label as PhoneLabel, isPrimary: ph.isPrimary } }));
                  setEditingId(ph.id);
                }}
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove phone number?</AlertDialogTitle>
                    <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      onClick={() => onDelete(ph.id)}
                    >Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ),
      )}

      {showAdd ? (
        <div className="border border-dashed border-border rounded-lg p-3 space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                value={addForm.number}
                onChange={(e) => setAddForm((f) => ({ ...f, number: e.target.value }))}

                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAdd(false); setAddForm(defaultForm); } }}
              />
            </div>
            <Select value={addForm.label} onValueChange={(v) => setAddForm((f) => ({ ...f, label: v as PhoneLabel }))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHONE_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={addForm.isPrimary}
                onChange={(e) => setAddForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                className="accent-primary"
              />
              Set as primary
            </label>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setAddForm(defaultForm); }}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={isMutating || !addForm.number.trim()}>
                {isMutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add phone number
        </Button>
      )}
    </div>
  );
}

// ── Employee variant ──────────────────────────────────────────────────────────

export function EmployeePhoneList({ employeeId }: { employeeId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: phones = [], isLoading } = useListEmployeePhones(employeeId);
  const createPhone = useCreateEmployeePhone();
  const updatePhone = useUpdateEmployeePhone();
  const deletePhone = useDeleteEmployeePhone();
  const isMutating = createPhone.isPending || updatePhone.isPending || deletePhone.isPending;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEmployeePhonesQueryKey(employeeId) });

  const onCreate = (form: PhoneFormState) => {
    createPhone.mutate(
      { id: employeeId, data: form },
      {
        onSuccess: () => { toast({ title: "Phone number added" }); invalidate(); },
        onError: () => toast({ title: "Failed to add phone", variant: "destructive" }),
      },
    );
  };

  const onUpdate = (phoneId: number, form: Partial<PhoneFormState>) => {
    updatePhone.mutate(
      { id: employeeId, phoneId, data: form },
      {
        onSuccess: () => { toast({ title: "Phone number updated" }); invalidate(); },
        onError: () => toast({ title: "Failed to update phone", variant: "destructive" }),
      },
    );
  };

  const onDelete = (phoneId: number) => {
    deletePhone.mutate(
      { id: employeeId, phoneId },
      {
        onSuccess: () => { toast({ title: "Phone number removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to remove phone", variant: "destructive" }),
      },
    );
  };

  return (
    <PhoneListInner
      phones={phones as PhoneEntry[]}
      isLoading={isLoading}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      isMutating={isMutating}
    />
  );
}

// ── Next-of-kin variant ───────────────────────────────────────────────────────

export function KinPhoneList({ employeeId, kinId }: { employeeId: number; kinId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: phones = [], isLoading } = useListKinPhones(employeeId, kinId);
  const createPhone = useCreateKinPhone();
  const updatePhone = useUpdateKinPhone();
  const deletePhone = useDeleteKinPhone();
  const isMutating = createPhone.isPending || updatePhone.isPending || deletePhone.isPending;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListKinPhonesQueryKey(employeeId, kinId) });

  const onCreate = (form: PhoneFormState) => {
    createPhone.mutate(
      { id: employeeId, kinId, data: form },
      {
        onSuccess: () => { toast({ title: "Phone number added" }); invalidate(); },
        onError: () => toast({ title: "Failed to add phone", variant: "destructive" }),
      },
    );
  };

  const onUpdate = (phoneId: number, form: Partial<PhoneFormState>) => {
    updatePhone.mutate(
      { id: employeeId, kinId, phoneId, data: form },
      {
        onSuccess: () => { toast({ title: "Phone number updated" }); invalidate(); },
        onError: () => toast({ title: "Failed to update phone", variant: "destructive" }),
      },
    );
  };

  const onDelete = (phoneId: number) => {
    deletePhone.mutate(
      { id: employeeId, kinId, phoneId },
      {
        onSuccess: () => { toast({ title: "Phone number removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to remove phone", variant: "destructive" }),
      },
    );
  };

  return (
    <PhoneListInner
      phones={phones as PhoneEntry[]}
      isLoading={isLoading}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      isMutating={isMutating}
    />
  );
}
