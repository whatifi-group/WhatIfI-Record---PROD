/**
 * Public onboarding portal for new hires.
 * No authentication required — the route is listed as public in App.tsx.
 *
 * Step 0: Password gate         → POST /api/onboarding/verify
 * Step 1: Personal details      (name, email, phone)
 * Step 2: Address               (optional)
 * Step 3: Payroll & Bank Details (optional — NI number, bank details)
 * Step 4: Next of Kin           (optional — with inline phone list)
 * Step 5: Medical & Dietary     (optional)
 * Step 6: Disclosure            (optional — with Update Service consent panel)
 * Step 7: Qualifications        (optional)
 * Step 8: Review & Submit       → POST /api/onboarding/submit
 * Step 9: Confirmation
 *
 * Pay rate / salary fields never appear here.
 * Employment Type, Department, and Job Title are set by HR at approval time.
 */
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Paperclip,
  X,
  SkipForward,
  AlertCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QualType {
  id: number;
  name: string;
  requiresExpiry: boolean | null;
}

interface QualEntry {
  qualificationTypeId: number;
  dateAchieved: string;
  expiryDate: string;
  notes: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  uploading: boolean;
  uploadError: string | null;
  skipped: boolean; // true after user clicks "Skip this file"
}

interface PersonalForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface AddressForm {
  line1: string;
  line2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
}

interface PayrollForm {
  niNumber: string;
  bankName: string;
  accountHolder: string;
  sortCode: string;
  accountNumber: string;
}

interface PhoneEntry {
  number: string;
  label: string;
  isPrimary: boolean;
}

interface NextOfKinForm {
  name: string;
  relationship: string;
  email: string;
  address: string;
  phones: PhoneEntry[];
}

interface MedicalForm {
  medicalSelections: string[];
  medicalNotes: string;
  dietarySelections: string[];
  dietaryNotes: string;
}

interface DisclosureForm {
  checkType: string;
  checkLevel: string;
  certificateNumber: string;
  issueDate: string;
  onUpdateService: boolean;
  updateServiceConsentName: string;
  convictionDetails: string;
  notes: string;
}

