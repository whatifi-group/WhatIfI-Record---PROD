import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Home, Users, Building2, LayoutDashboard, ChevronRight, ShieldCheck, UserCog, Lock, LogOut, ListOrdered, GraduationCap, ClipboardList, AlertTriangle, BookOpen, LifeBuoy, ClipboardCheck, LayoutList, History, IdCard } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import type { LucideIcon } from "lucide-react";
import logoUrl from "@assets/Main_Logo_-_Colour_on_White_1784059733026.PNG";
import { useHealthCheck, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface ModulePage {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Visible only to users with the 'sysadmin' permission. */
  adminOnly?: boolean;
  /** Visible only to users with the 'hr:past_employees' permission (or sysadmin). */
  hrPastEmployeesOnly?: boolean;
}

interface ModuleSubSection {
  name: string;
  icon: LucideIcon;
  pages: ModulePage[];
}

interface Module {
  name: string;
  icon: LucideIcon;
  pages: ModulePage[];
  /** Optional grouped sub-sections rendered as nested collapsibles inside the module. */
  subSections?: ModuleSubSection[];
  /** Visible only to users with the 'sysadmin' permission. */
  adminOnly?: boolean;
  /** Visible only to users with the 'hr:access' permission (or sysadmin). */
  hrOnly?: boolean;
}

const modules: Module[] = [
  {
    name: "Human Resources",
    icon: Users,
    hrOnly: true,
    pages: [
      { name: "Directory", href: "/employees", icon: Users },
      { name: "Work Records", href: "/work-records", icon: ClipboardList },
      { name: "Past Employees", href: "/past-employees", icon: Users, hrPastEmployeesOnly: true },
      { name: "Onboarding", href: "/onboarding-queue", icon: ClipboardCheck },
    ],
    subSections: [
      {
        name: "Qualifications",
        icon: GraduationCap,
        pages: [
          { name: "Qualification Verification", href: "/qualification-verification", icon: ShieldCheck },
          { name: "Expiring Qualifications", href: "/expiring-qualifications", icon: AlertTriangle },
        ],
      },
    ],
  },
  {
    name: "Course Management",
    icon: BookOpen,
    hrOnly: true,
    pages: [
      { name: "Course Management", href: "/course-management", icon: BookOpen },
      { name: "Student Register", href: "/course-management/students", icon: IdCard },
    ],
  },
  {
    name: "Safety",
    icon: LifeBuoy,
    hrOnly: true,
    pages: [
      { name: "Safety", href: "/safety", icon: LifeBuoy },
    ],
  },
  {
    name: "SysAdmin",
    icon: ShieldCheck,
    adminOnly: true,
    pages: [
      { name: "Dashboard", href: "/sysadmin", icon: LayoutDashboard },
      { name: "Departments", href: "/departments", icon: Building2 },
      { name: "Users", href: "/sysadmin/users", icon: UserCog },
      { name: "Roles", href: "/sysadmin/roles", icon: Lock },
      { name: "List of Values", href: "/sysadmin/lov", icon: ListOrdered },
      { name: "Qualification Types", href: "/sysadmin/qualification-types", icon: GraduationCap },
      { name: "Audit Trail", href: "/sysadmin/audit-log", icon: History },
    ],
  },
];

function AppSidebar() {
  const [location] = useLocation();
  const { setOpenMobile, state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";
  const { data: health } = useHealthCheck();
  const { hasPermission } = useAuth();

  // Pending onboarding count — only fetched for HR/SysAdmin users
  const [pendingCount, setPendingCount] = useState(0);
  const canReviewOnboarding = hasPermission('hr:access') || hasPermission('sysadmin');
  const isSelfServiceOnly =
    hasPermission('view_own_profile') &&
    !hasPermission('hr:access') &&
    !hasPermission('sysadmin');

  useEffect(() => {
    if (!canReviewOnboarding) return;
    let cancelled = false;
    const fetchPendingCount = () => {
      fetch('/api/onboarding/submissions?status=pending&page=1&pageSize=1', {
        credentials: 'include',
      })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled && typeof data?.total === 'number') {
            setPendingCount(data.total);
          }
        })
        .catch(() => {});
    };
    // Poll on an interval rather than on every navigation — this badge is
    // background-refreshed sidebar chrome, not a page view, and refetching
    // it on every route change was hitting the API (and cluttering the
    // SysAdmin audit trail with a "Listed submissions" entry) on every
    // single click anywhere in the app.
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [canReviewOnboarding]);

  const isModuleActive = (mod: Module) =>
    mod.pages.some((page) => location === page.href || location.startsWith(page.href)) ||
    (mod.subSections ?? []).some((ss) =>
      ss.pages.some((page) => location === page.href || location.startsWith(page.href)),
    );

  const isSubSectionActive = (ss: ModuleSubSection) =>
    ss.pages.some((page) => location === page.href || location.startsWith(page.href));

  // Which module/sub-section collapsibles are open. Initialized so the
  // section containing the current page starts expanded, then kept in sync
  // on every navigation (below) while still letting the user manually
  // toggle other sections without them snapping shut.
  const [openModules, setOpenModules] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(modules.map((mod) => [mod.name, isModuleActive(mod)])),
  );
  const [openSubSections, setOpenSubSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      modules.flatMap((mod) => (mod.subSections ?? []).map((ss) => [ss.name, isSubSectionActive(ss)])),
    ),
  );

  useEffect(() => {
    const activeModule = modules.find((mod) => isModuleActive(mod));
    if (activeModule) {
      setOpenModules((prev) => (prev[activeModule.name] ? prev : { ...prev, [activeModule.name]: true }));
    }
    for (const mod of modules) {
      for (const ss of mod.subSections ?? []) {
        if (isSubSectionActive(ss)) {
          setOpenSubSections((prev) => (prev[ss.name] ? prev : { ...prev, [ss.name]: true }));
        }
      }
    }
  }, [location]);

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarHeader className={isCollapsed ? "p-3" : "p-4"}>
        <Link
          href="/"
          onClick={() => setOpenMobile(false)}
          className={[
            "flex items-center bg-white rounded-xl shadow-sm border border-border/50 hover:shadow-md transition-all",
            isCollapsed ? "justify-center p-2" : "gap-3 p-2",
          ].join(" ")}
        >
          <img src={logoUrl} alt="WhatIfI Group Ltd" className={isCollapsed ? "w-7 h-7 object-contain" : "w-9 h-9 object-contain shrink-0"} />
          {!isCollapsed && (
            <span className="font-display font-bold text-sm text-foreground leading-tight">WhatIfI Record</span>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-4 py-2">
        <SidebarMenu>
          {/* Home — hidden for self-service-only users (they land on /self-service) */}
          {!isSelfServiceOnly && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location === "/"} tooltip="Home">
                <Link href="/" onClick={() => setOpenMobile(false)} className="flex items-center gap-3 py-2">
                  <Home className="h-4 w-4" />
                  <span className="font-medium">Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {/* My Workspace — self-service employees only */}
          {isSelfServiceOnly && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location === "/self-service"} tooltip="My Workspace">
                <Link href="/self-service" onClick={() => setOpenMobile(false)} className="flex items-center gap-3 py-2">
                  <LayoutList className="h-4 w-4" />
                  <span className="font-medium">My Workspace</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {modules
            .filter((mod) => {
              if (mod.adminOnly) return hasPermission('sysadmin');
              if (mod.hrOnly) return hasPermission('hr:access') || hasPermission('sysadmin');
              return true;
            })
            .map((mod) => (
            <Collapsible
              key={mod.name}
              open={openModules[mod.name] ?? false}
              onOpenChange={(open) => setOpenModules((prev) => ({ ...prev, [mod.name]: open }))}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton isActive={isModuleActive(mod)} tooltip={mod.name}>
                    <mod.icon className="h-4 w-4" />
                    <span className="font-medium">{mod.name}</span>
                    <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {mod.pages
                      .filter((page) => {
                        if (page.adminOnly) return hasPermission('sysadmin');
                        if (page.hrPastEmployeesOnly) return hasPermission('hr:past_employees') || hasPermission('sysadmin');
                        return true;
                      })
                      .map((page) => {
                        const isActive = location === page.href || location.startsWith(page.href);
                        return (
                          <SidebarMenuSubItem key={page.href}>
                            <SidebarMenuSubButton asChild isActive={isActive}>
                              <Link href={page.href} onClick={() => setOpenMobile(false)} className="flex items-center gap-2">
                                <page.icon className="h-4 w-4" />
                                <span className="flex-1">{page.name}</span>
                                {page.href === '/onboarding-queue' && pendingCount > 0 && (
                                  <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold min-w-[1.1rem] h-[1.1rem] px-1">
                                    {pendingCount > 99 ? '99+' : pendingCount}
                                  </span>
                                )}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}

                    {/* Nested sub-sections (e.g. Qualifications under HR) */}
                    {(mod.subSections ?? []).map((ss) => {
                      const ssActive = ss.pages.some(
                        (p) => location === p.href || location.startsWith(p.href),
                      );
                      return (
                        <Collapsible
                          key={ss.name}
                          open={openSubSections[ss.name] ?? false}
                          onOpenChange={(open) => setOpenSubSections((prev) => ({ ...prev, [ss.name]: open }))}
                          className="group/subsection"
                        >
                          <SidebarMenuSubItem>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuSubButton isActive={ssActive} className="gap-2 cursor-pointer">
                                <ss.icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="flex-1 text-sm font-medium">{ss.name}</span>
                                <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-data-[state=open]/subsection:rotate-90" />
                              </SidebarMenuSubButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
                                {ss.pages.map((page) => {
                                  const isActive = location === page.href || location.startsWith(page.href);
                                  return (
                                    <Link
                                      key={page.href}
                                      href={page.href}
                                      onClick={() => setOpenMobile(false)}
                                      className={[
                                        "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm leading-snug transition-colors w-full",
                                        isActive
                                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                                      ].join(" ")}
                                    >
                                      <page.icon className="h-3 w-3 shrink-0" />
                                      <span>{page.name}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </SidebarMenuSubItem>
                        </Collapsible>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {health && (
        <SidebarFooter className="p-3 border-t border-border/50">
          {isCollapsed ? (
            <div title={`API: ${health.status.toUpperCase()}`} className="flex justify-center py-1">
              <div className={`w-2 h-2 rounded-full ${health.status === 'ok' ? 'bg-secondary' : 'bg-destructive'}`} />
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground bg-muted/50 rounded-md py-1.5 px-3 w-fit mx-auto border border-border/30">
              <div className={`w-1.5 h-1.5 rounded-full ${health.status === 'ok' ? 'bg-secondary' : 'bg-destructive'}`} />
              <span>API: {health.status.toUpperCase()}</span>
            </div>
          )}
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleHeaderLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation('/login');
      },
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 flex items-center px-6 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 shrink-0 gap-4">
            <SidebarTrigger className="shrink-0" />
            <div className="flex-1 flex justify-center">
              <GlobalSearch />
            </div>
            {user && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex flex-col items-end leading-tight">
                  <span className="text-sm font-semibold text-foreground truncate max-w-[180px]">{user.name}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">{user.roles.map((r) => r.name).join(", ")}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleHeaderLogout}
                  disabled={logout.isPending}
                  title="Sign out"
                  className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </header>
          <div className="flex-1 overflow-auto p-6 md:p-8">
            <div className="max-w-6xl mx-auto w-full h-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
