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
import LovCategoryDetail from '@/pages/sysadmin/LovCategoryDetail';
import QualificationTypes from '@/pages/sysadmin/QualificationTypes';
import PastEmployeesList from '@/pages/PastEmployeesList';
import WorkRecordsList from '@/pages/WorkRecordsList';
import ExpiringQualifications from '@/pages/ExpiringQualifications';
import LoginPage from '@/pages/LoginPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
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

export function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { hasPermission } = useAuth();
  const [location, setLocation] = useLocation();
  const allowed = hasPermission('sysadmin');
  const isSysadminRoute = location.startsWith('/sysadmin');

  useEffect(() => {
    if (!allowed && isSysadminRoute) {
      setLocation('/?reason=access_denied');
    }
  }, [allowed, isSysadminRoute, setLocation]);

  if (!allowed) {
    // Sysadmin routes: render nothing while the redirect fires (avoids flash)
    // Other guarded routes (e.g. /departments): keep the Access Denied screen
    return isSysadminRoute ? null : <AccessDenied />;
  }
  return <Component />;
}

export function HrRoute({ component: Component }: { component: React.ComponentType }) {
  const { hasPermission } = useAuth();
  if (!hasPermission('hr:access') && !hasPermission('sysadmin')) {
    return <AccessDenied />;
  }
  return <Component />;
}

function PastEmployeesRoute({ component: Component }: { component: React.ComponentType }) {
  const { hasPermission } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!hasPermission('hr:past_employees') && !hasPermission('sysadmin')) {
      setLocation('/');
    }
  }, [hasPermission, setLocation]);

  if (!hasPermission('hr:past_employees') && !hasPermission('sysadmin')) {
    return null;
  }
  return <Component />;
}

function MainRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={CompanyDashboard} />
        <Route path="/employees">
          {() => <HrRoute component={EmployeesList} />}
        </Route>
        <Route path="/employees/:id">
          {() => <HrRoute component={EmployeeProfile} />}
        </Route>
        <Route path="/departments">
          {() => <AdminRoute component={DepartmentsList} />}
        </Route>
        <Route path="/leave">
          {() => <HrRoute component={LeaveRequestsList} />}
        </Route>
        <Route path="/past-employees">
          {() => <PastEmployeesRoute component={PastEmployeesList} />}
        </Route>
        <Route path="/work-records">
          {() => <HrRoute component={WorkRecordsList} />}
        </Route>
        <Route path="/expiring-qualifications">
          {() => <HrRoute component={ExpiringQualifications} />}
        </Route>
        <Route path="/sysadmin">
          {() => <AdminRoute component={SysadminDashboard} />}
        </Route>
        <Route path="/sysadmin/users">
          {() => <AdminRoute component={UsersList} />}
        </Route>
        <Route path="/sysadmin/roles">
          {() => <AdminRoute component={RolesList} />}
        </Route>
        <Route path="/sysadmin/qualification-types">
          {() => <AdminRoute component={QualificationTypes} />}
        </Route>
        <Route path="/sysadmin/lov/:category">
          {() => <AdminRoute component={LovCategoryDetail} />}
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

  const isPublicRoute =
    location === '/login' ||
    location === '/forgot-password' ||
    location.startsWith('/reset-password');

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !isPublicRoute) {
      setLocation('/login');
    } else if (isAuthenticated && isPublicRoute) {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, isPublicRoute, setLocation]);

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
  if (!isAuthenticated && !isPublicRoute) {
    return null;
  }

  if (isAuthenticated && isPublicRoute) {
    return null;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
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