interface LovItem {
  value: string;
  label: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PHONE_LABELS = ["Mobile", "Home", "Work", "Other"];

const CHECK_TYPES = [
  { value: "dbs", label: "DBS" },
  { value: "pvg", label: "PVG" },
  { value: "access_ni", label: "AccessNI" },
];

const CHECK_LEVELS = [
  { value: "basic", label: "Basic" },
  { value: "standard", label: "Standard" },
  { value: "enhanced", label: "Enhanced" },
  { value: "enhanced_barred", label: "Enhanced with Barred Lists" },
];

const UPDATE_SERVICE_DISCLAIMER =
  "We may conduct a check of the Update Service at intervals of not more than 28 days. " +
  "By typing your full name below you confirm that you consent to the employer conducting " +
  "these periodic checks for the duration of your employment, or until you withdraw " +
  "consent in writing to the HR department.";

const STEPS = [
  "Verify",
  "Your Details",
  "Address",
  "Payroll",
  "Next of Kin",
  "Medical & Dietary",
  "Disclosure",
  "Qualifications",
  "Review",
];

const emptyPersonal: PersonalForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

const emptyAddress: AddressForm = {
  line1: "",
  line2: "",
  city: "",
  county: "",
  postcode: "",
  country: "",
};

const emptyPayroll: PayrollForm = {
  niNumber: "",
  bankName: "",
  accountHolder: "",
  sortCode: "",
  accountNumber: "",
};

const emptyKin: NextOfKinForm = {
  name: "",
  relationship: "",
  email: "",
  address: "",
  phones: [],
};

const emptyMedical: MedicalForm = {
  medicalSelections: [],
  medicalNotes: "",
  dietarySelections: [],
  dietaryNotes: "",
};

const emptyDisclosure: DisclosureForm = {
  checkType: "",
  checkLevel: "",
  certificateNumber: "",
  issueDate: "",
  onUpdateService: false,
  updateServiceConsentName: "",
  convictionDetails: "",
  notes: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingPortal() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Step 1
  const [personal, setPersonal] = useState<PersonalForm>(emptyPersonal);
  const [personalErrors, setPersonalErrors] = useState<Partial<PersonalForm>>({});

  // Step 2
  const [quals, setQuals] = useState<QualEntry[]>([]);
  const [qualTypes, setQualTypes] = useState<QualType[]>([]);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 3
  const [address, setAddress] = useState<AddressForm>(emptyAddress);

  // Step 4
  const [payroll, setPayroll] = useState<PayrollForm>(emptyPayroll);

  // Step 5
  const [kin, setKin] = useState<NextOfKinForm>(emptyKin);

  // Step 6
  const [medical, setMedical] = useState<MedicalForm>(emptyMedical);
  const [medicalLov, setMedicalLov] = useState<LovItem[]>([]);
  const [dietaryLov, setDietaryLov] = useState<LovItem[]>([]);

  // Step 7
  const [disclosure, setDisclosure] = useState<DisclosureForm>(emptyDisclosure);

  // Submit
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── Data fetching ──────────────────────────────────────────────────────────

  // Fetch qualification types when entering step 8
  useEffect(() => {
    if (step !== 8 || !token) return;
    fetch("/api/onboarding/qualification-types", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setQualTypes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [step, token]);

  // Fetch medical/dietary LOV when entering step 6
  useEffect(() => {
    if (step !== 6 || !token) return;
    Promise.all([
      fetch("/api/onboarding/lov/medical-conditions", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch("/api/onboarding/lov/dietary-requirements", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ])
      .then(([med, diet]) => {
        setMedicalLov(Array.isArray(med) ? med : []);
        setDietaryLov(Array.isArray(diet) ? diet : []);
      })
      .catch(() => {});
  }, [step, token]);

  // ── Step 0: Password gate ──────────────────────────────────────────────────

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError("");
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/onboarding/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setVerifyError(body.error ?? "Incorrect password. Please try again.");
        return;
      }
      const data = await res.json();
      setToken(data.token);
      setStep(1);
    } catch {
      setVerifyError("Could not reach the server. Please try again.");
    } finally {
      setVerifyLoading(false);
    }
  }

  // ── Step 1: Validate personal details ─────────────────────────────────────

  function validatePersonal(): boolean {
    const errors: Partial<PersonalForm> = {};
    if (!personal.firstName.trim()) errors.firstName = "Required";
    if (!personal.lastName.trim()) errors.lastName = "Required";
    if (
      !personal.email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email)
    )
      errors.email = "Valid email required";
    setPersonalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Step 2: Qualifications ────────────────────────────────────────────────

  function addQual() {
    setQuals((prev) => [
      ...prev,
      {
        qualificationTypeId: 0,
        dateAchieved: "",
        expiryDate: "",
        notes: "",
        fileName: null,
        fileUrl: null,
        mimeType: null,
        uploading: false,
        uploadError: null,
        skipped: false,
      },
    ]);
  }

  function removeQual(idx: number) {
    setQuals((prev) => prev.filter((_, i) => i !== idx));
    fileInputRefs.current = fileInputRefs.current.filter((_, i) => i !== idx);
  }

  function updateQual(
    idx: number,
    field: keyof QualEntry,
    value: string | number | boolean | null,
  ) {
    setQuals((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)),
    );
  }

  async function handleFileSelect(idx: number, file: File) {
    updateQual(idx, "uploading", true);
    updateQual(idx, "uploadError", null);
    updateQual(idx, "skipped", false);
    try {
      const urlRes = await fetch("/api/onboarding/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        updateQual(idx, "uploadError", body.error ?? "Could not get upload URL");
        return;
      }
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        updateQual(idx, "uploadError", "Upload failed. Please try again.");
        return;
      }

      setQuals((prev) =>
        prev.map((q, i) =>
          i === idx
            ? {
                ...q,
                fileName: file.name,
                fileUrl: objectPath,
                mimeType: file.type,
                uploading: false,
                uploadError: null,
                skipped: false,
              }
            : q,
        ),
      );
    } catch {
      updateQual(idx, "uploadError", "Could not reach the server. Please try again.");
    } finally {
      setQuals((prev) =>
        prev.map((q, i) => (i === idx ? { ...q, uploading: false } : q)),
      );
    }
  }

  function skipFile(idx: number) {
    setQuals((prev) =>
      prev.map((q, i) =>
        i === idx
          ? {
              ...q,
              fileName: null,
              fileUrl: null,
              mimeType: null,
              uploadError: null,
              skipped: true,
            }
          : q,
      ),
    );
    const input = fileInputRefs.current[idx];
    if (input) input.value = "";
  }

  function clearFile(idx: number) {
    setQuals((prev) =>
      prev.map((q, i) =>
        i === idx
          ? {
              ...q,
              fileName: null,
              fileUrl: null,
              mimeType: null,
              uploadError: null,
              skipped: false,
            }
          : q,
      ),
    );
    const input = fileInputRefs.current[idx];
    if (input) input.value = "";
  }

