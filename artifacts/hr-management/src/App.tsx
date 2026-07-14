import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

import CompanyDashboard from '@/pages/CompanyDashboard';
import Dashboard from '@/pages/Dashboard';
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

function MainRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={CompanyDashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/employees" component={EmployeesList} />
        <Route path="/employees/:id" component={EmployeeProfile} />
        <Route path="/departments" component={DepartmentsList} />
        <Route path="/leave" component={LeaveRequestsList} />
        <Route path="/sysadmin" component={SysadminDashboard} />
        <Route path="/sysadmin/users" component={UsersList} />
        <Route path="/sysadmin/roles" component={RolesList} />
        <Route path="/sysadmin/lov" component={ListOfValues} />
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
