import { useGetSysadminSummary } from "@workspace/api-client-react";
import { Users, Shield, UserX, ShieldCheck, Activity, KeyRound, Clock } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function SysadminDashboard() {
  const { data: summary, isLoading } = useGetSysadminSummary();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-muted/50 rounded-xl w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-muted/30 rounded-xl"></div>
          ))}
        </div>
        <div className="h-64 bg-muted/20 rounded-xl"></div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">SysAdmin Control</h1>
            <p className="text-sm text-muted-foreground mt-1">System overview, access metrics, and security controls.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1 relative z-10">Total Users</p>
          <h3 className="text-3xl font-display font-bold text-foreground relative z-10">{summary.totalUsers}</h3>
        </div>

        <div className="bg-card border border-border/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="p-2.5 bg-secondary/10 text-secondary rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1 relative z-10">Active Users</p>
          <h3 className="text-3xl font-display font-bold text-foreground relative z-10">{summary.activeUsers}</h3>
        </div>

        <div className="bg-card border border-border/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="p-2.5 bg-destructive/10 text-destructive rounded-lg">
              <UserX className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1 relative z-10">Suspended Users</p>
          <h3 className="text-3xl font-display font-bold text-foreground relative z-10">{summary.suspendedUsers ?? 0}</h3>
        </div>

        <div className="bg-card border border-border/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1 relative z-10">Total Roles</p>
          <h3 className="text-3xl font-display font-bold text-foreground relative z-10">{summary.totalRoles}</h3>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-border/50 flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-display font-semibold text-foreground">Recent Users</h2>
          </div>
          <Link href="/sysadmin/users" className="text-sm text-primary font-medium hover:underline">
            View All
          </Link>
        </div>
        
        {summary.recentUsers && summary.recentUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {summary.recentUsers.map((user, idx) => (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors" style={{ animationDelay: `${idx * 50}ms` }}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{user.name}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium">{user.roleName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        user.status === 'active' ? 'bg-secondary/10 text-secondary' :
                        user.status === 'suspended' ? 'bg-destructive/10 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(new Date(user.createdAt), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground">No recent users</h3>
            <p className="text-sm text-muted-foreground">The system hasn't recorded any users recently.</p>
          </div>
        )}
      </div>
    </div>
  );
}
