import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserMinus, Building2, CalendarClock, ArrowUpRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Loading dashboard metrics...</p>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center space-y-4 text-center">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-display font-semibold">Unable to load dashboard</h2>
        <p className="text-muted-foreground max-w-md">We couldn't retrieve the latest metrics. Please try again shortly.</p>
      </div>
    );
  }

  const stats = [
    {
      title: "Total Employees",
      value: summary.totalEmployees,
      icon: Users,
      description: `${summary.activeEmployees} active currently`,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "On Leave",
      value: summary.onLeaveEmployees,
      icon: UserMinus,
      description: "Currently on leave",
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "Departments",
      value: summary.totalDepartments,
      icon: Building2,
      description: "Active departments",
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      title: "Pending Requests",
      value: summary.pendingLeaveRequests,
      icon: CalendarClock,
      description: "Awaiting approval",
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">HR Overview</h1>
        <p className="text-muted-foreground mt-1 text-lg">Your daily overview of the WhatIfI Group workforce.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <Card key={i} className="border-border/50 shadow-sm hover-elevate transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Department Headcount</CardTitle>
              <CardDescription>Distribution across departments</CardDescription>
            </div>
            <Link href="/departments" className="text-sm text-primary font-medium flex items-center hover:underline">
              View All <ArrowUpRight className="w-4 h-4 ml-1" />
            </Link>
          </CardHeader>
          <CardContent>
            {summary.departmentBreakdown.length > 0 ? (
              <div className="space-y-4">
                {summary.departmentBreakdown.map((dept) => {
                  const percentage = Math.max(5, (dept.count / summary.totalEmployees) * 100);
                  return (
                    <div key={dept.departmentId} className="flex items-center gap-4 group">
                      <div className="w-1/3 truncate text-sm font-medium">{dept.departmentName}</div>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-secondary rounded-full transition-all duration-1000 ease-out group-hover:bg-primary" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="w-12 text-right text-sm text-muted-foreground font-mono">{dept.count}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No departments established yet.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Recent Joins</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.recentHires.length > 0 ? (
                <div className="space-y-4">
                  {summary.recentHires.slice(0, 3).map((employee) => (
                    <Link key={employee.id} href={`/employees/${employee.id}`} className="flex items-center gap-3 group block">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-bold uppercase shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {employee.firstName[0]}{employee.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {employee.firstName} {employee.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{employee.jobTitle}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No recent hires yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Leave</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.upcomingLeave.length > 0 ? (
                <div className="space-y-4">
                  {summary.upcomingLeave.slice(0, 3).map((leave) => (
                    <div key={leave.id} className="flex flex-col gap-1 border-l-2 border-chart-4 pl-3 py-1">
                      <p className="text-sm font-medium text-foreground">{leave.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(leave.startDate), "MMM d")} - {format(new Date(leave.endDate), "MMM d")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No upcoming approved leave.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
