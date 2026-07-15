import { useState } from "react";
import { Link } from "wouter";
import {
  useListQualificationVerifications,
  useVerifyEmployeeQualification,
  getListQualificationVerificationsQueryKey,
  getListEmployeeQualificationsQueryKey,
} from "@workspace/api-client-react";
import type { QualificationVerificationRow } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import TabErrorState from "@/components/TabErrorState";
import {
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Eye,
} from "lucide-react";
import { format, parseISO } from "date-fns";

type StatusTab = "pending" | "verified" | "rejected";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

function resolveFileHref(fileUrl: string): string {
  if (fileUrl.startsWith("/objects/")) {
    return `/api/storage${fileUrl}`;
  }
  return fileUrl;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "d MMM yyyy");
  } catch {
    return dateStr;
  }
}

function StatusBadge({ status }: { status: StatusTab }) {
  if (status === "verified") {
    return (
      <Badge className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-100 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Verified
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/10">
        <XCircle className="w-3 h-3 mr-1" />
        Rejected
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      <Clock className="w-3 h-3 mr-1" />
      Pending
    </Badge>
  );
}

interface ReviewModalProps {
  row: QualificationVerificationRow;
  onClose: () => void;
  onDone: () => void;
}

function ReviewModal({ row, onClose, onDone }: ReviewModalProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const verifyMutation = useVerifyEmployeeQualification();

  const handleAction = (status: "verified" | "rejected") => {
    verifyMutation.mutate(
      {
        id: row.employeeId,
        qualId: row.id,
        data: { status, notes: notes || null },
      },
      {
        onSuccess: () => {
          toast({
            title: status === "verified" ? "Qualification verified" : "Qualification rejected",
          });
          onDone();
        },
        onError: () =>
          toast({ title: "Action failed", variant: "destructive" }),
      },
    );
  };

  const isBusy = verifyMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Qualification</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Employee</p>
              <p className="font-medium">
                {row.employeeFirstName} {row.employeeLastName}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Qualification</p>
              <p className="font-medium">
                {row.qualificationTypeName ?? `Type #${row.qualificationTypeId}`}
              </p>
            </div>
            {row.awardingBody && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Awarding Body</p>
                <p>{row.awardingBody}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Date Achieved</p>
              <p>{formatDate(row.dateAchieved)}</p>
            </div>
            {row.expiryDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Expiry Date</p>
                <p>{formatDate(row.expiryDate)}</p>
              </div>
            )}
            {row.notes && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                <p className="italic text-muted-foreground">{row.notes}</p>
              </div>
            )}
          </div>

          {row.certificateUrl && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Certificate</p>
              <a
                href={resolveFileHref(row.certificateUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs"
              >
                <ExternalLink className="w-3 h-3" />
                {row.certificateFileName ?? "View certificate"}
              </a>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="review-notes" className="text-xs">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="review-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add verification notes..."
              rows={3}
              disabled={isBusy}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleAction("rejected")}
            disabled={isBusy}
            className="gap-1.5"
          >
            {isBusy && verifyMutation.variables?.data.status === "rejected" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            Reject
          </Button>
          <Button
            onClick={() => handleAction("verified")}
            disabled={isBusy}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            {isBusy && verifyMutation.variables?.data.status === "verified" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function QualificationVerification() {
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [reviewingRow, setReviewingRow] = useState<QualificationVerificationRow | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: rows, isLoading, isError, refetch } = useListQualificationVerifications(
    { status: activeTab },
    { query: { queryKey: getListQualificationVerificationsQueryKey({ status: activeTab }) } },
  );

  const handleDone = () => {
    const row = reviewingRow;
    setReviewingRow(null);
    // Invalidate all status tabs and the employee's qualification list
    queryClient.invalidateQueries({ queryKey: getListQualificationVerificationsQueryKey({ status: "pending" }) });
    queryClient.invalidateQueries({ queryKey: getListQualificationVerificationsQueryKey({ status: "verified" }) });
    queryClient.invalidateQueries({ queryKey: getListQualificationVerificationsQueryKey({ status: "rejected" }) });
    if (row) {
      queryClient.invalidateQueries({
        queryKey: getListEmployeeQualificationsQueryKey(row.employeeId),
      });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Qualification Verification
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve or reject employee qualifications.
          </p>
        </div>
      </div>

      {/* Tab filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={activeTab === tab.key ? "default" : "outline"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <TabErrorState
          onRetry={refetch}
          message="Could not load qualifications. Check your connection and try again."
        />
      )}

      {!isLoading && !isError && rows && rows.length === 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              No {activeTab} qualifications found.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && rows && rows.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {rows.length} qualification{rows.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Employee
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Qualification
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Date Achieved
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Expiry
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Status
                    </th>
                    {activeTab !== "pending" && (
                      <th className="text-left font-medium text-muted-foreground px-4 py-3">
                        Reviewed By
                      </th>
                    )}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/employees/${row.employeeId}?tab=qualifications`}
                          className="hover:underline text-primary"
                        >
                          {row.employeeFirstName} {row.employeeLastName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">
                            {row.qualificationTypeName ?? `Type #${row.qualificationTypeId}`}
                          </p>
                          {row.awardingBody && (
                            <p className="text-xs text-muted-foreground">{row.awardingBody}</p>
                          )}
                          {row.notes && (
                            <p className="text-xs text-muted-foreground italic mt-0.5 max-w-[200px] truncate">
                              {row.notes}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(row.dateAchieved)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.expiryDate ? formatDate(row.expiryDate) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusBadge status={row.verificationStatus as StatusTab} />
                          {row.verificationNotes && (
                            <p className="text-xs text-muted-foreground italic max-w-[160px] truncate">
                              {row.verificationNotes}
                            </p>
                          )}
                        </div>
                      </td>
                      {activeTab !== "pending" && (
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {row.verifiedByName && (
                            <div>
                              <p>{row.verifiedByName}</p>
                              {row.verifiedAt && (
                                <p className="text-muted-foreground/60">
                                  {formatDate(row.verifiedAt as unknown as string)}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {row.certificateUrl && (
                            <a
                              href={resolveFileHref(row.certificateUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title={row.certificateFileName ?? "Certificate"}
                            >
                              <ExternalLink className="w-3 h-3" />
                              Cert
                            </a>
                          )}
                          {activeTab === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setReviewingRow(row)}
                            >
                              <Eye className="w-3 h-3" />
                              Review
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {reviewingRow && (
        <ReviewModal
          row={reviewingRow}
          onClose={() => setReviewingRow(null)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