  // ── Step 4: Next of Kin phones ─────────────────────────────────────────────

  function addPhone() {
    setKin((k) => ({
      ...k,
      phones: [
        ...k.phones,
        { number: "", label: "Mobile", isPrimary: k.phones.length === 0 },
      ],
    }));
  }

  function removePhone(idx: number) {
    setKin((k) => {
      const phones = k.phones.filter((_, i) => i !== idx);
      // If we removed the primary, make the first one primary
      if (k.phones[idx]?.isPrimary && phones.length > 0) {
        phones[0] = { ...phones[0], isPrimary: true };
      }
      return { ...k, phones };
    });
  }

  function updatePhone(idx: number, field: keyof PhoneEntry, value: string | boolean) {
    setKin((k) => ({
      ...k,
      phones: k.phones.map((p, i) => {
        if (i !== idx) {
          // If setting isPrimary on another, clear all others
          if (field === "isPrimary" && value === true) {
            return { ...p, isPrimary: false };
          }
          return p;
        }
        return { ...p, [field]: value };
      }),
    }));
  }

  // ── Step 6: Disclosure validation ─────────────────────────────────────────

  /** Full name the applicant submitted in step 1 (used for consent name matching). */
  const expectedConsentName = `${personal.firstName.trim()} ${personal.lastName.trim()}`.trim();

  function disclosureNextDisabled(): boolean {
    if (!disclosure.checkType || !disclosure.checkLevel) return false; // allow proceeding with empty
    if (disclosure.onUpdateService) {
      const typed = disclosure.updateServiceConsentName.trim();
      if (!typed) return true;
      if (typed.toLowerCase() !== expectedConsentName.toLowerCase()) return true;
    }
    return false;
  }

  // ── Step 7: Submit ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitError("");
    setSubmitLoading(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: personal.firstName.trim(),
        lastName: personal.lastName.trim(),
        email: personal.email.trim().toLowerCase(),
        phone: personal.phone.trim() || null,
        qualifications: quals
          .filter((q) => q.qualificationTypeId > 0 && q.dateAchieved)
          .map((q) => ({
            qualificationTypeId: q.qualificationTypeId,
            dateAchieved: q.dateAchieved,
            expiryDate: q.expiryDate || null,
            notes: q.notes || null,
            fileName: q.skipped ? null : (q.fileName ?? null),
            fileUrl: q.skipped ? null : (q.fileUrl ?? null),
            mimeType: q.skipped ? null : (q.mimeType ?? null),
          })),
      };

      const hasAddress = Object.values(address).some((v) => v.trim());
      if (hasAddress) payload.address = address;

      if (kin.name.trim()) {
        payload.nextOfKin = {
          name: kin.name.trim(),
          relationship: kin.relationship.trim() || null,
          email: kin.email.trim() || null,
          address: kin.address.trim() || null,
          phones: kin.phones.filter((p) => p.number.trim()),
        };
      }

      const hasMedicalData =
        medical.medicalSelections.length > 0 ||
        medical.dietarySelections.length > 0 ||
        medical.medicalNotes.trim() ||
        medical.dietaryNotes.trim();
      if (hasMedicalData) {
        payload.medical = {
          medicalSelections: medical.medicalSelections,
          medicalNotes: medical.medicalNotes.trim() || null,
          dietarySelections: medical.dietarySelections,
          dietaryNotes: medical.dietaryNotes.trim() || null,
        };
      }

      const hasPayrollData = Object.values(payroll).some((v) => v.trim());
      if (hasPayrollData) {
        payload.payroll = {
          niNumber: payroll.niNumber.trim() || null,
          bankName: payroll.bankName.trim() || null,
          accountHolder: payroll.accountHolder.trim() || null,
          sortCode: payroll.sortCode.trim() || null,
          accountNumber: payroll.accountNumber.trim() || null,
        };
      }

      if (disclosure.checkType && disclosure.checkLevel) {
        payload.disclosure = {
          checkType: disclosure.checkType,
          checkLevel: disclosure.checkLevel,
          certificateNumber: disclosure.certificateNumber.trim() || null,
          issueDate: disclosure.issueDate || null,
          onUpdateService: disclosure.onUpdateService,
          updateServiceConsentName:
            disclosure.onUpdateService
              ? disclosure.updateServiceConsentName.trim() || null
              : null,
          convictionDetails: disclosure.convictionDetails.trim() || null,
          notes: disclosure.notes.trim() || null,
        };
      }

