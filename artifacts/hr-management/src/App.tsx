import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldX } from 'lucide-react';
import React, { useEffect } from 'react';

import CompanyDashboard from '@/pages/CompanyDashboard';
import EmployeesList from '@/pages/EmployeesList';
import EmployeeProfile from '@/pages/EmployeeProfile';
import DepartmentsList from '@/pages/DepartmentsList';
import LeaveRequestsList from '@/pages/LeaveRequestsList';
import SysadminDashboard from '@/pages/sysadmin/SysadminDashboard';
import UsersList from '@/pages/sysadmin/UsersList';
import RolesList from '@/pages/sysadmin/RolesList';
import ListOfValues from '@/pages/sysadmin/ListOfValues';
import LoginPage from '@/pages/LoginPage';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
        <ShieldX className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          You don't have permission to view this page. Contact your system administrator if you believe this is an error.
        </p>
      </div>
    </div>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { hasPermission } = useAuth();
  if (!hasPermission('sysadmin')) {
    return <AccessDenied />;
  }
  return <Component />;
}

function MainRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={CompanyDashboard} />
        <Route path="/employees" component={EmployeesList} />
        <Route path="/employees/:id" component={EmployeeProfile} />
        <Route path="/departments">
          {() => <AdminRoute component={DepartmentsList} />}
        </Route>
        <Route path="/leave" component={LeaveRequestsList} />
        <Route path="/sysadmin">
          {() => <AdminRoute component={SysadminDashboard} />}
        </Route>
        <Route path="/sysadmin/users">
          {() => <AdminRoute component={UsersList} />}
        </Route>
        <Route path="/sysadmin/roles">
          {() => <AdminRoute component={RolesList} />}
        </Route>
        <Route path="/sysadmin/lov">
          {() => <AdminRoute component={ListOfValues} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && location !== '/login') {
      setLocation('/login');
    } else if (isAuthenticated && location === '/login') {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm font-medium">Loading session...</p>
        </div>
      </div>
    );
  }

  // Prevent flash of content before redirecting
  if (!isAuthenticated && location !== '/login') {
    return null; 
  }
  
  if (isAuthenticated && location === '/login') {
    return null;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route component={MainRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
