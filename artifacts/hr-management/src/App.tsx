import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';

import CompanyDashboard from '@/pages/CompanyDashboard';
import Dashboard from '@/pages/Dashboard';
import EmployeesList from '@/pages/EmployeesList';
import EmployeeProfile from '@/pages/EmployeeProfile';
import DepartmentsList from '@/pages/DepartmentsList';
import LeaveRequestsList from '@/pages/LeaveRequestsList';
import SysadminDashboard from '@/pages/sysadmin/SysadminDashboard';
import UsersList from '@/pages/sysadmin/UsersList';
import RolesList from '@/pages/sysadmin/RolesList';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
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
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
