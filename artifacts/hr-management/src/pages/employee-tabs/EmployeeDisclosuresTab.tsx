import { useState, useEffect } from "react";
import {
  useListEmployeeDisclosures,
  useCreateEmployeeDisclosure,
  useUpdateEmployeeDisclosure,
  useDeleteEmployeeDisclosure,
  useCreateDisclosureUpdateCheck,
  useDeleteDisclosureUpdateCheck,
  useSubmitDisclosureReview,
  useSignOffDisclosureReview,
  useListLovItems,
  getListEmployeeDisclosuresQueryKey,
} from "@workspace/api-client-react";
import type { EmployeeDisclosure, DisclosureUpdateCheck, DisclosureReview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import TabErrorState from "@/components/TabErrorState";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Paperclip,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface Props {
  employeeId: number;
}

// Check type, check level, and recommendation are List of Values-backed
// (categories "disclosure_check_type", "disclosure_check_level_<type>", and
// "disclosure_recommendation") — any value a sysadmin has configured is valid,
// so these are plain strings rather than closed unions.
type CheckType = string;
type CheckLevel = string;
type UpdateCheckResult = "clear" | "not_clear" | "changes_shown";
type Recommendation = string;

const RESULT_LABELS: Record<UpdateCheckResult, string> = {
  clear: "Clear",
  not_clear: "Not Clear",
  changes_shown: "Changes Shown",
};

/** Looks up the display label for a LOV value, falling back to the raw value. */
function lovLabel(items: { value: string; label: string }[] | undefined, value: string): string {
  return items?.find((i) => i.value === value)?.label ?? value;
}

/** Category slug for the check-level LOV list scoped to a given check type. */
function checkLevelCategory(checkType: string): string {
  return `disclosure_check_level_${checkType}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

function ResultBadge({ result }: { result: UpdateCheckResult }) {
  const colours: Record<UpdateCheckResult, string> = {
    clear: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    not_clear: "bg-destructive/10 text-destructive border-destructive/20",
    changes_shown: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${colours[result]}`}>
      {RESULT_LABELS[result]}
    </span>
  );
}

