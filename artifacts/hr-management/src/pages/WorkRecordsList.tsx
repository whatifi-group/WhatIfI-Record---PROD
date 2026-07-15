import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useListWorkRecords, useListDepartments, useListLovItems, listWorkRecords, EmployeeStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Clock, ExternalLink, Users, TrendingUp, Calendar, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { buildCsv, workRecordsCsvFilename } from "@/lib/csvUtils";
import { useToast } from "@/hooks/use-toast";

const shiftTypeColor: Record<string, string> = {
  regular: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  overtime: "bg-amber-100 text-amber-800 border-amber-200",
  night: "bg-indigo-100 text-indigo-800 border-indigo-200",
  weekend: "bg-purple-100 text-purple-800 border-purple-200",
  holiday: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "on-call": "bg-orange-100 text-orange-800 border-orange-200",
  other: "bg-muted text-muted-foreground border-border",
};

export default function WorkRecordsList() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [shiftTypeFilter, setShiftTypeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [includeFormer, setIncludeFormer] = useState(false);
  const [page, setPage] = useState(1);
  const [csvLoading, setCsvLoading] = useState(false);
  const { toast } = useToast();

  // Debounce search input — 300 ms
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Reset to page 1 whenever any server-side filter changes
  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, shiftTypeFilter, departmentFilter, includeFormer, debouncedSearch]);

  const { data: departments } = useListDepartments();
  const { data: shiftTypes } = useListLovItems("shift_type");

  // Single aggregated request — server applies all filters including search.
  const { data, isLoading } = useListWorkRecords({
    from: dateFrom || undefined,
    to: dateTo || undefined,
    shiftType: shiftTypeFilter !== "all" ? shiftTypeFilter : undefined,
    departmentId: departmentFilter !== "all" ? Number(departmentFilter) : undefined,
    employeeStatus: !includeFormer ? "active" : undefined,
    search: debouncedSearch || undefined,
    page,
    pageSize: 50,
  });

  const rows = data?.rows ?? [];

  // Sort by date descending, then employee name
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dateDiff = new Date(b.shiftDate).getTime() - new Date(a.shiftDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      const nameA = `${a.employeeFirstName} ${a.employeeLastName}`;
      const nameB = `${b.employeeFirstName} ${b.employeeLastName}`;
      return nameA.localeCompare(nameB);
    });
  }, [rows]);

  // Hours per employee
  const hoursByEmployee = useMemo(() => {
    const map: Record<number, { name: string; hours: number; isFormer: boolean }> = {};
    rows.forEach((row) => {
      if (!map[row.employeeId]) {
        map[row.employeeId] = {
          name: `${row.employeeFirstName} ${row.employeeLastName}`,
          hours: 0,
          isFormer: row.employeeStatus !== "active",
        };
      }
      map[row.employeeId].hours += row.hoursWorked ?? 0;
    });
    return Object.entries(map)
      .map(([id, v]) => ({ employeeId: Number(id), ...v }))
      .sort((a, b) => b.hours - a.hours);
  }, [rows]);

  // Hours per department
  const hoursByDept = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((row) => {
      const key = row.employeeDepartmentName ?? "No Department";
      map[key] = (map[key] ?? 0) + (row.hoursWorked ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const totalHours = rows.reduce((sum, row) => sum + (row.hoursWorked ?? 0), 0);

  async function exportCsv() {
    const headers = [
      "Employee Name",
      "Department",
      "Date",
      "Shift Type",
      "Start",
      "End",
      "Hours",
      "Notes",
      "Employee Status",
      "Leaving Date",
      "Leaving Reason",
    ];

    // Fetch all matching records by paginating with max allowed pageSize
    setCsvLoading(true);
    const CSV_PAGE_SIZE = 200;
    const baseParams = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      shiftType: shiftTypeFilter !== "all" ? shiftTypeFilter : undefined,
      departmentId: departmentFilter !== "all" ? Number(departmentFilter) : undefined,
      employeeStatus: !includeFormer ? EmployeeStatus.active : undefined,
      search: debouncedSearch || undefined,
      pageSize: CSV_PAGE_SIZE,
    };

    let allRows;
    try {
      // First page also gives us the total so we know how many more to fetch
      const firstPage = await listWorkRecords({ ...baseParams, page: 1 });
      allRows = [...firstPage.rows];
      const totalPages = firstPage.totalPages;
      if (totalPages > 1) {
        const remaining = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) =>
            listWorkRecords({ ...baseParams, page: i + 2 }),
          ),
        );
        for (const r of remaining) allRows.push(...r.rows);
      }
    } catch {
      toast({
        title: "Export failed",
        description: "Could not download work records. Please try again.",
        variant: "destructive",
      });
      return;
    } finally {
      setCsvLoading(false);
    }

    const sorted = [...allRows].sort((a, b) => {
      const dateDiff = new Date(b.shiftDate).getTime() - new Date(a.shiftDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      const nameA = `${a.employeeFirstName} ${a.employeeLastName}`;
      const nameB = `${b.employeeFirstName} ${b.employeeLastName}`;
      return nameA.localeCompare(nameB);
    });

    const dataRows = sorted.map((row) => [
      `${row.employeeFirstName} ${row.employeeLastName}`,
      row.employeeDepartmentName ?? "",
      row.shiftDate,
      shiftTypes?.find((t) => t.value === row.shiftType)?.label ?? row.shiftType,
      row.startTime ?? "",
      row.endTime ?? "",
      row.hoursWorked ?? "",
      row.notes ?? "",
      row.employeeStatus === "active" ? "Active" : "Former",
      row.employeeLeaverDate ?? "",
      row.employeeLeaverReason ?? "",
    ]);

    const csv = buildCsv(headers, dataRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = workRecordsCsvFilename(dateFrom, dateTo);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Work Records</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shift log across all employees — filter by date, shift type, or department.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={exportCsv}
          disabled={isLoading || csvLoading || sortedRows.length === 0}
        >
          {csvLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {csvLoading ? "Exporting…" : "Export CSV"}
        </Button>
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
                  onChange={(e) => handleSearchChange(e.target.value)}
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
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="include-former"
                checked={includeFormer}
                onCheckedChange={setIncludeFormer}
              />
              <Label htmlFor="include-former" className="text-xs text-muted-foreground cursor-pointer select-none">
                Include former employees
              </Label>
            </div>
            {(searchQuery || dateFrom !== thirtyDaysAgo || dateTo !== today || shiftTypeFilter !== "all" || departmentFilter !== "all" || includeFormer) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  handleSearchChange("");
                  setDateFrom(thirtyDaysAgo);
                  setDateTo(today);
                  setShiftTypeFilter("all");
                  setDepartmentFilter("all");
                  setIncludeFormer(false);
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
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
                  {sortedRows.map((row) => (
                    <TableRow
                      key={`${row.employeeId}-${row.id}`}
                      className={`border-border/30 ${row.employeeStatus !== "active" ? "opacity-75" : ""}`}
                    >
                      <TableCell className="font-medium text-sm whitespace-nowrap">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {row.employeeFirstName} {row.employeeLastName}
                          {row.employeeStatus !== "active" && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/40 leading-none">
                              Former
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {row.employeeDepartmentName ?? <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(row.shiftDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${shiftTypeColor[row.shiftType] ?? shiftTypeColor.other}`}
                        >
                          {shiftTypes?.find((t) => t.value === row.shiftType)?.label ?? row.shiftType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.startTime ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.endTime ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-right">
                        {row.hoursWorked != null ? row.hoursWorked : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[180px] truncate">
                        {row.notes ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/employees/${row.employeeId}?tab=work-record`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Open employee profile">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-4 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {data && data.totalPages > 1 ? (
                    <>
                      Page{" "}
                      <span className="font-semibold text-foreground">{page}</span>
                      {" "}of{" "}
                      <span className="font-semibold text-foreground">{data.totalPages}</span>
                      {" "}·{" "}
                      <span className="font-semibold text-foreground">{data.total}</span> total entries
                    </>
                  ) : (
                    <>
                      Showing <span className="font-semibold text-foreground">{sortedRows.length}</span> entries ·
                      Total <span className="font-semibold text-foreground">{totalHours.toFixed(1)}</span> h
                    </>
                  )}
                </span>
                {data && data.totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => setPage((p) => p - 1)}
                      disabled={page <= 1 || isLoading}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= data.totalPages || isLoading}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
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
                {hoursByEmployee.slice(0, 10).map(({ employeeId, name, hours, isFormer }) => (
                  <div key={employeeId} className="flex items-center justify-between gap-2">
                    <Link href={`/employees/${employeeId}?tab=work-record`}>
                      <span className={`text-xs hover:underline cursor-pointer truncate max-w-[120px] ${isFormer ? "text-muted-foreground" : "text-foreground"}`}>
                        {name}
                        {isFormer && (
                          <span className="ml-1 text-[10px] text-muted-foreground/70">(Former)</span>
                        )}
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
