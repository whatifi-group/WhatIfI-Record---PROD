import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShieldCheck, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ModuleLink {
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
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
  },
];

export default function CompanyDashboard() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">WhatIfI Group</h1>
        <p className="text-muted-foreground mt-1 text-lg">Select a module to get started.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((mod) => (
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
