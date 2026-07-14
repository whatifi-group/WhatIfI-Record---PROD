import { useListEmployees } from "@workspace/api-client-react";
import { EmployeeStatus } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, UserX } from "lucide-react";
import { format } from "date-fns";

export default function PastEmployeesList() {
  const [, setLocation] = useLocation();

  const { data: employees, isLoading } = useListEmployees({ status: EmployeeStatus.leaver });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Past Employees</h1>
        <p className="text-muted-foreground mt-1">Employees who have left WhatIfI Group.</p>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !employees || employees.length === 0 ? (
          <div className="p-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <UserX className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-display font-medium text-foreground mb-1">No past employees</h3>
            <p className="text-muted-foreground max-w-sm">There are no employees with a leaver status on record.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-[300px]">Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee, idx) => (
                  <TableRow
                    key={employee.id}
                    className="group border-border/30 hover:bg-muted/10 transition-colors cursor-pointer"
                    style={{ animationDelay: `${idx * 50}ms` }}
                    onClick={() => setLocation(`/employees/${employee.id}`)}
                  >
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-display font-bold uppercase shrink-0">
                          {employee.firstName[0]}{employee.lastName[0]}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {employee.firstName} {employee.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">{employee.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {format(new Date(employee.startDate), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
