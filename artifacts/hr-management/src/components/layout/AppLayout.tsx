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
import { Home, Users, Building2, Calendar, LayoutDashboard, ChevronRight, ShieldCheck, UserCog, Lock, LogOut, ListOrdered, GraduationCap } from "lucide-react";
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

interface Module {
  name: string;
  icon: LucideIcon;
  pages: ModulePage[];
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
      { name: "Leave Requests", href: "/leave", icon: Calendar },
      { name: "Past Employees", href: "/past-employees", icon: Users, hrPastEmployeesOnly: true },
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
    ],
  },
];

function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { setOpenMobile } = useSidebar();
  const { data: health } = useHealthCheck();
  const { user, hasPermission } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();

  const isModuleActive = (mod: Module) =>
    mod.pages.some((page) => location === page.href || location.startsWith(page.href));

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation('/login');
      }
    });
  };

  return (
    <Sidebar variant="sidebar" className="border-r border-border bg-sidebar">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-border/50">
          <img src={logoUrl} alt="WhatIfI Group Ltd" className="w-10 h-10 object-contain" />
          <div className="flex flex-col">
            <span className="font-display font-bold text-sm text-foreground leading-tight">WhatIfI Record</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-4 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location === "/"} tooltip="Home">
              <Link href="/" onClick={() => setOpenMobile(false)} className="flex items-center gap-3 py-2">
                <Home className="h-4 w-4" />
                <span className="font-medium">Home</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {modules
            .filter((mod) => {
              if (mod.adminOnly) return hasPermission('sysadmin');
              if (mod.hrOnly) return hasPermission('hr:access') || hasPermission('sysadmin');
              return true;
            })
            .map((mod) => (
            <Collapsible key={mod.name} defaultOpen={isModuleActive(mod)} className="group/collapsible">
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
                                <span>{page.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4 border-t border-border/50">
        {health && (
          <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground bg-muted/50 rounded-md py-1.5 px-3 w-fit mx-auto border border-border/30">
            <div className={`w-1.5 h-1.5 rounded-full ${health.status === 'ok' ? 'bg-secondary' : 'bg-destructive'}`} />
            <span>API: {health.status.toUpperCase()}</span>
          </div>
        )}
        
        {user && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border shadow-sm">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-sm font-semibold truncate text-foreground">{user.name}</span>
              <span className="text-xs text-muted-foreground truncate">{user.roleName}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout} 
              className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
              disabled={logout.isPending}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const initials = user?.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'HR';

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 flex items-center px-6 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
            <SidebarTrigger className="mr-4 lg:hidden" />
            <div className="flex-1" />
            <div className="flex items-center gap-4">
               {/* Header actions could go here */}
               <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                 {initials}
               </div>
            </div>
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
