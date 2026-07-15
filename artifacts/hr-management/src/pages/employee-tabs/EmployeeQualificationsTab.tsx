import { useRef, useState } from "react";
import {
  useListEmployeeQualifications,
  useCreateEmployeeQualification,
  useUpdateEmployeeQualification,
  useDeleteEmployeeQualification,
  useRevalidateEmployeeQualification,
  useListQualificationRevalidations,
  useListQualificationCertificates,
  useCreateQualificationCertificate,
  useDeleteQualificationCertificate,
  useListQualificationTypes,
  getListEmployeeQualificationsQueryKey,
  getListQualificationRevalidationsQueryKey,
  getListQualificationCertificatesQueryKey,
} from "@workspace/api-client-react";
import type {
  EmployeeQualification,
  QualificationType,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import TabErrorState from "@/components/TabErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  GraduationCap,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Paperclip,
  ExternalLink,
  Upload,
} from "lucide-react";
import { format, parseISO, isPast, differenceInDays } from "date-fns";

/**
 * Resolve a stored fileUrl to a browseable href.
 * New uploads store an objectPath like "/objects/uploads/uuid" which needs
 * to be served via /api/storage. Legacy records store full https:// URLs.
 */
function resolveFileHref(fileUrl: string): string {
  if (fileUrl.startsWith("/objects/")) {
    return `/api/storage${fileUrl}`;
  }
  return fileUrl;
}

interface Props {
  employeeId: number;
}

interface QualForm {
  qualificationTypeId: string;
  dateAchieved: string;
  notes: string;
}

interface RevalidateForm {
  dateAchieved: string;
  notes: string;
}


const defaultQualForm: QualForm = {
  qualificationTypeId: "",
  dateAchieved: "",
  notes: "",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "d MMM yyyy");
  } catch {
    return dateStr;
  }
}

function ExpiryBadge({ expiryDate }: { expiryDate: string | null | undefined }) {
  if (!expiryDate) return null;
  const date = parseISO(expiryDate);
  const expired = isPast(date);
  const daysLeft = differenceInDays(date, new Date());
  const soonThreshold = 30;

  if (expired) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
        Expired
      </span>
    );
  }
  if (daysLeft <= soonThreshold) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
        Expires in {daysLeft}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-secondary/10 text-secondary border border-secondary/20">
      Valid
    </span>
  );
}

/** Sub-component: revalidation history for a single qualification */
function RevalidationHistory({
  employeeId,
  qualId,
}: {
  employeeId: number;
  qualId: number;
}) {
  const { data: history, isLoading } = useListQualificationRevalidations(
    employeeId,
    qualId,
  );

  if (isLoading)
    return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mx-auto" />;
  if (!history || history.length === 0)
    return <p className="text-xs text-muted-foreground italic">No previous revalidations.</p>;

  return (
    <div className="space-y-1">
      {[...history].reverse().map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground"
        >
          <span>Achieved: {formatDate(r.previousDateAchieved)}</span>
          {r.previousExpiryDate && (
            <span>Expired: {formatDate(r.previousExpiryDate)}</span>
          )}
          <span className="text-muted-foreground/60">
            Revalidated {formatDate(r.revalidatedAt as unknown as string)}
          </span>
          {r.notes && <span className="italic">{r.notes}</span>}
        </div>
      ))}
    </div>
  );
}