function ReviewStatusBadge({ review }: { review: DisclosureReview | null | undefined }) {
  if (!review) return null;
  if (review.signedOffAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
        <CheckCircle2 className="w-3 h-3" /> Signed Off
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      <Clock className="w-3 h-3" /> Review Pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Disclosure form state
// ---------------------------------------------------------------------------

interface DisclosureForm {
  checkType: CheckType | "";
  checkLevel: CheckLevel | "";
  certificateNumber: string;
  issueDate: string;
  onUpdateService: boolean;
  convictionDetails: string;
  notes: string;
}

const defaultDisclosureForm: DisclosureForm = {
  checkType: "",
  checkLevel: "",
  certificateNumber: "",
  issueDate: "",
  onUpdateService: false,
  convictionDetails: "",
  notes: "",
};

// ---------------------------------------------------------------------------
// Update Check sub-component
// ---------------------------------------------------------------------------

function UpdateChecksSection({
  employeeId,
  disclosure,
  canEdit,
  onInvalidate,
}: {
  employeeId: number;
  disclosure: EmployeeDisclosure;
  canEdit: boolean;
  onInvalidate: () => void;
}) {
  const { toast } = useToast();
  const createCheck = useCreateDisclosureUpdateCheck();
  const deleteCheck = useDeleteDisclosureUpdateCheck();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ checkedDate: "", result: "" as UpdateCheckResult | "", checkedBy: "", notes: "" });
  const [deletingCheckId, setDeletingCheckId] = useState<number | null>(null);

  const checks = (disclosure as any).updateChecks as DisclosureUpdateCheck[] ?? [];

  const handleAdd = () => {
    if (!form.checkedDate || !form.result || !form.checkedBy.trim()) {
      toast({ title: "Date, result, and checked-by are required", variant: "destructive" });
      return;
    }
    createCheck.mutate(
      {
        id: employeeId,
        disclosureId: disclosure.id,
        data: {
          checkedDate: form.checkedDate,
          result: form.result as UpdateCheckResult,
          checkedBy: form.checkedBy.trim(),
          notes: form.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Check result added" });
          setForm({ checkedDate: "", result: "", checkedBy: "", notes: "" });
          setAddOpen(false);
          onInvalidate();
        },
        onError: () => toast({ title: "Failed to add check result", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (checkId: number) => {
    deleteCheck.mutate(
      { id: employeeId, disclosureId: disclosure.id, checkId },
      {
        onSuccess: () => { toast({ title: "Check result removed" }); onInvalidate(); },
        onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Service Checks</p>
      {checks.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No check results recorded.</p>
      )}
      {checks.map((c) => (
        <div key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs border border-border/30 rounded-md px-3 py-2 bg-muted/20">
          <span className="font-medium">{formatDate(c.checkedDate)}</span>
          <ResultBadge result={c.result as UpdateCheckResult} />
          <span className="text-muted-foreground">by {c.checkedBy}</span>
          {c.notes && <span className="text-muted-foreground italic w-full">{c.notes}</span>}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto shrink-0"
              onClick={() => setDeletingCheckId(c.id)}
              disabled={deleteCheck.isPending}
            >
              <Trash2 className="w-2.5 h-2.5" />
            </Button>
          )}
        </div>
      ))}

      {canEdit && addOpen ? (
        <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/10">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Date of Check</Label>
              <DatePicker className="h-7 text-xs" value={form.checkedDate} onChange={(value) => setForm((f) => ({ ...f, checkedDate: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Result</Label>
              <Select value={form.result} onValueChange={(v) => setForm((f) => ({ ...f, result: v as UpdateCheckResult }))}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {(["clear", "not_clear", "changes_shown"] as UpdateCheckResult[]).map((r) => (
                    <SelectItem key={r} value={r}>{RESULT_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Checked By</Label>
            <Input className="h-7 text-xs" value={form.checkedBy} onChange={(e) => setForm((f) => ({ ...f, checkedBy: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea className="text-xs min-h-[50px]" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={createCheck.isPending}>
              {createCheck.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Save
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : canEdit ? (
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="w-3 h-3" /> Add Check Result
        </Button>
      ) : null}

      <AlertDialog open={deletingCheckId !== null} onOpenChange={(o) => { if (!o) setDeletingCheckId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove check result?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={() => { if (deletingCheckId) { handleDelete(deletingCheckId); setDeletingCheckId(null); } }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conviction review panel sub-component
// ---------------------------------------------------------------------------

function ConvictionReviewPanel({
  employeeId,
  disclosure,
  canSignOff,
  onInvalidate,
}: {
  employeeId: number;
  disclosure: EmployeeDisclosure;
  canSignOff: boolean;
  onInvalidate: () => void;
}) {
  const { toast } = useToast();
  const submitReview = useSubmitDisclosureReview();
  const signOff = useSignOffDisclosureReview();
  const { data: recommendations } = useListLovItems("disclosure_recommendation");
  const review = (disclosure as any).review as DisclosureReview | null;

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState<{
    recommendation: Recommendation | "";
    reviewerNotes: string;
    reviewDate: string;
  }>({ recommendation: "", reviewerNotes: "", reviewDate: "" });

  const [signOffOpen, setSignOffOpen] = useState(false);

  const openReviewForm = () => {
    setReviewForm({
      recommendation: (review?.recommendation as Recommendation) ?? "",
      reviewerNotes: review?.reviewerNotes ?? "",
      reviewDate: review?.reviewDate ?? new Date().toISOString().split("T")[0],
    });
    setReviewOpen(true);
  };

  const handleSubmitReview = () => {
    if (!reviewForm.recommendation || !reviewForm.reviewDate) {
      toast({ title: "Recommendation and review date are required", variant: "destructive" });
      return;
    }
    submitReview.mutate(
      {
        id: employeeId,
        disclosureId: disclosure.id,
        data: {
          recommendation: reviewForm.recommendation as Recommendation,
          reviewerNotes: reviewForm.reviewerNotes || undefined,
          reviewDate: reviewForm.reviewDate,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Review submitted" });
          setReviewOpen(false);
          onInvalidate();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to submit review";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  const handleSignOff = () => {
    signOff.mutate(
      { id: employeeId, disclosureId: disclosure.id },
      {
        onSuccess: () => {
          toast({ title: "Review signed off" });
          setSignOffOpen(false);
          onInvalidate();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to sign off";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-800/40 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Conviction Details — Review Required</p>
      </div>

      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{disclosure.convictionDetails}</p>

      {review ? (
        <div className="border border-border/40 rounded-lg p-3 space-y-1.5 bg-muted/10 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{lovLabel(recommendations, review.recommendation)}</span>
            <ReviewStatusBadge review={review} />
          </div>
          {review.reviewDate && (
            <p className="text-muted-foreground">Review date: {formatDate(review.reviewDate)}</p>
          )}
          {review.reviewerNotes && (
            <p className="text-muted-foreground italic">{review.reviewerNotes}</p>
          )}
          {review.signedOffAt && (
            <p className="text-muted-foreground text-[10px]">
              Signed off by {(review as any).signedOffByName ?? "—"} on {formatDateTime(review.signedOffAt)}
            </p>
          )}
          {!review.signedOffAt && (
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={openReviewForm}>
                <Pencil className="w-3 h-3" /> Edit Review
              </Button>
              {canSignOff && (
                <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setSignOffOpen(true)}>
                  <ShieldCheck className="w-3 h-3" /> Sign Off
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20" onClick={openReviewForm}>
          <Plus className="w-3 h-3" /> Submit Review
        </Button>
      )}

      {/* Review form dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{review ? "Edit Review" : "Submit Review"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Recommendation</Label>
              <Select value={reviewForm.recommendation} onValueChange={(v) => setReviewForm((f) => ({ ...f, recommendation: v as Recommendation }))}>
                <SelectTrigger><SelectValue placeholder="Select recommendation…" /></SelectTrigger>
                <SelectContent>
                  {recommendations?.filter((r) => r.isActive).map((r) => (
                    <SelectItem key={r.id} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Review Date</Label>
              <DatePicker value={reviewForm.reviewDate} onChange={(value) => setReviewForm((f) => ({ ...f, reviewDate: value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea className="min-h-[80px]" value={reviewForm.reviewerNotes} onChange={(e) => setReviewForm((f) => ({ ...f, reviewerNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitReview} disabled={submitReview.isPending}>
              {submitReview.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {review ? "Update Review" : "Submit Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign-off confirmation */}
      <AlertDialog open={signOffOpen} onOpenChange={setSignOffOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign off this review?</AlertDialogTitle>
            <AlertDialogDescription>
              Once signed off, the review record will be locked and cannot be modified. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={signOff.isPending}
              onClick={(e) => { e.preventDefault(); handleSignOff(); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {signOff.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Sign Off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disclosure card
// ---------------------------------------------------------------------------

function DisclosureCard({
  employeeId,
  disclosure,
  canEdit,
  canSignOff,
  canHRSignOff,
  isSysAdmin,
  onEdit,
  onDelete,
  onInvalidate,
}: {
  employeeId: number;
  disclosure: EmployeeDisclosure;
  canEdit: boolean;
  canSignOff: boolean;
  canHRSignOff: boolean;
  isSysAdmin: boolean;
  onEdit: (d: EmployeeDisclosure) => void;
  onDelete: (id: number) => void;
  onInvalidate: () => void;
}) {
  const { toast } = useToast();
  const signOff = useSignOffDisclosureReview();
  const { data: checkTypes } = useListLovItems("disclosure_check_type");
  const { data: checkLevels } = useListLovItems(checkLevelCategory(disclosure.checkType));
  const [expanded, setExpanded] = useState(false);
  const [hrSignOffOpen, setHrSignOffOpen] = useState(false);
  const review = (disclosure as any).review as DisclosureReview | null;
  const hasConviction = !!disclosure.convictionDetails;

  const handleHRSignOff = () => {
    signOff.mutate(
      { id: employeeId, disclosureId: disclosure.id },
      {
        onSuccess: () => {
          toast({ title: "Disclosure signed off" });
          setHrSignOffOpen(false);
          onInvalidate();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to sign off";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className={`border rounded-xl p-4 space-y-2 bg-card shadow-sm ${hasConviction ? "border-amber-300/60 dark:border-amber-700/40" : "border-border/50"}`}>
      {/* Card header */}
      <div className="flex flex-wrap items-start gap-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          {lovLabel(checkTypes, disclosure.checkType)}
        </span>
        <span className="text-xs text-muted-foreground pt-0.5">{lovLabel(checkLevels, disclosure.checkLevel)}</span>

        {disclosure.onUpdateService && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
            Update Service
          </span>
        )}

        {hasConviction && !review && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            <AlertTriangle className="w-3 h-3" /> Review Required
          </span>
        )}

        {review && <ReviewStatusBadge review={review} />}

        {canEdit && (
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(disclosure)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {(!review?.signedOffAt || isSysAdmin) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(disclosure.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Core details */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Issued: <span className="text-foreground font-medium">{formatDate(disclosure.issueDate)}</span></span>
        {disclosure.certificateNumber && (
          <span>Cert No: <span className="text-foreground font-medium">{disclosure.certificateNumber}</span></span>
        )}
      </div>

      {disclosure.notes && (
        <p className="text-xs text-muted-foreground italic">{disclosure.notes}</p>
      )}

      {/* HR sign-off section — shown on all non-conviction disclosures */}
      {!hasConviction && (
        <div className="pt-2 border-t border-border/30 flex items-center gap-2">
          {review?.signedOffAt ? (
            <p className="text-[10px] text-muted-foreground">
              Signed off by {(review as any).signedOffByName ?? "Workflow Process"} on {formatDateTime(review.signedOffAt)}
            </p>
          ) : canHRSignOff ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setHrSignOffOpen(true)}
            >
              <ShieldCheck className="w-3 h-3" /> Sign Off
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground italic">Awaiting HR sign-off</span>
          )}
        </div>
      )}

      {/* Expandable sections */}
      {(disclosure.onUpdateService || hasConviction) && (
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {expanded ? "Hide details" : "Show details"}
        </button>
      )}

      {expanded && (
        <div className="space-y-2">
          {disclosure.onUpdateService && (
            <UpdateChecksSection
              employeeId={employeeId}
              disclosure={disclosure}
              canEdit={canEdit}
              onInvalidate={onInvalidate}
            />
          )}
          {hasConviction && (
            <ConvictionReviewPanel
              employeeId={employeeId}
              disclosure={disclosure}
              canSignOff={canSignOff}
              onInvalidate={onInvalidate}
            />
          )}
        </div>
      )}

      {/* HR sign-off confirmation dialog */}
      {!hasConviction && (
        <AlertDialog open={hrSignOffOpen} onOpenChange={setHrSignOffOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign off this disclosure?</AlertDialogTitle>
              <AlertDialogDescription>
                This confirms the disclosure has been reviewed and is in order. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={signOff.isPending}
                onClick={(e) => { e.preventDefault(); handleHRSignOff(); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {signOff.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Confirm Sign Off
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export default function EmployeeDisclosuresTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  // Write access: create/update/delete disclosures and update checks
  const canEdit = hasPermission("edit_employees") || hasPermission("sysadmin");
  // Sign-off (conviction): senior manager only
  const canSignOff = hasPermission("review_disclosures") || hasPermission("sysadmin");
  // Sign-off (non-conviction): HR Manager can sign off directly
  const canHRSignOff = hasPermission("view_disclosures") || hasPermission("edit_employees") || hasPermission("sysadmin");
  // Sysadmin: can delete approved disclosures
  const isSysAdmin = hasPermission("sysadmin");

  const { data: disclosures, isLoading, isError, refetch } = useListEmployeeDisclosures(employeeId);
  const { data: checkTypes } = useListLovItems("disclosure_check_type");
  const { data: dbsLevels } = useListLovItems("disclosure_check_level_dbs");
  const { data: pvgLevels } = useListLovItems("disclosure_check_level_pvg");
  const { data: accessNiLevels } = useListLovItems("disclosure_check_level_access_ni");
  const levelsByType: Record<string, typeof dbsLevels> = {
    dbs: dbsLevels,
    pvg: pvgLevels,
    access_ni: accessNiLevels,
  };
  const createDisclosure = useCreateEmployeeDisclosure();
  const updateDisclosure = useUpdateEmployeeDisclosure();
  const deleteDisclosure = useDeleteEmployeeDisclosure();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmployeeDisclosure | null>(null);
  const [form, setForm] = useState<DisclosureForm>(defaultDisclosureForm);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Update Service consent records
  interface ConsentRecord {
    id: number;
    disclosureId: number | null;
    consentGranted: boolean;
    signatoryName: string | null;
    consentedAt: string | null;
    pdfSignedUrl: string | null;
    pdfFileName: string | null;
  }
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [consentsLoading, setConsentsLoading] = useState(true);
  const [consentExpanded, setConsentExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setConsentsLoading(true);
    fetch(`/api/employees/${employeeId}/disclosure-consents`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setConsents(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setConsents([]); })
      .finally(() => { if (!cancelled) setConsentsLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  const availableLevels =
    (form.checkType ? levelsByType[form.checkType] : undefined) ?? [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListEmployeeDisclosuresQueryKey(employeeId),
    });

  const openAdd = () => {
    setEditingRecord(null);
    setForm(defaultDisclosureForm);
    setDialogOpen(true);
  };

  const openEdit = (record: EmployeeDisclosure) => {
    setEditingRecord(record);
    setForm({
      checkType: record.checkType as CheckType,
      checkLevel: record.checkLevel as CheckLevel,
      certificateNumber: record.certificateNumber ?? "",
      issueDate: record.issueDate,
      onUpdateService: record.onUpdateService,
      convictionDetails: record.convictionDetails ?? "",
      notes: record.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.checkType) {
      toast({ title: "Check type is required", variant: "destructive" });
      return;
    }
    if (!form.checkLevel) {
      toast({ title: "Check level is required", variant: "destructive" });
      return;
    }
    if (!form.issueDate) {
      toast({ title: "Issue date is required", variant: "destructive" });
      return;
    }

    const payload = {
      checkType: form.checkType as CheckType,
      checkLevel: form.checkLevel as CheckLevel,
      certificateNumber: form.certificateNumber || undefined,
      issueDate: form.issueDate,
      onUpdateService: form.onUpdateService,
      convictionDetails: form.convictionDetails || undefined,
      notes: form.notes || undefined,
    };

    if (editingRecord) {
      updateDisclosure.mutate(
        { id: employeeId, disclosureId: editingRecord.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Disclosure updated" });
            invalidateList();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        },
      );
    } else {
      createDisclosure.mutate(
        { id: employeeId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Disclosure added" });
            invalidateList();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to add disclosure", variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = (id: number) => {
    deleteDisclosure.mutate(
      { id: employeeId, disclosureId: id },
      {
        onSuccess: () => {
          toast({ title: "Disclosure removed" });
          invalidateList();
          setDeletingId(null);
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      },
    );
  };

  const isSaving = createDisclosure.isPending || updateDisclosure.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <TabErrorState onRetry={refetch} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Disclosure Records</h3>
          <p className="text-xs text-muted-foreground">DBS, PVG, and AccessNI checks</p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Disclosure
          </Button>
        )}
      </div>

      {/* Empty state */}
      {(!disclosures || disclosures.length === 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/50 rounded-xl">
          <ShieldCheck className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No disclosures recorded</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add a DBS, PVG, or AccessNI check to get started.</p>
        </div>
      )}

      {/* Disclosure cards */}
      <div className="space-y-3">
        {disclosures?.map((d) => (
          <DisclosureCard
            key={d.id}
            employeeId={employeeId}
            disclosure={d}
            canEdit={canEdit}
            canSignOff={canSignOff}
            canHRSignOff={canHRSignOff}
            isSysAdmin={isSysAdmin}
            onEdit={openEdit}
            onDelete={(id) => setDeletingId(id)}
            onInvalidate={invalidateList}
          />
        ))}
      </div>

      {/* Update Service Consent records */}
      {!consentsLoading && consents.length > 0 && (
        <div className="border border-blue-200/60 dark:border-blue-800/40 rounded-xl overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-left"
            onClick={() => setConsentExpanded((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                Update Service Consent
              </span>
              <span className="text-xs text-blue-600/70 dark:text-blue-400/70">
                ({consents.length} record{consents.length !== 1 ? "s" : ""})
              </span>
            </div>
            {consentExpanded ? (
              <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            )}
          </button>

          {consentExpanded && (
            <div className="divide-y divide-border/30">
              {consents.map((c) => (
                <div key={c.id} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.consentGranted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> Consent Granted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                        Not on Update Service
                      </span>
                    )}
                  </div>
                  {c.consentGranted && (
                    <div className="text-xs space-y-0.5">
                      {c.signatoryName && (
                        <p>
                          <span className="text-muted-foreground">Signatory: </span>
                          <span className="font-medium">{c.signatoryName}</span>
                        </p>
                      )}
                      {c.consentedAt && (
                        <p>
                          <span className="text-muted-foreground">Consented at: </span>
                          <span>{formatDateTime(c.consentedAt)}</span>
                        </p>
                      )}
                      {c.pdfSignedUrl && (
                        <a
                          href={c.pdfSignedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-primary hover:underline font-medium"
                        >
                          <Paperclip className="w-3 h-3" />
                          {c.pdfFileName ?? "Download PDF"}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit Disclosure" : "Add Disclosure"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Check Type <span className="text-destructive">*</span></Label>
                <Select
                  value={form.checkType}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      checkType: v,
                      // Reset level if it's not valid for the new type
                      checkLevel: (levelsByType[v] ?? []).some((l) => l.value === f.checkLevel)
                        ? f.checkLevel
                        : "",
                    }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                  <SelectContent>
                    {checkTypes?.filter((t) => t.isActive).map((t) => (
                      <SelectItem key={t.id} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Check Level <span className="text-destructive">*</span></Label>
                <Select
                  value={form.checkLevel}
                  onValueChange={(v) => setForm((f) => ({ ...f, checkLevel: v }))}
                  disabled={!form.checkType}
                >
                  <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
                  <SelectContent>
                    {availableLevels.filter((l) => l.isActive).map((l) => (
                      <SelectItem key={l.id} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Issue Date <span className="text-destructive">*</span></Label>
                <DatePicker value={form.issueDate} onChange={(value) => setForm((f) => ({ ...f, issueDate: value }))} />
              </div>
              <div className="space-y-1">
                <Label>Certificate Number</Label>
                <Input value={form.certificateNumber} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="onUpdateService"
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={form.onUpdateService}
                onChange={(e) => setForm((f) => ({ ...f, onUpdateService: e.target.checked }))}
              />
              <Label htmlFor="onUpdateService" className="cursor-pointer">Registered on Update Service</Label>
            </div>

            <div className="space-y-1">
              <Label>Conviction Details</Label>
              <Textarea
                className="min-h-[80px]"

                value={form.convictionDetails}
                onChange={(e) => setForm((f) => ({ ...f, convictionDetails: e.target.value }))}
              />
              {form.convictionDetails && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> A senior manager review will be required.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                className="min-h-[60px]"

                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingRecord ? "Save Changes" : "Add Disclosure"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deletingId !== null} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this disclosure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the disclosure record along with all Update Service check results and any associated review. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={deleteDisclosure.isPending}
              onClick={(e) => { e.preventDefault(); if (deletingId) handleDelete(deletingId); }}
            >
              {deleteDisclosure.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
