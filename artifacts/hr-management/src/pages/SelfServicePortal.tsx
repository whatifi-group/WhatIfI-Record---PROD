/**
 * Employee Self-Service Portal.
 *
 * Visible to authenticated users who have the `view_own_profile` permission
 * but NOT `hr:access` or `sysadmin`.  Provides:
 *
 * - Read-only view of the employee's own profile (via /api/directory/:id — safe fields only)
 * - Employee directory (colleagues' safe fields only — no salary/payroll)
 * - Own qualifications list (read-only; HR manages them)
 * - My Record section: read-only view of address, next of kin, medical/dietary,
 *   disclosure, and Update Service consent PDF download.
 *
 * All data is fetched from the permission-gated /api endpoints.
 * Salary, pay rate, and payroll-adjacent fields are excluded at the server level.
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  User,
  Users,
  Search,
  Building2,
  Phone,
  Mail,
  GraduationCap,
  ClipboardList,
  MapPin,
  Heart,
  Apple,
  Shield,
  FileDown,
} from "lucide-react";

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

interface MyAddress {
  id: number;
  addressType: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  isPrimary: boolean;
}

interface MyKin {
  id: number;
  name: string;
  relationship: string | null;
  email: string | null;
  address: string | null;
  phones: PhoneEntry[];
}

interface MyDisclosure {
  id: number;
  checkType: string;
  checkLevel: string;
  certificateNumber: string | null;
  issueDate: string | null;
  onUpdateService: boolean;
}

interface MyConsent {
  id: number;
  disclosureId: number | null;
  consentGranted: boolean;
  signatoryName: string | null;
  consentedAt: string | null;
  pdfSignedUrl: string | null;
  pdfFileName: string | null;
}

interface MyRecord {
  employeeId: number;
  addresses: MyAddress[];
  nextOfKin: MyKin[];
  medical: { selections: string[]; notes: string | null };
  dietary: { selections: string[]; notes: string | null };
  disclosures: MyDisclosure[];
  consents: MyConsent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHECK_TYPE_LABELS: Record<string, string> = {
  dbs: "DBS",
  pvg: "PVG",
  access_ni: "AccessNI",
};

const CHECK_LEVEL_LABELS: Record<string, string> = {
  basic: "Basic",
  standard: "Standard",
  enhanced: "Enhanced",
  enhanced_barred: "Enhanced with Barred Lists",
};

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

  // My Record
  const [myRecord, setMyRecord] = useState<MyRecord | null>(null);
  const [myRecordLoading, setMyRecordLoading] = useState(true);

  useEffect(() => {
    fetch("/api/self-service/my-record", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setMyRecord(data ?? null))
      .catch(() => {})
      .finally(() => setMyRecordLoading(false));
  }, []);

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

      {/* ── My Record ─────────────────────────────────────────────────────── */}
      <MyRecordSection loading={myRecordLoading} record={myRecord} />
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

// ── My Record section ─────────────────────────────────────────────────────────

function MyRecordSection({
  loading,
  record,
}: {
  loading: boolean;
  record: MyRecord | null;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-display font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          My Record
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Read-only summary of the data you submitted during onboarding.
          Contact HR if anything needs to be updated.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : !record ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No record data available yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Address */}
          <AddressCard addresses={record.addresses} />
          {/* Next of Kin */}
          <NextOfKinCard nextOfKin={record.nextOfKin} />
          {/* Medical & Dietary */}
          <MedicalDietaryCard medical={record.medical} dietary={record.dietary} />
          {/* Disclosure & Consent */}
          <DisclosureCard disclosures={record.disclosures} consents={record.consents} />
        </div>
      )}
    </div>
  );
}

function AddressCard({ addresses }: { addresses: MyAddress[] }) {
  const primary = addresses.find((a) => a.isPrimary) ?? addresses[0] ?? null;
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          Home Address
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!primary ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <address className="not-italic text-sm text-foreground leading-relaxed space-y-0.5">
            {primary.line1 && <div>{primary.line1}</div>}
            {primary.line2 && <div>{primary.line2}</div>}
            {primary.city && <div>{primary.city}</div>}
            {primary.county && <div>{primary.county}</div>}
            {primary.postcode && <div>{primary.postcode}</div>}
            {primary.country && <div>{primary.country}</div>}
          </address>
        )}
      </CardContent>
    </Card>
  );
}

function NextOfKinCard({ nextOfKin }: { nextOfKin: MyKin[] }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Heart className="w-3.5 h-3.5 text-primary" />
          Next of Kin
        </CardTitle>
      </CardHeader>
      <CardContent>
        {nextOfKin.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <div className="space-y-3">
            {nextOfKin.map((kin) => (
              <div key={kin.id} className="text-sm space-y-0.5">
                <p className="font-medium text-foreground">{kin.name}</p>
                {kin.relationship && (
                  <p className="text-xs text-muted-foreground capitalize">{kin.relationship}</p>
                )}
                {kin.phones.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span>{p.number}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{p.label}</Badge>
                  </div>
                ))}
                {kin.email && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="break-all">{kin.email}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MedicalDietaryCard({
  medical,
  dietary,
}: {
  medical: { selections: string[]; notes: string | null };
  dietary: { selections: string[]; notes: string | null };
}) {
  const hasData =
    medical.selections.length > 0 ||
    medical.notes ||
    dietary.selections.length > 0 ||
    dietary.notes;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Apple className="w-3.5 h-3.5 text-primary" />
          Medical &amp; Dietary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {medical.selections.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Medical
                </p>
                <div className="flex flex-wrap gap-1">
                  {medical.selections.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {medical.notes && (
              <p className="text-xs text-muted-foreground leading-relaxed">{medical.notes}</p>
            )}
            {dietary.selections.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Dietary
                </p>
                <div className="flex flex-wrap gap-1">
                  {dietary.selections.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {dietary.notes && (
              <p className="text-xs text-muted-foreground leading-relaxed">{dietary.notes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DisclosureCard({
  disclosures,
  consents,
}: {
  disclosures: MyDisclosure[];
  consents: MyConsent[];
}) {
  const disclosure = disclosures[0] ?? null;
  const grantedConsent = consents.find((c) => c.consentGranted && c.pdfSignedUrl) ?? null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-primary" />
          Disclosure
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!disclosure ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs">
                {CHECK_TYPE_LABELS[disclosure.checkType] ?? disclosure.checkType}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {CHECK_LEVEL_LABELS[disclosure.checkLevel] ?? disclosure.checkLevel}
              </Badge>
            </div>
            {disclosure.certificateNumber && (
              <p className="text-xs text-muted-foreground">
                Cert no.: {disclosure.certificateNumber}
              </p>
            )}
            {disclosure.issueDate && (
              <p className="text-xs text-muted-foreground">Issued: {disclosure.issueDate}</p>
            )}
            <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
              <span className="text-xs text-muted-foreground">Update Service:</span>
              <Badge
                variant={disclosure.onUpdateService ? "default" : "secondary"}
                className="text-xs"
              >
                {disclosure.onUpdateService ? "Enrolled" : "Not enrolled"}
              </Badge>
            </div>
            {grantedConsent && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 mt-1 w-full"
                onClick={() => window.open(grantedConsent.pdfSignedUrl!, "_blank")}
              >
                <FileDown className="w-3 h-3" />
                Download Consent Certificate
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