      const res = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.error ?? "Submission failed. Please try again.");
        return;
      }

      setStep(9);
    } catch {
      setSubmitError("Could not reach the server. Please try again.");
    } finally {
      setSubmitLoading(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleMedicalSelection(value: string) {
    setMedical((m) => ({
      ...m,
      medicalSelections: m.medicalSelections.includes(value)
        ? m.medicalSelections.filter((v) => v !== value)
        : [...m.medicalSelections, value],
    }));
  }

  function toggleDietarySelection(value: string) {
    setMedical((m) => ({
      ...m,
      dietarySelections: m.dietarySelections.includes(value)
        ? m.dietarySelections.filter((v) => v !== value)
        : [...m.dietarySelections, value],
    }));
  }

  const checkTypeName = CHECK_TYPES.find((t) => t.value === disclosure.checkType)?.label;
  const checkLevelName = CHECK_LEVELS.find((l) => l.value === disclosure.checkLevel)?.label;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">New Hire Onboarding</h1>
          <p className="text-slate-500">Complete this form to begin your onboarding process.</p>
        </div>

        {/* Step indicator (steps 1–8) */}
        {step >= 1 && step <= 8 && (
          <div className="flex items-center justify-center gap-1 mb-8 overflow-x-auto pb-1 px-2">
            {STEPS.slice(1).map((label, i) => (
              <div key={label} className="flex items-center shrink-0">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border-2 transition-colors ${
                    step - 1 > i
                      ? "bg-primary border-primary text-primary-foreground"
                      : step - 1 === i
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30 text-muted-foreground/50"
                  }`}
                >
                  {step - 1 > i ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span
                  className={`ml-1 text-xs font-medium hidden md:inline ${
                    step - 1 === i ? "text-primary" : "text-muted-foreground/50"
                  }`}
                >
                  {label}
                </span>
                {i < STEPS.length - 2 && (
                  <div
                    className={`mx-1.5 h-0.5 w-4 sm:w-8 rounded ${
                      step - 1 > i ? "bg-primary" : "bg-muted-foreground/20"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Step 0: Password gate ──────────────────────────────────────── */}
        {step === 0 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Enter Onboarding Password</CardTitle>
              <CardDescription>
                Your HR team will have provided this password with your invitation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="ob-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {verifyError && <p className="text-sm text-destructive">{verifyError}</p>}
                </div>
                <Button type="submit" disabled={verifyLoading || !password} className="w-full">
                  {verifyLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Step 1: Personal details ───────────────────────────────────── */}
        {step === 1 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Your Details</CardTitle>
              <CardDescription>Tell us a bit about yourself.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-firstName">
                    First name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ob-firstName"
                    value={personal.firstName}
                    onChange={(e) => setPersonal((p) => ({ ...p, firstName: e.target.value }))}
                  />
                  {personalErrors.firstName && (
                    <p className="text-xs text-destructive">{personalErrors.firstName}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-lastName">
                    Last name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ob-lastName"
                    value={personal.lastName}
                    onChange={(e) => setPersonal((p) => ({ ...p, lastName: e.target.value }))}
                  />
                  {personalErrors.lastName && (
                    <p className="text-xs text-destructive">{personalErrors.lastName}</p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-email">
                    Email address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ob-email"
                    type="email"
                    value={personal.email}
                    onChange={(e) => setPersonal((p) => ({ ...p, email: e.target.value }))}
                  />
                  {personalErrors.email && (
                    <p className="text-xs text-destructive">{personalErrors.email}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-phone">Phone (optional)</Label>
                  <Input
                    id="ob-phone"
                    type="tel"
                    value={personal.phone}
                    onChange={(e) => setPersonal((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => {
                    if (validatePersonal()) setStep(2);
                  }}
                >
                  Next: Address <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Address ────────────────────────────────────────────── */}
        {step === 2 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Your Address</CardTitle>
              <CardDescription>
                Your home address. This step is optional — you can add or update it later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-line1">Address line 1</Label>
                  <Input
                    id="ob-line1"
                    value={address.line1}
                    onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-line2">Address line 2 (optional)</Label>
                  <Input
                    id="ob-line2"
                    value={address.line2}
                    onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-city">City</Label>
                  <Input
                    id="ob-city"
                    value={address.city}
                    onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-county">County / Region</Label>
                  <Input
                    id="ob-county"
                    value={address.county}
                    onChange={(e) => setAddress((a) => ({ ...a, county: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-postcode">Postcode</Label>
                  <Input
                    id="ob-postcode"
                    value={address.postcode}
                    onChange={(e) => setAddress((a) => ({ ...a, postcode: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-country">Country</Label>
                  <Input
                    id="ob-country"
                    value={address.country}
                    onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Next: Payroll & Bank Details <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Payroll & Bank Details ─────────────────────────────── */}
        {step === 3 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Payroll & Bank Details</CardTitle>
              <CardDescription>
                Details needed to set you up for payroll. This step is optional — you can add
                or update it later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-ni-number">National Insurance number (optional)</Label>
                  <Input
                    id="ob-ni-number"
                    placeholder="e.g. QQ123456C"
                    value={payroll.niNumber}
                    onChange={(e) => setPayroll((p) => ({ ...p, niNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-bank-name">Bank name (optional)</Label>
                  <Input
                    id="ob-bank-name"
                    value={payroll.bankName}
                    onChange={(e) => setPayroll((p) => ({ ...p, bankName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-account-holder">Account holder name (optional)</Label>
                  <Input
                    id="ob-account-holder"
                    value={payroll.accountHolder}
                    onChange={(e) =>
                      setPayroll((p) => ({ ...p, accountHolder: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-sort-code">Sort code (optional)</Label>
                  <Input
                    id="ob-sort-code"
                    inputMode="numeric"
                    placeholder="00-00-00"
                    value={payroll.sortCode}
                    onChange={(e) => setPayroll((p) => ({ ...p, sortCode: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-account-number">Account number (optional)</Label>
                  <Input
                    id="ob-account-number"
                    inputMode="numeric"
                    value={payroll.accountNumber}
                    onChange={(e) =>
                      setPayroll((p) => ({ ...p, accountNumber: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(4)}>
                  Next: Next of Kin <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Next of Kin ────────────────────────────────────────── */}
        {step === 4 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Next of Kin</CardTitle>
              <CardDescription>
                Who should we contact in an emergency? This step is optional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-kin-name">Full name</Label>
                    <Input
                      id="ob-kin-name"
                      value={kin.name}
                      onChange={(e) => setKin((k) => ({ ...k, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-kin-rel">Relationship</Label>
                    <Input
                      id="ob-kin-rel"
                      placeholder="e.g. Spouse, Parent"
                      value={kin.relationship}
                      onChange={(e) => setKin((k) => ({ ...k, relationship: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-kin-email">Email (optional)</Label>
                    <Input
                      id="ob-kin-email"
                      type="email"
                      value={kin.email}
                      onChange={(e) => setKin((k) => ({ ...k, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-kin-addr">Address (optional)</Label>
                    <Input
                      id="ob-kin-addr"
                      value={kin.address}
                      onChange={(e) => setKin((k) => ({ ...k, address: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Inline phone list */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Phone numbers</Label>
                  {kin.phones.length === 0 && (
                    <p className="text-xs text-muted-foreground">No phone numbers added.</p>
                  )}
                  {kin.phones.map((phone, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 border border-border/40 rounded-md p-2.5 bg-muted/10"
                    >
                      <Input
                        type="tel"
                        placeholder="Phone number"
                        className="flex-1 h-8 text-sm"
                        value={phone.number}
                        onChange={(e) => updatePhone(idx, "number", e.target.value)}
                      />
                      <select
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm h-8"
                        value={phone.label}
                        onChange={(e) => updatePhone(idx, "label", e.target.value)}
                      >
                        {PHONE_LABELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={phone.isPrimary}
                          onChange={(e) => {
                            if (e.target.checked) {
                              // Unset others first
                              setKin((k) => ({
                                ...k,
                                phones: k.phones.map((p, i) => ({
                                  ...p,
                                  isPrimary: i === idx,
                                })),
                              }));
                            }
                          }}
                        />
                        Primary
                      </label>
                      <button
                        type="button"
                        onClick={() => removePhone(idx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={addPhone}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add phone number
                  </Button>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(3)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(5)}>
                  Next: Medical & Dietary <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: Medical & Dietary ──────────────────────────────────── */}
        {step === 5 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Medical & Dietary</CardTitle>
              <CardDescription>
                Select any conditions or requirements that apply to you. Both sections are
                optional — you can update these at any time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Medical */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Medical Conditions</h3>
                {medicalLov.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Loading…
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {medicalLov.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => toggleMedicalSelection(item.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          medical.medicalSelections.includes(item.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:border-primary/50"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Additional notes (optional)</Label>
                  <textarea
                    className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    value={medical.medicalNotes}
                    onChange={(e) =>
                      setMedical((m) => ({ ...m, medicalNotes: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Dietary */}
              <div className="space-y-3 border-t border-border/40 pt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Dietary Requirements
                </h3>
                {dietaryLov.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {dietaryLov.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => toggleDietarySelection(item.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          medical.dietarySelections.includes(item.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:border-primary/50"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Additional notes (optional)</Label>
                  <textarea
                    className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    value={medical.dietaryNotes}
                    onChange={(e) =>
                      setMedical((m) => ({ ...m, dietaryNotes: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(4)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(6)}>
                  Next: Disclosure <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 6: Disclosure ─────────────────────────────────────────── */}
        {step === 6 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Disclosure</CardTitle>
              <CardDescription>
                If you have a DBS, PVG, or AccessNI check, enter the details here. This step is
                optional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Check type</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={disclosure.checkType}
                        onChange={(e) =>
                          setDisclosure((d) => ({ ...d, checkType: e.target.value }))
                        }
                      >
                        <option value="">Select…</option>
                        {CHECK_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Check level</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={disclosure.checkLevel}
                        onChange={(e) =>
                          setDisclosure((d) => ({ ...d, checkLevel: e.target.value }))
                        }
                      >
                        <option value="">Select…</option>
                        {CHECK_LEVELS.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Certificate number (optional)</Label>
                      <Input
                        value={disclosure.certificateNumber}
                        onChange={(e) =>
                          setDisclosure((d) => ({ ...d, certificateNumber: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Issue date (optional)</Label>
                      <DatePicker
                        value={disclosure.issueDate}
                        onChange={(value) =>
                          setDisclosure((d) => ({ ...d, issueDate: value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Conviction details (optional)</Label>
                      <textarea
                        className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        placeholder="If your certificate shows any convictions, describe them here…"
                        value={disclosure.convictionDetails}
                        onChange={(e) =>
                          setDisclosure((d) => ({ ...d, convictionDetails: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Notes (optional)</Label>
                      <textarea
                        className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        value={disclosure.notes}
                        onChange={(e) =>
                          setDisclosure((d) => ({ ...d, notes: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  {/* Update Service toggle */}
                  <div className="border border-border/50 rounded-lg p-4 space-y-4 bg-muted/10">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded"
                        checked={disclosure.onUpdateService}
                        onChange={(e) =>
                          setDisclosure((d) => ({
                            ...d,
                            onUpdateService: e.target.checked,
                            updateServiceConsentName: e.target.checked
                              ? d.updateServiceConsentName
                              : "",
                          }))
                        }
                      />
                      <span className="text-sm font-medium">I am on the Update Service</span>
                    </label>

                    {disclosure.onUpdateService && (
                      <div className="border-t border-border/40 pt-4 space-y-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
                          <p className="font-medium mb-1">Update Service Consent Notice</p>
                          <p className="text-xs leading-relaxed">{UPDATE_SERVICE_DISCLAIMER}</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ob-consent-name">
                            Type your full name to confirm consent{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="ob-consent-name"
                            placeholder="Your full name"
                            value={disclosure.updateServiceConsentName}
                            onChange={(e) =>
                              setDisclosure((d) => ({
                                ...d,
                                updateServiceConsentName: e.target.value,
                              }))
                            }
                          />
                          {disclosure.onUpdateService && (() => {
                            const typed = disclosure.updateServiceConsentName.trim();
                            if (!typed) {
                              return (
                                <p className="text-xs text-amber-700">
                                  You must type your full name to confirm consent before
                                  proceeding.
                                </p>
                              );
                            }
                            if (typed.toLowerCase() !== expectedConsentName.toLowerCase()) {
                              return (
                                <p className="text-xs text-destructive">
                                  Name does not match. Please type exactly:{" "}
                                  <strong>{expectedConsentName}</strong>
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(5)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  disabled={disclosureNextDisabled()}
                  onClick={() => setStep(7)}
                >
                  Next: Qualifications <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 7: Qualifications ─────────────────────────────────────── */}
        {step === 7 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Qualifications</CardTitle>
              <CardDescription>
                Add any certificates or qualifications relevant to your role. This step is
                optional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {quals.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No qualifications added yet. Click "Add Qualification" to begin, or continue
                  to review.
                </p>
              )}

              {quals.map((q, idx) => (
                <div
                  key={idx}
                  className="border border-border/50 rounded-lg p-4 space-y-3 bg-muted/20"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Qualification {idx + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQual(idx)}
                      className="h-7 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">
                        Qualification type <span className="text-destructive">*</span>
                      </Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={q.qualificationTypeId || ""}
                        onChange={(e) =>
                          updateQual(idx, "qualificationTypeId", Number(e.target.value))
                        }
                      >
                        <option value="">Select qualification type…</option>
                        {qualTypes.map((qt) => (
                          <option key={qt.id} value={qt.id}>
                            {qt.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Date achieved <span className="text-destructive">*</span>
                      </Label>
                      <DatePicker
                        value={q.dateAchieved}
                        onChange={(value) => updateQual(idx, "dateAchieved", value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Expiry date (optional)</Label>
                      <DatePicker
                        value={q.expiryDate}
                        onChange={(value) => updateQual(idx, "expiryDate", value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Notes (optional)</Label>
                      <Input
                        value={q.notes}
                        onChange={(e) => updateQual(idx, "notes", e.target.value)}
                      />
                    </div>
                    {/* Certificate file upload */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Certificate (optional)</Label>
                      {q.fileUrl ? (
                        <div className="flex items-center gap-2 text-sm bg-muted/40 rounded px-3 py-2 border border-border/50">
                          <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate text-foreground">{q.fileName}</span>
                          <button
                            type="button"
                            onClick={() => clearFile(idx)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : q.skipped ? (
                        <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                          <SkipForward className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="text-amber-700 flex-1">File skipped</span>
                          <button
                            type="button"
                            onClick={() => {
                              updateQual(idx, "skipped", false);
                              fileInputRefs.current[idx]?.click();
                            }}
                            className="text-xs text-amber-700 underline"
                          >
                            Try again
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic"
                            ref={(el) => {
                              fileInputRefs.current[idx] = el;
                            }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileSelect(idx, file);
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={q.uploading}
                            onClick={() => fileInputRefs.current[idx]?.click()}
                          >
                            {q.uploading ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            {q.uploading ? "Uploading…" : "Attach certificate"}
                          </Button>
                          {q.uploadError && (
                            <div className="flex items-start gap-2 rounded bg-destructive/10 border border-destructive/20 p-2.5">
                              <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                              <div className="flex-1 space-y-1">
                                <p className="text-xs text-destructive">{q.uploadError}</p>
                                <button
                                  type="button"
                                  className="text-xs underline text-destructive/80"
                                  onClick={() => skipFile(idx)}
                                >
                                  Skip this file and continue without it
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addQual} className="w-full">
                <Plus className="w-4 h-4 mr-1.5" /> Add Qualification
              </Button>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(6)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(8)}>
                  Review & Submit <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 8: Review ─────────────────────────────────────────────── */}
        {step === 8 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Review Your Information</CardTitle>
              <CardDescription>
                Please check everything looks correct before submitting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Personal details */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Personal Details
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span>
                    {personal.firstName} {personal.lastName}
                  </span>
                  <span className="text-muted-foreground">Email</span>
                  <span className="break-all">{personal.email}</span>
                  {personal.phone && (
                    <>
                      <span className="text-muted-foreground">Phone</span>
                      <span>{personal.phone}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1.5 border-t border-border/30 pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Address
                </h3>
                <p className="text-sm">
                  {[
                    address.line1,
                    address.line2,
                    address.city,
                    address.county,
                    address.postcode,
                    address.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || <span className="text-muted-foreground">Not provided</span>}
                </p>
              </div>

              {/* Payroll & Bank Details */}
              <div className="space-y-1.5 border-t border-border/30 pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Payroll & Bank Details
                </h3>
                {!Object.values(payroll).some((v) => v.trim()) ? (
                  <p className="text-sm text-muted-foreground">Not provided</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {payroll.niNumber && (
                      <>
                        <span className="text-muted-foreground">NI Number</span>
                        <span>{payroll.niNumber}</span>
                      </>
                    )}
                    {payroll.bankName && (
                      <>
                        <span className="text-muted-foreground">Bank Name</span>
                        <span>{payroll.bankName}</span>
                      </>
                    )}
                    {payroll.accountHolder && (
                      <>
                        <span className="text-muted-foreground">Account Holder</span>
                        <span>{payroll.accountHolder}</span>
                      </>
                    )}
                    {payroll.sortCode && (
                      <>
                        <span className="text-muted-foreground">Sort Code</span>
                        <span>{payroll.sortCode}</span>
                      </>
                    )}
                    {payroll.accountNumber && (
                      <>
                        <span className="text-muted-foreground">Account Number</span>
                        <span>{payroll.accountNumber}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Next of Kin */}
              <div className="space-y-1.5 border-t border-border/30 pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Next of Kin
                </h3>
                {!kin.name.trim() ? (
                  <p className="text-sm text-muted-foreground">Not provided</p>
                ) : (
                  <div className="text-sm space-y-0.5">
                    <p>
                      {kin.name}
                      {kin.relationship && ` (${kin.relationship})`}
                    </p>
                    {kin.email && <p className="text-muted-foreground">{kin.email}</p>}
                    {kin.phones.filter((p) => p.number).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {kin.phones
                          .filter((p) => p.number)
                          .map((p, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-xs bg-muted/50 rounded-full px-2 py-0.5"
                            >
                              {p.number}
                              <span className="text-muted-foreground">({p.label})</span>
                              {p.isPrimary && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                  primary
                                </Badge>
                              )}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Medical & Dietary */}
              <div className="space-y-1.5 border-t border-border/30 pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Medical & Dietary
                </h3>
                {medical.medicalSelections.length === 0 &&
                medical.dietarySelections.length === 0 &&
                !medical.medicalNotes.trim() &&
                !medical.dietaryNotes.trim() ? (
                  <p className="text-sm text-muted-foreground">Not provided</p>
                ) : (
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Medical: </span>
                      {medical.medicalSelections.length > 0
                        ? medical.medicalSelections
                            .map(
                              (v) =>
                                medicalLov.find((i) => i.value === v)?.label ?? v,
                            )
                            .join(", ")
                        : "None selected"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Dietary: </span>
                      {medical.dietarySelections.length > 0
                        ? medical.dietarySelections
                            .map(
                              (v) =>
                                dietaryLov.find((i) => i.value === v)?.label ?? v,
                            )
                            .join(", ")
                        : "None selected"}
                    </p>
                  </div>
                )}
              </div>

              {/* Disclosure */}
              <div className="space-y-1.5 border-t border-border/30 pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Disclosure
                </h3>
                {!disclosure.checkType ? (
                  <p className="text-sm text-muted-foreground">Not provided</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span>{checkTypeName}</span>
                    <span className="text-muted-foreground">Level</span>
                    <span>{checkLevelName}</span>
                    {disclosure.certificateNumber && (
                      <>
                        <span className="text-muted-foreground">Certificate</span>
                        <span>{disclosure.certificateNumber}</span>
                      </>
                    )}
                    {disclosure.issueDate && (
                      <>
                        <span className="text-muted-foreground">Issue date</span>
                        <span>{disclosure.issueDate}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Update Service consent</span>
                    <span>
                      {disclosure.onUpdateService && disclosure.updateServiceConsentName
                        ? `Consented as "${disclosure.updateServiceConsentName}"`
                        : "Not on Update Service"}
                    </span>
                  </div>
                )}
              </div>

              {/* Qualifications */}
              <div className="space-y-1.5 border-t border-border/30 pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Qualifications
                </h3>
                {quals.filter((q) => q.qualificationTypeId > 0 && q.dateAchieved).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not provided</p>
                ) : (
                  <div className="space-y-1.5">
                    {quals
                      .filter((q) => q.qualificationTypeId > 0 && q.dateAchieved)
                      .map((q, i) => (
                        <div key={i} className="flex flex-col gap-0.5 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {qualTypes.find((qt) => qt.id === q.qualificationTypeId)?.name ??
                                `ID ${q.qualificationTypeId}`}
                            </Badge>
                            <span className="text-muted-foreground">
                              achieved {q.dateAchieved}
                            </span>
                            {q.expiryDate && (
                              <span className="text-muted-foreground">
                                · expires {q.expiryDate}
                              </span>
                            )}
                          </div>
                          {q.fileName && !q.skipped && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                              <Paperclip className="w-3 h-3" />
                              <span>{q.fileName}</span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {submitError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded p-3">
                  {submitError}
                </p>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(7)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitLoading}>
                  {submitLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Submit Application
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 9: Confirmation ───────────────────────────────────────── */}
        {step === 9 && (
          <Card className="shadow-md text-center">
            <CardContent className="pt-10 pb-10 space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Application Submitted!</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Thank you, {personal.firstName}. Your application is now under review by the HR
                team. You'll receive your login details by email once it has been approved.
              </p>
              <p className="text-xs text-muted-foreground/60 pt-2">
                No pay rate or salary information is collected during onboarding. Your HR Manager
                will configure your pay details separately.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
