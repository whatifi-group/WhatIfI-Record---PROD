import { useState } from "react";
import { Link } from "wouter";
import {
  useListExpiringQualifications,
  getListExpiringQualificationsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ExternalLink, GraduationCap } from "lucide-react";
import { format } from "date-fns";
import TabErrorState from "@/components/TabErrorState";

const WINDOWS = [
  { label: "Expired", days: 0 },
  { label: "Next 30 days", days: 30 },
  { label: "Next 60 days", days: 60 },
  { label: "Next 90 days", days: 90 },
] as const;

function statusBadge(daysUntilExpiry: number) {
  if (daysUntilExpiry < 0) {
    return (
      <Badge className="bg-destructive/80 text-white hover:bg-destructive/70">
        Expired
      </Badge>
    );
  }
  if (daysUntilExpiry <= 14) {
    return (
      <Badge className="bg-amber-600 text-white hover:bg-amber-600/90">
        Expires in {daysUntilExpiry}d
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-400">
      Expires in {daysUntilExpiry}d
    </Badge>
  );
}

export default function ExpiringQualifications() {
  const [withinDays, setWithinDays] = useState<number>(30);

  const { data: records, isLoading, isError, refetch } = useListExpiringQualifications(
    { withinDays },
    { query: { queryKey: getListExpiringQualificationsQueryKey({ withinDays }) } },
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Expiring Qualifications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Qualification records that are expired or expiring soon across all employees.
          </p>
        </div>
      </div>

      {/* Time window filter */}
      <div className="flex gap-2 flex-wrap">
        {WINDOWS.map((w) => (
          <Button
            key={w.days}
            size="sm"
            variant={withinDays === w.days ? "default" : "outline"}
            onClick={() => setWithinDays(w.days)}
          >
            {w.label}
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
          message="Could not load expiring qualifications. Check your connection and try again."
        />
      )}

      {!isLoading && !isError && records && records.length === 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <GraduationCap className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {withinDays === 0
                ? "No expired qualifications found."
                : `No qualifications expiring within ${withinDays} days.`}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && records && records.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {records.length} record{records.length !== 1 ? "s" : ""}
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
                      Awarding Body
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Date Achieved
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Expiry Date
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">
                      Status
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {r.employeeFirstName} {r.employeeLastName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.qualificationTypeName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.awardingBody ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.dateAchieved
                          ? format(new Date(r.dateAchieved as unknown as string), "dd MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.expiryDate
                          ? format(new Date(r.expiryDate as unknown as string), "dd MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {statusBadge(r.daysUntilExpiry)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/employees/${r.employeeId}?tab=qualifications`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
