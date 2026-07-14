import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Users, ShieldCheck, ArrowUpRight, ShieldX, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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
    name: "SysAdmin",
    description: "User accounts, roles, and system permissions.",
    href: "/sysadmin",
    icon: ShieldCheck,
    permission: "sysadmin",
  },
];

export default function CompanyDashboard() {
  const [, setLocation] = useLocation();
  const { hasPermission } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const visibleModules = modules.filter((m) => !m.permission || hasPermission(m.permission));

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
    </div>
  );
}
