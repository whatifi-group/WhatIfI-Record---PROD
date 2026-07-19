import { useState, type ReactNode } from "react";
import { useListAuditLog, type AuditLogEntry } from "@workspace/api-client-react";
import { ScrollText, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const PAGE_SIZE = 50;

// en-GB + timeZone: "UTC" gives dd/mm/yyyy, hh:mm:ss in GMT regardless of the
// viewer's local timezone — no extra date library needed for this.
const GMT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatGmt(isoTimestamp: string): string {
  return GMT_FORMATTER.format(new Date(isoTimestamp)).replace(",", "");
}

function statusBadgeClass(statusCode: number): string {
  if (statusCode >= 500) return "bg-destructive/10 text-destructive border-destructive/20";
  if (statusCode >= 400) return "bg-chart-4/10 text-chart-4 border-chart-4/20";
  return "bg-chart-2/10 text-chart-2 border-chart-2/20";
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** VIEW rows are client-reported "how long was this open" events, not real HTTP responses — show a duration badge instead of a status code. */
function StatusOrDuration({ entry }: { entry: AuditLogEntry }) {
  if (entry.method === "VIEW" && entry.durationMs != null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border bg-chart-3/10 text-chart-3 border-chart-3/20">
        <Clock className="w-3 h-3" /> {formatDurationMs(entry.durationMs)}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${statusBadgeClass(entry.statusCode)}`}>
      {entry.statusCode}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function AuditEntryDialog({
  entry,
  onOpenChange,
}: {
  entry: AuditLogEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit entry #{entry?.id}</DialogTitle>
          <DialogDescription>Full detail of what was done or viewed, exactly as recorded.</DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Date/Time (GMT)" value={formatGmt(entry.timestamp)} />
              <DetailRow label="Module" value={<Badge variant="outline" className="capitalize">{entry.module}</Badge>} />
              <DetailRow label="User" value={entry.userName ?? <span className="italic">Unauthenticated</span>} />
              <DetailRow
                label={entry.method === "VIEW" ? "Duration" : "Status"}
                value={
                  entry.method === "VIEW" ? (
                    <StatusOrDuration entry={entry} />
                  ) : (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${statusBadgeClass(entry.statusCode)}`}>
                      {entry.method} {entry.statusCode}
                    </span>
                  )
                }
              />
            </div>
            <DetailRow label="Path" value={<code className="text-xs">{entry.path}</code>} />
            <DetailRow
              label="Action"
              value={
                <pre className="whitespace-pre-wrap break-words text-xs bg-muted/30 border border-border/50 rounded-lg p-3 max-h-[40vh] overflow-y-auto">
                  {entry.action}
                </pre>
              }
            />
            {entry.ipAddress && <DetailRow label="IP Address" value={entry.ipAddress} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AuditLog() {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const { data, isLoading } = useListAuditLog({
    module: moduleFilter === "all" ? undefined : moduleFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const entries = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Modules are free-form strings tagged by the backend as new sections are
  // added (see api-server middlewares/auditLog.ts) — the filter list is
  // simply whatever appears on the current page, so it stays in sync
  // automatically without a hardcoded list of modules.
  const modulesOnPage = Array.from(new Set(entries.map((e) => e.module))).sort();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <ScrollText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Audit Trail</h1>
            <p className="text-sm text-muted-foreground mt-1">
              A record of every interaction with the system. Timestamps are shown in GMT.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border/50 bg-muted/10 flex items-center gap-3">
          <Select
            value={moduleFilter}
            onValueChange={(v) => {
              setModuleFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modulesOnPage.map((mod) => (
                <SelectItem key={mod} value={mod}>
                  {mod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{total} entries</span>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-semibold w-[180px]">Date/Time (GMT)</th>
                <th className="px-6 py-4 font-semibold w-[140px]">Module</th>
                <th className="px-6 py-4 font-semibold">Action</th>
                <th className="px-6 py-4 font-semibold w-[180px]">User</th>
                <th className="px-6 py-4 font-semibold text-center w-[100px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  </td>
                </tr>
              ) : entries.length > 0 ? (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <td className="px-6 py-4 align-top font-mono text-xs text-muted-foreground">
                      {formatGmt(entry.timestamp)}
                    </td>
                    <td className="px-6 py-4 align-top">
                      <Badge variant="outline" className="capitalize">
                        {entry.module}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 align-top text-foreground">
                      <span className="line-clamp-2 max-w-[480px]" title="Click the row for full detail">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top text-muted-foreground">
                      {entry.userName ?? <span className="italic">Unauthenticated</span>}
                    </td>
                    <td className="px-6 py-4 align-top text-center">
                      <StatusOrDuration entry={entry} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <ScrollText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-foreground">No audit entries found</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border/50 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <AuditEntryDialog entry={selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)} />
    </div>
  );
}