/** Sub-component: certificates for a single qualification */
function CertificatesList({
  employeeId,
  qualId,
}: {
  employeeId: number;
  qualId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: certs, isLoading } = useListQualificationCertificates(
    employeeId,
    qualId,
  );
  const createCert = useCreateQualificationCertificate();
  const deleteCert = useDeleteQualificationCertificate();
  const [addOpen, setAddOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading, progress } = useUpload({
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListQualificationCertificatesQueryKey(employeeId, qualId),
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file);
    if (!result) return; // error already toasted by onError

    createCert.mutate(
      {
        id: employeeId,
        qualId,
        data: {
          fileName: file.name,
          fileUrl: result.objectPath,
          mimeType: file.type || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Certificate uploaded" });
          invalidate();
          setAddOpen(false);
          // reset file input so the same file can be re-selected if needed
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
        onError: () => toast({ title: "Failed to save certificate", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (certId: number) => {
    deleteCert.mutate(
      { id: employeeId, qualId, certId },
      {
        onSuccess: () => { toast({ title: "Certificate removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
      },
    );
  };

  const isBusy = isUploading || createCert.isPending;

  if (isLoading)
    return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mx-auto" />;

  return (
    <div className="space-y-2">
      {certs && certs.length > 0 && (
        <div className="space-y-1">
          {certs.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
              <a
                href={resolveFileHref(c.fileUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline truncate max-w-[220px]"
              >
                {c.fileName}
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </a>
              <span className="text-muted-foreground/60 shrink-0">
                {formatDate(c.uploadedAt as unknown as string)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 ml-auto"
                onClick={() => handleDelete(c.id)}
                disabled={isBusy}
              >
                <Trash2 className="w-2.5 h-2.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input — triggered by the button below */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic"
        className="hidden"
        onChange={handleFileChange}
        disabled={isBusy}
      />

      {!addOpen ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3 h-3" /> Add Certificate
        </Button>
      ) : (
        <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/20">
          {isBusy ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span>
                  {isUploading
                    ? `Uploading… ${progress}%`
                    : "Saving certificate…"}
                </span>
              </div>
              {isUploading && (
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Choose a PDF or image file to upload.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3 h-3" />
                  Choose file
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmployeeQualificationsTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmployeeQualification | null>(null);
  const [form, setForm] = useState<QualForm>(defaultQualForm);

  const [revalidateOpen, setRevalidateOpen] = useState(false);
  const [revalidatingRecord, setRevalidatingRecord] = useState<EmployeeQualification | null>(null);
  const [revalidateForm, setRevalidateForm] = useState<RevalidateForm>({ dateAchieved: "", notes: "" });

  const [expandedHistory, setExpandedHistory] = useState<Record<number, boolean>>({});
  const [expandedCerts, setExpandedCerts] = useState<Record<number, boolean>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: qualTypes } = useListQualificationTypes();
  const { data: records, isLoading, isError, refetch } = useListEmployeeQualifications(employeeId);
  const createQual = useCreateEmployeeQualification();
  const updateQual = useUpdateEmployeeQualification();
  const deleteQual = useDeleteEmployeeQualification();
  const revalidateQual = useRevalidateEmployeeQualification();

  const activeTypes = qualTypes?.filter((t) => t.isActive) ?? [];
  const selectedType = activeTypes.find(
    (t) => t.id.toString() === form.qualificationTypeId,
  );

  const calcPreviewExpiry = (
    dateAchieved: string,
    type: QualificationType | undefined,
  ): string => {
    if (!type?.validityValue || !type?.validityUnit || !dateAchieved) return "";
    try {
      const d = new Date(dateAchieved + "T00:00:00Z");
      if (type.validityUnit === "days") d.setUTCDate(d.getUTCDate() + type.validityValue);
      else if (type.validityUnit === "months")
        d.setUTCMonth(d.getUTCMonth() + type.validityValue);
      else if (type.validityUnit === "years")
        d.setUTCFullYear(d.getUTCFullYear() + type.validityValue);
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const previewExpiry = calcPreviewExpiry(form.dateAchieved, selectedType);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListEmployeeQualificationsQueryKey(employeeId),
    });

  const openAdd = () => {
    setEditingRecord(null);
    setForm(defaultQualForm);
    setDialogOpen(true);
  };

  const openEdit = (record: EmployeeQualification) => {
    setEditingRecord(record);
    setForm({
      qualificationTypeId: record.qualificationTypeId.toString(),
      dateAchieved: record.dateAchieved,
      notes: record.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.qualificationTypeId) {
      toast({ title: "Qualification type is required", variant: "destructive" });
      return;
    }
    if (!form.dateAchieved) {
      toast({ title: "Date Achieved is required", variant: "destructive" });
      return;
    }
    const payload = {
      qualificationTypeId: parseInt(form.qualificationTypeId, 10),
      dateAchieved: form.dateAchieved,
      notes: form.notes || undefined,
    };
    if (editingRecord) {
      updateQual.mutate(
        { id: employeeId, qualId: editingRecord.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Qualification updated" });
            invalidateList();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        },
      );
    } else {
      createQual.mutate(
        { id: employeeId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Qualification added" });
            invalidateList();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to add", variant: "destructive" }),
        },
      );
    }
  };

  const openRevalidate = (record: EmployeeQualification) => {
    setRevalidatingRecord(record);
    setRevalidateForm({ dateAchieved: "", notes: "" });
    setRevalidateOpen(true);
  };

  const handleRevalidate = () => {
    if (!revalidatingRecord || !revalidateForm.dateAchieved) {
      toast({ title: "New Date Achieved is required", variant: "destructive" });
      return;
    }
    revalidateQual.mutate(
      {
        id: employeeId,
        qualId: revalidatingRecord.id,
        data: {
          dateAchieved: revalidateForm.dateAchieved,
          notes: revalidateForm.notes || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Qualification revalidated" });
          invalidateList();
          queryClient.invalidateQueries({
            queryKey: getListQualificationRevalidationsQueryKey(
              employeeId,
              revalidatingRecord.id,
            ),
          });
          setRevalidateOpen(false);
        },
        onError: () => toast({ title: "Failed to revalidate", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (qualId: number) => {
    deleteQual.mutate(
      { id: employeeId, qualId },
      {
        onSuccess: () => { toast({ title: "Qualification removed" }); invalidateList(); setDeletingId(null); },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      },
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

  if (isError) {
    return <TabErrorState onRetry={refetch} message="Could not load qualifications. Check your connection and try again." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Qualifications</h3>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      {!records || records.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No qualifications on record</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div
              key={record.id}
              className="border border-border/50 rounded-lg p-4 bg-card space-y-3"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm text-foreground">
                      {record.qualificationTypeName ?? `Type #${record.qualificationTypeId}`}
                    </p>
                    <ExpiryBadge expiryDate={record.expiryDate} />
                  </div>
                  {record.awardingBody && (
                    <p className="text-xs text-muted-foreground mt-0.5">{record.awardingBody}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span>Achieved: {formatDate(record.dateAchieved)}</span>
                    {record.expiryDate && (
                      <span>Expires: {formatDate(record.expiryDate)}</span>
                    )}
                  </div>
                  {record.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{record.notes}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Revalidate"
                    onClick={() => openRevalidate(record)}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Edit"
                    onClick={() => openEdit(record)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                    onClick={() => setDeletingId(record.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Revalidation history toggle */}
              <div className="border-t border-border/40 pt-2">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() =>
                    setExpandedHistory((prev) => ({
                      ...prev,
                      [record.id]: !prev[record.id],
                    }))
                  }
                >
                  {expandedHistory[record.id] ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Revalidation History
                </button>
                {expandedHistory[record.id] && (
                  <div className="mt-2 pl-4">
                    <RevalidationHistory
                      employeeId={employeeId}
                      qualId={record.id}
                    />
                  </div>
                )}
              </div>

              {/* Certificates toggle */}
              <div className="border-t border-border/40 pt-2">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() =>
                    setExpandedCerts((prev) => ({
                      ...prev,
                      [record.id]: !prev[record.id],
                    }))
                  }
                >
                  {expandedCerts[record.id] ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Certificates
                </button>
                {expandedCerts[record.id] && (
                  <div className="mt-2 pl-4">
                    <CertificatesList
                      employeeId={employeeId}
                      qualId={record.id}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? "Edit Qualification" : "Add Qualification"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Qualification Type *</Label>
              <Select
                value={form.qualificationTypeId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, qualificationTypeId: v }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a qualification type…" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No active qualification types. Add some in SysAdmin first.
                    </div>
                  ) : (
                    activeTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedType && (
              <div>
                <Label>Awarding Body</Label>
                <Input
                  className="mt-1 bg-muted/30"
                  value={selectedType.awardingBody ?? "—"}
                  readOnly
                />
              </div>
            )}

            <div>
              <Label>Date Achieved *</Label>
              <Input
                className="mt-1"
                type="date"
                value={form.dateAchieved}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dateAchieved: e.target.value }))
                }
              />
            </div>

            {selectedType?.validityValue && form.dateAchieved && (
              <div>
                <Label>Expiry Date (calculated)</Label>
                <Input
                  className="mt-1 bg-muted/30"
                  value={previewExpiry ? formatDate(previewExpiry) : "—"}
                  readOnly
                />
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Additional details…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRecord ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revalidate Dialog */}
      <Dialog open={revalidateOpen} onOpenChange={setRevalidateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Revalidate Qualification</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The current dates will be saved to the revalidation history and the record
            will be updated with the new dates.
          </p>
          <div className="space-y-4">
            <div>
              <Label>New Date Achieved *</Label>
              <Input
                className="mt-1"
                type="date"
                value={revalidateForm.dateAchieved}
                onChange={(e) =>
                  setRevalidateForm((f) => ({ ...f, dateAchieved: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1"
                value={revalidateForm.notes}
                onChange={(e) =>
                  setRevalidateForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Reason for revalidation…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevalidateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRevalidate} disabled={revalidateQual.isPending}>
              {revalidateQual.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Revalidate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this qualification?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also delete all associated revalidation history and certificates.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId !== null && handleDelete(deletingId)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
