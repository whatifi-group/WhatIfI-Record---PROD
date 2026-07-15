/**
 * Employee Self-Service Portal.
 *
 * Visible to authenticated users who have the `view_own_profile` permission
 * but NOT `hr:access` or `sysadmin`.  Provides:
 *
 * - Read-only view of the employee's own profile (via /api/directory/:id — safe fields only)
 * - Employee directory (colleagues' safe fields only — no salary/payroll)
 * - Own qualifications list (read-only; HR manages them)
 *
 * All data is fetched from the permission-gated /api/directory endpoints.
 * Salary, pay rate, and payroll-adjacent fields are excluded at the server level.
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Users, Search, Building2, Phone, Mail, GraduationCap } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhoneEntry { number: string; label: string; }

interface DirectoryEmployee {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  phones: PhoneEntry[];
}

interface DirectoryEmployeeDetail extends DirectoryEmployee {
  nextOfKin: Array<{
    id: number;
    name: string;
    relationship: string | null;
    phones: PhoneEntry[];
    email: string | null;
  }>;
  qualifications: Array<{
    id: number;
    qualificationTypeName: string | null;
    dateAchieved: string;
    expiryDate: string | null;
    notes: string | null;
  }>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelfServicePortal() {
  const { user } = useAuth();
  const employeeId = (user as any)?.employeeId as number | null | undefined;

  // Own profile — fetched from /api/directory/:id (safe fields, no payroll)
  const [profile, setProfile] = useState<DirectoryEmployeeDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) {
      setProfileLoading(false);
      return;
    }
    fetch(`/api/directory/${employeeId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProfile(data ?? null))
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [employeeId]);

  // Directory
  const [directory, setDirectory] = useState<DirectoryEmployee[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directorySearch, setDirectorySearch] = useState("");

  useEffect(() => {
    fetch("/api/directory", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setDirectory(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setDirectoryLoading(false));
  }, []);

  const filteredDirectory = directory.filter((emp) => {
    if (!directorySearch.trim()) return true;
    const q = directorySearch.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q) ||
      emp.jobTitle.toLowerCase().includes(q) ||
      (emp.email?.toLowerCase().includes(q) ?? false)
    );
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">My Workspace</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back{profile ? `, ${profile.firstName}` : ""}. Manage your profile and connect with colleagues.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Own profile ─────────────────────────────────────────────────── */}
        <div className="xl:col-span-1">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                My Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profileLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : !profile ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Profile not linked. Contact your HR Manager.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Avatar */}
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-bold text-xl uppercase shrink-0">
                      {profile.firstName?.[0] ?? ""}{profile.lastName?.[0] ?? ""}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {profile.firstName} {profile.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">{profile.jobTitle}</p>
                    </div>
                  </div>

                  {/* Safe fields only */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="break-all">{profile.email}</span>
                    </div>
                    {profile.phones?.[0] && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{profile.phones[0].number}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground/60 pt-1 border-t border-border/50">
                    Profile is read-only. Contact HR to update your details.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Qualifications card */}
          {profile && employeeId && (
            <QualificationsCard qualifications={profile.qualifications} />
          )}
        </div>

        {/* ── Employee directory ───────────────────────────────────────── */}
        <div className="xl:col-span-2">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Employee Directory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input

                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {directoryLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : filteredDirectory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {directorySearch ? "No colleagues match your search." : "No colleagues found."}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
                  {filteredDirectory.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase shrink-0">
                        {emp.firstName?.[0] ?? ""}{emp.lastName?.[0] ?? ""}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-foreground truncate">
                          {emp.firstName} {emp.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{emp.jobTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                        {emp.phones?.[0] && (
                          <p className="text-xs text-muted-foreground">{emp.phones[0].number}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Qualifications sub-card ───────────────────────────────────────────────────

interface QualEntry {
  id: number;
  qualificationTypeName: string | null;
  dateAchieved: string;
  expiryDate: string | null;
  notes: string | null;
}

function QualificationsCard({ qualifications }: { qualifications: QualEntry[] }) {
  return (
    <Card className="border-border/50 mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          My Qualifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {qualifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No qualifications on record.
          </p>
        ) : (
          <div className="space-y-2">
            {qualifications.map((q) => (
              <div key={q.id} className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium text-foreground">
                  {q.qualificationTypeName ?? "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Achieved: {q.dateAchieved}
                  {q.expiryDate && ` · Expires: ${q.expiryDate}`}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground/60 pt-3 border-t border-border/50 mt-3">
          To add or update qualifications, contact your HR Manager.
        </p>
      </CardContent>
    </Card>
  );
}
