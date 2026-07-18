import { Link } from "wouter";
import {
  Building2,
  UserCog,
  Lock,
  ListOrdered,
  GraduationCap,
  ShieldCheck,
  ChevronRight,
  Mail,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SysadminModule {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const MODULES: SysadminModule[] = [
  {
    title: "Users",
    description: "Manage system accounts, reset passwords, and control user status.",
    href: "/sysadmin/users",
    icon: UserCog,
  },
  {
    title: "Roles",
    description: "Define permission sets and assign them to users across the organisation.",
    href: "/sysadmin/roles",
    icon: Lock,
  },
  {
    title: "Departments",
    description: "Add, rename, or remove the departments employees belong to.",
    href: "/departments",
    icon: Building2,
  },
  {
    title: "List of Values",
    description: "Maintain dropdown options used throughout the system — statuses, types, and more.",
    href: "/sysadmin/lov",
    icon: ListOrdered,
  },
  {
    title: "Qualification Types",
    description: "Configure the catalogue of qualifications that employees can hold.",
    href: "/sysadmin/qualification-types",
    icon: GraduationCap,
  },
  {
    title: "Notifications",
    description: "Edit recipient addresses and email copy for every transactional email the app sends.",
    href: "/sysadmin/notifications",
    icon: Mail,
  },
  {
    title: "Audit Trail",
    description: "Review a record of every interaction with the system, timestamped in GMT.",
    href: "/sysadmin/audit-log",
    icon: ScrollText,
  },
];

export default function SysadminDashboard() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border/50 pb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            SysAdmin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select a section to manage.
          </p>
        </div>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((mod) => (
          <Link key={mod.href} href={mod.href}>
            <div className="group relative bg-card border border-border/50 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-border transition-all duration-200 cursor-pointer h-full flex flex-col gap-4">
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <mod.icon className="w-5 h-5" />
              </div>

              {/* Text */}
              <div className="flex-1">
                <h2 className="text-base font-display font-semibold text-foreground mb-1">
                  {mod.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {mod.description}
                </p>
              </div>

              {/* Arrow */}
              <div className="flex items-center text-sm font-medium text-primary gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                Open <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
