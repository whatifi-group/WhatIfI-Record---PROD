import { useState, useMemo } from "react";
import { useListEmployees } from "@workspace/api-client-react";
import { EmployeeStatus } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, UserX, Search, X } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

export default function PastEmployeesList() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [, setLocation] = useLocation();

  const { data: employees, isLoading } = useListEmployees({ status: EmployeeStatus.leaver });

  const hasDateFilter = dateFrom !== "" || dateTo !== "";

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];

    return employees.filter((emp) => {
      // Text search
      if (search !== "") {
        const q = search.toLowerCase();
        const nameEmailMatch =
          (emp.firstName ?? "").toLowerCase().includes(q) ||
          (emp.lastName ?? "").toLowerCase().includes(q) ||
          (emp.email ?? "").toLowerCase().includes(q);
        if (!nameEmailMatch) return false;
      }

      // Date range filter on leaverDate
      if (hasDateFilter && emp.leaverDate) {
        const leaveDate = parseISO(
          typeof emp.leaverDate === "string"
            ? emp.leaverDate
            : (emp.leaverDate as Date).toISOString(),
        );
        if (!isValid(leaveDate)) return true;

        if (dateFrom !== "") {
          const from = parseISO(dateFrom);
          if (isValid(from) && leaveDate < from) return false;
        }
        if (dateTo !== "") {
          // Include the full "to" day
          const to = parseISO(dateTo);
          if (isValid(to)) {
            to.setHours(23, 59, 59, 999);
            if (leaveDate > to) return false;
          }
        }
      } else if (hasDateFilter && !emp.leaverDate) {
        // If a date filter is active, exclude employees with no leaving date recorded
        return false;
      }

      return true;
    });
  }, [employees, search, dateFrom, dateTo, hasDateFilter]);

  const clearDateFilter = () => {
    setDateFrom("");
    setDateTo("");
  };

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
          <>
            <div className="p-4 border-b border-border/50 bg-muted/20 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-background border-border/50"
                />
              </div>

              {/* Date range filter */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <Label htmlFor="date-from" className="text-xs text-muted-foreground">
                    Left from
                  </Label>
                  <DatePicker
                    id="date-from"
                    value={dateFrom}
                    onChange={setDateFrom}
                    className="bg-background border-border/50 text-sm h-9"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <Label htmlFor="date-to" className="text-xs text-muted-foreground">
                    Left to
                  </Label>
                  <DatePicker
                    id="date-to"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={setDateTo}
                    className="bg-background border-border/50 text-sm h-9"
                  />
                </div>
                {hasDateFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearDateFilter}
                    className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear dates
                  </Button>
                )}
              </div>
            </div>

            {filteredEmployees.length === 0 ? (
              <div className="p-16 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <UserX className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-display font-medium text-foreground mb-1">No matches found</h3>
                <p className="text-muted-foreground max-w-sm">
                  No past employees match your filters. Try adjusting your search or date range.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="w-[300px]">Employee</TableHead>
                      <TableHead className="hidden md:table-cell">Joined</TableHead>
                      <TableHead className="hidden md:table-cell">Left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((employee, idx) => (
                      <TableRow
                        key={employee.id}
                        className="group border-border/30 hover:bg-muted/10 transition-colors cursor-pointer"
                        style={{ animationDelay: `${idx * 50}ms` }}
                        onClick={() => setLocation(`/employees/${employee.id}`)}
                      >
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-display font-bold uppercase shrink-0">
                              {employee.firstName?.[0] ?? ""}{employee.lastName?.[0] ?? ""}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                {(employee.firstName || employee.lastName)
                                  ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
                                  : "(No name on record)"}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">{employee.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {format(new Date(employee.startDate), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {employee.leaverDate
                            ? format(new Date(employee.leaverDate as string), "dd/MM/yyyy")
                            : <span className="text-muted-foreground/50 italic">Not recorded</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
