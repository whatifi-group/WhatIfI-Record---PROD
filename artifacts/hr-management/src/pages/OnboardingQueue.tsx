/**
 * HR Onboarding Queue — approval/rejection UI for HR Managers and SysAdmins.
 *
 * Tabs: Pending | Approved | Rejected
 * - Pending rows: Approve + Reject actions
 * - Approve dialog: optional notes → shows generated temporary password
 * - Reject dialog: mandatory leaverReason
 *
 * Pay rate fields never appear here; after approval an inline reminder
 * directs HR to configure pay rates on the employee's Payroll tab.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, Eye, Copy, Check, AlertCircle, Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

type SubmissionStatus = "pending" | "approved" | "rejected";

interface Submission {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  employmentType: string;
  startDate: string;
  onboardingStatus: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  departmentName: string | null;
}

interface SubmissionDetail extends Submission {
  qualifications: Array<{
    id: number;
    qualificationTypeName: string | null;
    dateAchieved: string;
    expiryDate: string | null;
    notes: string | null;
    fileName: string | null;
    fileUrl: string | null;
  }>;
}

interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  totalPages: number;
}

const STATUS_TABS: SubmissionStatus[] = ["pending", "approved", "rejected"];

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_BADGE_CLASSES: Record<SubmissionStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingQueue() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<SubmissionStatus>("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Submission> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Detail dialog
  const [detailSub, setDetailSub] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Approve dialog
  const [approveId, setApproveId] = useState<number | null>(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Reject dialog
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState("");

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/onboarding/submissions?status=${activeTab}&page=${page}&pageSize=20`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Could not load submissions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  async function openDetail(id: number) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/onboarding/submissions/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setDetailSub(await res.json());
    } catch {
      // silently ignore
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Approve ──────────────────────────────────────────────────────────────

  function openApprove(id: number) {
    setApproveId(id);
    setApproveNotes("");
    setApproveError("");
    setTempPassword(null);
    setCopiedPassword(false);
  }

  async function handleApprove() {
    if (!approveId) return;
    setApproveLoading(true);
    setApproveError("");
    try {
      const res = await fetch(
        `/api/onboarding/submissions/${approveId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reviewNotes: approveNotes || null }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setApproveError(body.error ?? "Approval failed. Please try again.");
        return;
      }
      const result = await res.json();
      setTempPassword(result.temporaryPassword);
      fetchSubmissions();
    } catch {
      setApproveError("Could not reach the server.");
    } finally {
      setApproveLoading(false);
    }
  }

  function copyPassword() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    });
  }

  function closeApprove() {
    setApproveId(null);
    setTempPassword(null);
  }

  // ── Reject ───────────────────────────────────────────────────────────────

  function openReject(id: number) {
    setRejectId(id);
    setRejectReason("");
    setRejectNotes("");
    setRejectError("");
  }

  async function handleReject() {
    if (!rejectId || !rejectReason.trim()) {
      setRejectError("A rejection reason is required.");
      return;
    }
    setRejectLoading(true);
    setRejectError("");
    try {
      const res = await fetch(
        `/api/onboarding/submissions/${rejectId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            leaverReason: rejectReason.trim(),
            reviewNotes: rejectNotes.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRejectError(body.error ?? "Rejection failed. Please try again.");
        return;
      }
      setRejectId(null);
      fetchSubmissions();
    } catch {
      setRejectError("Could not reach the server.");
    } finally {
      setRejectLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Onboarding Queue</h1>
        <p className="text-muted-foreground mt-1">Review and process new hire submissions.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setActiveTab(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === s
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {STATUS_LABELS[s]}
            {s === "pending" && data?.total != null && data.total > 0 && activeTab === "pending" && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4">
                {data.total > 99 ? "99+" : data.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive py-10 justify-center">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {activeTab} submissions.</p>
        </div>
      ) : (
        <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>Candidate</TableHead>
                <TableHead className="hidden md:table-cell">Job Title</TableHead>
                <TableHead className="hidden lg:table-cell">Start Date</TableHead>
                <TableHead className="hidden md:table-cell">Submitted</TableHead>
                <TableHead className="w-[140px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((sub) => (
                <TableRow
                  key={sub.id}
                  className="border-border/30 hover:bg-muted/10 transition-colors"
                >
                  <TableCell className="py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-foreground">
                        {sub.firstName} {sub.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground">{sub.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {sub.jobTitle}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {sub.startDate}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {format(parseISO(sub.submittedAt), "d MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => openDetail(sub.id)}
                        disabled={detailLoading}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {activeTab === "pending" && (
                        <>
                          <Button
                            size="sm"
                            className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={(e) => { e.stopPropagation(); openApprove(sub.id); }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); openReject(sub.id); }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      {activeTab !== "pending" && sub.onboardingStatus === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => setLocation(`/employees`)}
                        >
                          View in Directory
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {page} of {data.totalPages} · {data.total} total
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= data.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detail Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!detailSub} onOpenChange={(open) => { if (!open) setDetailSub(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailSub?.firstName} {detailSub?.lastName}
            </DialogTitle>
            <DialogDescription>
              Submitted {detailSub?.submittedAt ? format(parseISO(detailSub.submittedAt), "d MMM yyyy 'at' HH:mm") : ""}
            </DialogDescription>
          </DialogHeader>
          {detailSub && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <span className="text-muted-foreground">Email</span>
                <span className="break-all">{detailSub.email}</span>
                {detailSub.phone && (
                  <>
                    <span className="text-muted-foreground">Phone</span>
                    <span>{detailSub.phone}</span>
                  </>
                )}
                <span className="text-muted-foreground">Job Title</span>
                <span>{detailSub.jobTitle}</span>
                <span className="text-muted-foreground">Employment</span>
                <span className="capitalize">{detailSub.employmentType.replace("_", " ")}</span>
                <span className="text-muted-foreground">Start Date</span>
                <span>{detailSub.startDate}</span>
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant="outline"
                  className={`text-xs w-fit ${STATUS_BADGE_CLASSES[detailSub.onboardingStatus]}`}
                >
                  {STATUS_LABELS[detailSub.onboardingStatus]}
                </Badge>
              </div>

              {detailSub.qualifications?.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                    Qualifications ({detailSub.qualifications.length})
                  </p>
                  {detailSub.qualifications.map((q) => (
                    <div key={q.id} className="border border-border/50 rounded p-2.5 space-y-1 bg-muted/20">
                      <p className="font-medium">{q.qualificationTypeName ?? "Unknown"}</p>
                      <p className="text-muted-foreground text-xs">
                        Achieved: {q.dateAchieved}
                        {q.expiryDate && ` · Expires: ${q.expiryDate}`}
                      </p>
                      {q.notes && <p className="text-muted-foreground text-xs">{q.notes}</p>}
                      {q.fileUrl && (
                        <a
                          href={`/api/storage/objects/${encodeURIComponent(q.fileUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          📎 {q.fileName ?? "View certificate"}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approve Dialog ───────────────────────────────────────────────── */}
      <Dialog open={approveId !== null} onOpenChange={(open) => { if (!open) closeApprove(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Submission</DialogTitle>
            <DialogDescription>
              This will create a WhatIfI Record account for the candidate.
            </DialogDescription>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <p>The account has been created successfully.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Temporary Password</Label>
                <p className="text-xs text-muted-foreground">
                  Share this password securely with the new employee. They will be prompted to change it on first login.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-muted rounded px-3 py-2 border border-border">
                    {tempPassword}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyPassword} className="shrink-0">
                    {copiedPassword ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Pay rates are not set during onboarding — visit this employee's{" "}
                  <strong>Payroll tab</strong> in the Employee Directory to configure them.
                </p>
              </div>

              <DialogFooter>
                <Button onClick={closeApprove} className="w-full">Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="approve-notes">Review Notes (optional)</Label>
                <Textarea
                  id="approve-notes"
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Any notes for the record…"
                  rows={3}
                />
              </div>
              {approveError && (
                <p className="text-sm text-destructive">{approveError}</p>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeApprove} disabled={approveLoading}>
                  Cancel
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {approveLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Approve & Create Account
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ────────────────────────────────────────────────── */}
      <Dialog open={rejectId !== null} onOpenChange={(open) => { if (!open) setRejectId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              The candidate's record will be archived with leaver status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <select
                id="reject-reason"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              >
                <option value="">Select a reason…</option>
                <option value="position_filled">Position filled</option>
                <option value="unsuccessful_application">Unsuccessful application</option>
                <option value="candidate_withdrew">Candidate withdrew</option>
                <option value="failed_background_check">Failed background check</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reject-notes">Notes (optional)</Label>
              <Textarea
                id="reject-notes"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Any additional context…"
                rows={2}
              />
            </div>
            {rejectError && (
              <p className="text-sm text-destructive">{rejectError}</p>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRejectId(null)} disabled={rejectLoading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectLoading || !rejectReason}
              >
                {rejectLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                Confirm Rejection
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
