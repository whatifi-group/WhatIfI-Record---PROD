import { Permission } from "@workspace/api-client-react";

/**
 * Human-readable labels for every Permission value.
 *
 * The `satisfies` assertion below ensures this map stays in sync with the
 * OpenAPI-generated `Permission` enum — a missing or extra key is a compile
 * error, so adding a new permission to the spec forces an update here.
 */
export const PERMISSION_LABELS = {
  sysadmin: "System Administrator (Full Access)",
  "hr:access": "HR Access",
  "hr:past_employees": "View Past Employees",
  hr_admin: "HR Administrator (Department/Employee Settings)",
  view_employees: "View Employee Directory",
  edit_employees: "Edit Employee Records",
  delete_employees: "Delete Employee Records",
  view_departments: "View Departments",
  edit_departments: "Manage Departments",
  view_leave: "View Leave Requests",
  manage_leave: "Approve/Reject Leave",
  view_reports: "View HR Reports",
  view_payroll: "View Payroll & Pay Rates",
} satisfies Record<Permission, string>;
