import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useListEmployees,
  useListDepartments,
  useListLovItems,
  getListEmployeeWorkRecordsQueryOptions,
} from "@workspace/api-client-react";
import type { Employee, EmployeeWorkRecord } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, ExternalLink, Users, TrendingUp, Calendar, Search } from "lucide-react";
import { format, isWithinInterval, parseISO } from "date-fns";

const shiftTypeColor: Record<string, string> = {
  regular: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  overtime: "bg-amber-100 text-amber-800 border-amber-200",
  night: "bg-indigo-100 text-indigo-800 border-indigo-200",
  weekend: "bg-purple-100 text-purple-800 border-purple-200",
  holiday: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "on-call": "bg-orange-100 text-orange-800 border-orange-200",
  other: "bg-muted text-muted-foreground border-border",
};

interface FlatRow {
  record: EmployeeWorkRecord;
  employee: Employee;
}

export default function WorkRecordsList() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [shiftTypeFilter, setShiftTypeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const { data: employees, isLoading: loadingEmployees } = useListEmployees({ status: "active" as any });
  const { data: departments } = useListDepartments();
  const { data: shiftTypes } = useListLovItems("shift_type");

  // Fan out: fetch work records for every active employee in parallel
  const workRecordQueries = useQueries({
    queries: (employees ?? []).map((emp) =>
      getListEmployeeWorkRecordsQueryOptions(emp.id)
    ),
  });

  const isLoadingRecords = workRecordQueries.some((q) => q.isLoading);

  // Flatten all records with employee context
  const allRows: FlatRow[] = useMemo(() => {
    if (!employees) return [];
    const rows: FlatRow[] = [];
    employees.forEach((emp, idx) => {
      const records = workRecordQueries[idx]?.data ?? [];
      records.forEach((record) => {
        rows.push({ record, employee: emp });
      });
    });
    return rows;
  }, [employees, workRecordQueries]);

  // Apply filters
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allRows.filter(({ record, employee }) => {
      // Text search: employee full name or email
      if (q) {
        const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
        const email = employee.email.toLowerCase();
        if (!fullName.includes(q) && !email.includes(q)) return false;
      }

      // Date range
      if (dateFrom || dateTo) {
        const date = parseISO(record.shiftDate);
        const from = dateFrom ? parseISO(dateFrom) : new Date(0);
        const to = dateTo ? parseISO(dateTo) : new Date(8640000000000000);
        if (!isWithinInterval(date, { start: from, end: to })) return false;
      }

      // Shift type
      if (shiftTypeFilter !== "all" && record.shiftType !== shiftTypeFilter) return false;

      // Department
      if (departmentFilter !== "all" && String(employee.departmentId ?? "") !== departmentFilter) return false;

      return true;
    });
  }, [allRows, searchQuery, dateFrom, dateTo, shiftTypeFilter, departmentFilter]);

  // Sort by date descending, then employee name
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const dateDiff = new Date(b.record.shiftDate).getTime() - new Date(a.record.shiftDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      const nameA = `${a.employee.firstName} ${a.employee.lastName}`;
      const nameB = `${b.employee.firstName} ${b.employee.lastName}`;
      return nameA.localeCompare(nameB);
    });
  }, [filteredRows]);

  // Hours per employee
  const hoursByEmployee = useMemo(() => {
    const map: Record<number, { name: string; hours: number; departmentName: string | null }> = {};
    filteredRows.forEach(({ record, employee }) => {
      if (!map[employee.id]) {
        map[employee.id] = {
          name: `${employee.firstName} ${employee.lastName}`,
          hours: 0,
          departmentName: employee.departmentName,
        };
      }
      map[employee.id].hours += record.hoursWorked ?? 0;
    });
    return Object.entries(map)
      .map(([id, v]) => ({ employeeId: Number(id), ...v }))
      .sort((a, b) => b.hours - a.hours);
  }, [filteredRows]);

  // Hours per department
  const hoursByDept = useMemo(() => {
    const map: Record<string, number> = {};
    filteredRows.forEach(({ record, employee }) => {
      const key = employee.departmentName ?? "No Department";
      map[key] = (map[key] ?? 0) + (record.hoursWorked ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  const totalHours = filteredRows.reduce((sum, { record }) => sum + (record.hoursWorked ?? 0), 0);

  const isLoading = loadingEmployees || isLoadingRecords;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Work Records</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Shift log across all employees — filter by date, shift type, or department.
        </p>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2 lg:col-span-4 space-y-1">
              <Label className="text-xs text-muted-foreground">Search employee</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="search"
                  placeholder="Name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 text-sm pl-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Shift Type</Label>
              <Select value={shiftTypeFilter} onValueChange={setShiftTypeFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {shiftTypes?.filter((t) => t.isActive).map((t) => (
                    <SelectItem key={t.id} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(searchQuery || dateFrom !== thirtyDaysAgo || dateTo !== today || shiftTypeFilter !== "all" || departmentFilter !== "all") && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearchQuery("");
                  setDateFrom(thirtyDaysAgo);
                  setDateTo(today);
                  setShiftTypeFilter("all");
                  setDepartmentFilter("all");
                }}
              >
                Reset filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total hours</p>
                <p className="text-xl font-bold text-foreground">{totalHours.toFixed(1)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10">
                <Calendar className="h-4 w-4 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Shift entries</p>
                <p className="text-xl font-bold text-foreground">{sortedRows.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Users className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Employees with records</p>
                <p className="text-xl font-bold text-foreground">{hoursByEmployee.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main table */}
        <div className="xl:col-span-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading work records…</p>
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Clock className="h-8 w-8 opacity-40" />
              <p className="text-sm">No work records match the current filters.</p>
            </div>
          ) : (
            <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Shift Type</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="hidden lg:table-cell">Notes</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map(({ record, employee }) => (
                    <TableRow key={`${employee.id}-${record.id}`} className="border-border/30">
                      <TableCell className="font-medium text-sm whitespace-nowrap">
                        {employee.firstName} {employee.lastName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {employee.departmentName ?? <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(record.shiftDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${shiftTypeColor[record.shiftType] ?? shiftTypeColor.other}`}
                        >
                          {shiftTypes?.find((t) => t.value === record.shiftType)?.label ?? record.shiftType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{record.startTime ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{record.endTime ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-right">
                        {record.hoursWorked != null ? record.hoursWorked : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[180px] truncate">
                        {record.notes ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/employees/${employee.id}?tab=work-record`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Open employee profile">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex justify-end">
                <span className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{sortedRows.length}</span> entries ·
                  Total <span className="font-semibold text-foreground">{totalHours.toFixed(1)}</span> h
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Side panel: hours summary */}
        {!isLoading && hoursByEmployee.length > 0 && (
          <div className="xl:col-span-1 space-y-4">
            {/* Per-employee */}
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Hours by Employee
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {hoursByEmployee.slice(0, 10).map(({ employeeId, name, hours }) => (
                  <div key={employeeId} className="flex items-center justify-between gap-2">
                    <Link href={`/employees/${employeeId}?tab=work-record`}>
                      <span className="text-xs text-foreground hover:underline cursor-pointer truncate max-w-[120px]">
                        {name}
                      </span>
                    </Link>
                    <span className="text-xs font-medium tabular-nums shrink-0">{hours.toFixed(1)} h</span>
                  </div>
                ))}
                {hoursByEmployee.length > 10 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    +{hoursByEmployee.length - 10} more
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Per-department */}
            {hoursByDept.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-secondary-foreground" />
                    Hours by Department
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {hoursByDept.map(([dept, hours]) => (
                    <div key={dept} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{dept}</span>
                      <span className="text-xs font-medium tabular-nums shrink-0">{hours.toFixed(1)} h</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
