import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, ShieldCheck, ArrowUpRight, ShieldX, X, AlertTriangle, Loader2, CheckCircle2, ClipboardList, GraduationCap, LifeBuoy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListExpiringQualifications,
  useListPendingDisclosureReviews,
  getListPendingDisclosureReviewsQueryKey,
} from "@workspace/api-client-react";

interface ModuleLink {
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

// Landing page for the whole company system. As new modules are added
// (payroll, recruiting, assets, etc.) register them here — this page
// intentionally only links out to modules, it does not surface data itself.
const modules: ModuleLink[] = [
  {
    name: "Human Resources",
    description: "Employees, departments, and leave requests.",
    href: "/employees",
    icon: Users,
  },
  {
    name: "Course Management",
    description: "Training courses, enrolments, and completions.",
    href: "/course-management",
    icon: GraduationCap,
  },
  {
    name: "Safety",
    description: "Safety records, incidents, and compliance.",
    href: "/safety",
    icon: LifeBuoy,
  },
  {
    name: "SysAdmin",
    description: "User accounts, roles, and system permissions.",
    href: "/sysadmin",
    icon: ShieldCheck,
    permission: "sysadmin",
  },
];

const CHECK_TYPE_LABELS: Record<string, string> = {
  dbs: "DBS",
  pvg: "PVG",
  access_ni: "Access NI",
};

const EXPIRY_WINDOWS = [
  { label: "Expiring within 30 days", days: 30 },
  { label: "Expiring within 60 days", days: 60 },
  { label: "Expiring within 90 days", days: 90 },
] as const;

export default function CompanyDashboard() {
  const [, setLocation] = useLocation();
  const { hasPermission } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const visibleModules = modules.filter((m) => !m.permission || hasPermission(m.permission));

  const canReviewDisclosures =
    hasPermission("review_disclosures") || hasPermission("sysadmin");

  const {
    data: expiringRecords,
    isLoading: expiringLoading,
    isError: expiringError,
  } = useListExpiringQualifications({ withinDays: 90 });

  const {
    data: pendingReviews,
    isLoading: pendingLoading,
    isError: pendingError,
  } = useListPendingDisclosureReviews({
    query: { enabled: canReviewDisclosures, queryKey: getListPendingDisclosureReviewsQueryKey() },
  });

  const countWithin = (days: number) =>
    expiringRecords?.filter((r) => r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= days).length ?? 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "access_denied") {
      setShowBanner(true);
      // Strip the query param from the URL without triggering a navigation/re-render
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {showBanner && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-3">
          <ShieldX className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="flex-1 text-sm">
            You were redirected here because you don't have permission to access that page. Contact your system administrator if you think this is a mistake.
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40 -mt-0.5 -mr-1"
            onClick={() => setShowBanner(false)}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </Alert>
      )}

      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">WhatIfI Group</h1>
        <p className="text-muted-foreground mt-1 text-lg">Select a module to get started.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleModules.map((mod) => (
          <Link key={mod.href} href={mod.href}>
            <Card className="border-border/50 shadow-sm hover-elevate transition-all cursor-pointer group h-full">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <mod.icon className="w-6 h-6 text-primary" />
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <CardTitle className="text-xl font-display pt-2">{mod.name}</CardTitle>
                <CardDescription>{mod.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>

      {/* Alerts section */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Alerts</h2>
        <div className="flex flex-col gap-4 max-w-lg">

          {/* Expiring Qualifications */}
          <Link href="/expiring-qualifications">
            <Card className="border-border/50 shadow-sm hover-elevate transition-all cursor-pointer group">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <CardTitle className="text-base font-semibold">Expiring Qualifications</CardTitle>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                </div>
                <CardDescription>Qualifications expiring across all employees.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 pb-1">
                {expiringLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
                {expiringError && (
                  <p className="text-sm text-muted-foreground px-6 py-4">
                    Could not load expiry data.
                  </p>
                )}
                {!expiringLoading && !expiringError && (
                  <table className="w-full text-sm">
                    <tbody>
                      {EXPIRY_WINDOWS.map((w, i) => (
                        <tr
                          key={w.days}
                          className={`${i < EXPIRY_WINDOWS.length - 1 ? "border-b border-border/30" : ""} hover:bg-muted/20 transition-colors`}
                        >
                          <td className="px-6 py-3 text-muted-foreground">{w.label}</td>
                          <td className="px-6 py-3 text-right font-semibold tabular-nums">
                            <span
                              className={
                                countWithin(w.days) > 0
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }
                            >
                              {countWithin(w.days)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* Disclosure Reviews Pending — visible to review_disclosures / sysadmin only */}
          {canReviewDisclosures && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-rose-500" />
                  <CardTitle className="text-base font-semibold">Disclosure Reviews Pending</CardTitle>
                  {!pendingLoading && !pendingError && pendingReviews && pendingReviews.length > 0 && (
                    <Badge variant="destructive" className="ml-auto tabular-nums">
                      {pendingReviews.length}
                    </Badge>
                  )}
                </div>
                <CardDescription>Employees with conviction details awaiting senior sign-off.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 pb-1">
                {pendingLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
                {pendingError && (
                  <p className="text-sm text-muted-foreground px-6 py-4">
                    Could not load pending reviews.
                  </p>
                )}
                {!pendingLoading && !pendingError && pendingReviews && pendingReviews.length === 0 && (
                  <div className="flex items-center gap-2 px-6 py-4 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>All clear — no outstanding reviews.</span>
                  </div>
                )}
                {!pendingLoading && !pendingError && pendingReviews && pendingReviews.length > 0 && (
                  <table className="w-full text-sm">
                    <tbody>
                      {pendingReviews.map((r, i) => (
                        <tr
                          key={r.disclosureId}
                          className={`${i < pendingReviews.length - 1 ? "border-b border-border/30" : ""} hover:bg-muted/20 transition-colors`}
                        >
                          <td className="px-6 py-3">
                            <Link
                              href={`/employees/${r.employeeId}?tab=disclosures`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium hover:text-primary transition-colors"
                            >
                              {r.employeeFirstName} {r.employeeLastName}
                            </Link>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {CHECK_TYPE_LABELS[r.checkType] ?? r.checkType}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                            {r.daysPending === 0
                              ? "Today"
                              : r.daysPending === 1
                                ? "1 day"
                                : `${r.daysPending} days`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
