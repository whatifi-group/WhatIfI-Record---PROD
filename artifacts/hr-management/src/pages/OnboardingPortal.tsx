/**
 * Public onboarding portal for new hires.
 * No authentication required — the route is listed as public in App.tsx.
 *
 * Step 0: Password gate  → POST /api/onboarding/verify
 * Step 1: Personal details
 * Step 2: Qualifications (optional)
 * Step 3: Review & submit → POST /api/onboarding/submit
 * Step 4: Confirmation screen
 *
 * Pay rate / salary fields never appear here.
 */
import { useState, useEffect, useRef } from "react";
import { useListDepartments } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, Plus, Trash2, Eye, EyeOff, Paperclip, X } from "lucide-react";

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
}

interface PersonalForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  departmentId: string;
  employmentType: string;
  startDate: string;
}

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "apprentice", label: "Apprentice" },
];

const emptyPersonal: PersonalForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  jobTitle: "",
  departmentId: "",
  employmentType: "",
  startDate: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingPortal() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [personal, setPersonal] = useState<PersonalForm>(emptyPersonal);
  const [personalErrors, setPersonalErrors] = useState<Partial<PersonalForm>>({});

  const [quals, setQuals] = useState<QualEntry[]>([]);
  const [qualTypes, setQualTypes] = useState<QualType[]>([]);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const { data: departments = [] } = useListDepartments();

  // Fetch qualification types (only needed from step 2 onward)
  useEffect(() => {
    if (step < 2) return;
    fetch("/api/qualification-types")
      .then((r) => r.json())
      .then((data: QualType[]) => setQualTypes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [step]);

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

  // ── Step 1: Validate personal details ────────────────────────────────────

  function validatePersonal(): boolean {
    const errors: Partial<PersonalForm> = {};
    if (!personal.firstName.trim()) errors.firstName = "Required";
    if (!personal.lastName.trim()) errors.lastName = "Required";
    if (!personal.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email))
      errors.email = "Valid email required";
    if (!personal.jobTitle.trim()) errors.jobTitle = "Required";
    if (!personal.employmentType) errors.employmentType = "Required";
    if (!personal.startDate) errors.startDate = "Required";
    setPersonalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Step 2: Qualifications ────────────────────────────────────────────────

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      },
    ]);
  }

  function removeQual(idx: number) {
    setQuals((prev) => prev.filter((_, i) => i !== idx));
    fileInputRefs.current = fileInputRefs.current.filter((_, i) => i !== idx);
  }

  function updateQual(idx: number, field: keyof QualEntry, value: string | number | boolean | null) {
    setQuals((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)),
    );
  }

  async function handleFileSelect(idx: number, file: File) {
    updateQual(idx, "uploading", true);
    updateQual(idx, "uploadError", null);
    try {
      // Request a presigned URL from the onboarding-scoped endpoint
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

      // Upload the file directly to the presigned URL
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        updateQual(idx, "uploadError", "Upload failed. Please try again.");
        return;
      }

      // Store the metadata on the qualification entry
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

  function clearFile(idx: number) {
    setQuals((prev) =>
      prev.map((q, i) =>
        i === idx
          ? { ...q, fileName: null, fileUrl: null, mimeType: null, uploadError: null }
          : q,
      ),
    );
    const input = fileInputRefs.current[idx];
    if (input) input.value = "";
  }

  // ── Step 3: Submit ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitError("");
    setSubmitLoading(true);
    try {
      const payload = {
        firstName: personal.firstName.trim(),
        lastName: personal.lastName.trim(),
        email: personal.email.trim().toLowerCase(),
        phone: personal.phone.trim() || null,
        jobTitle: personal.jobTitle.trim(),
        departmentId: personal.departmentId ? Number(personal.departmentId) : null,
        employmentType: personal.employmentType,
        startDate: personal.startDate,
        qualifications: quals
          .filter((q) => q.qualificationTypeId > 0 && q.dateAchieved)
          .map((q) => ({
            qualificationTypeId: q.qualificationTypeId,
            dateAchieved: q.dateAchieved,
            expiryDate: q.expiryDate || null,
            notes: q.notes || null,
            fileName: q.fileName ?? null,
            fileUrl: q.fileUrl ?? null,
            mimeType: q.mimeType ?? null,
          })),
      };

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

      setStep(4);
    } catch {
      setSubmitError("Could not reach the server. Please try again.");
    } finally {
      setSubmitLoading(false);
    }
  }

  // ── Step indicator ─────────────────────────────────────────────────────────

  const STEPS = ["Verify", "Your Details", "Qualifications", "Review"];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">New Hire Onboarding</h1>
          <p className="text-slate-500">Complete this form to begin your onboarding process.</p>
        </div>

        {/* Step indicator (steps 1–3) */}
        {step >= 1 && step <= 3 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.slice(1).map((label, i) => (
              <div key={label} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold border-2 transition-colors ${
                    step - 1 > i
                      ? "bg-primary border-primary text-primary-foreground"
                      : step - 1 === i
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30 text-muted-foreground/50"
                  }`}
                >
                  {step - 1 > i ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={`ml-1.5 text-sm font-medium hidden sm:inline ${
                    step - 1 === i ? "text-primary" : "text-muted-foreground/50"
                  }`}
                >
                  {label}
                </span>
                {i < 2 && (
                  <div
                    className={`mx-3 h-0.5 w-8 sm:w-16 rounded ${
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
                      placeholder="Enter the onboarding password"
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
                  {verifyError && (
                    <p className="text-sm text-destructive">{verifyError}</p>
                  )}
                </div>
                <Button type="submit" disabled={verifyLoading || !password} className="w-full">
                  {verifyLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
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
                  <Label htmlFor="ob-firstName">First name <span className="text-destructive">*</span></Label>
                  <Input
                    id="ob-firstName"
                    value={personal.firstName}
                    onChange={(e) => setPersonal((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="Jane"
                  />
                  {personalErrors.firstName && (
                    <p className="text-xs text-destructive">{personalErrors.firstName}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-lastName">Last name <span className="text-destructive">*</span></Label>
                  <Input
                    id="ob-lastName"
                    value={personal.lastName}
                    onChange={(e) => setPersonal((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="Smith"
                  />
                  {personalErrors.lastName && (
                    <p className="text-xs text-destructive">{personalErrors.lastName}</p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-email">Email address <span className="text-destructive">*</span></Label>
                  <Input
                    id="ob-email"
                    type="email"
                    value={personal.email}
                    onChange={(e) => setPersonal((p) => ({ ...p, email: e.target.value }))}
                    placeholder="jane.smith@example.com"
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
                    placeholder="+44 7700 900000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-startDate">Start date <span className="text-destructive">*</span></Label>
                  <Input
                    id="ob-startDate"
                    type="date"
                    value={personal.startDate}
                    onChange={(e) => setPersonal((p) => ({ ...p, startDate: e.target.value }))}
                  />
                  {personalErrors.startDate && (
                    <p className="text-xs text-destructive">{personalErrors.startDate}</p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ob-jobTitle">Job title <span className="text-destructive">*</span></Label>
                  <Input
                    id="ob-jobTitle"
                    value={personal.jobTitle}
                    onChange={(e) => setPersonal((p) => ({ ...p, jobTitle: e.target.value }))}
                    placeholder="e.g. Operations Assistant"
                  />
                  {personalErrors.jobTitle && (
                    <p className="text-xs text-destructive">{personalErrors.jobTitle}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-empType">Employment type <span className="text-destructive">*</span></Label>
                  <select
                    id="ob-empType"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={personal.employmentType}
                    onChange={(e) => setPersonal((p) => ({ ...p, employmentType: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {personalErrors.employmentType && (
                    <p className="text-xs text-destructive">{personalErrors.employmentType}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-dept">Department (optional)</Label>
                  <select
                    id="ob-dept"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={personal.departmentId}
                    onChange={(e) => setPersonal((p) => ({ ...p, departmentId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {departments.map((d) => (
                      <option key={d.id} value={String(d.id)}>{d.name}</option>
                    ))}
                  </select>
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
                  Next: Qualifications <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Qualifications ─────────────────────────────────────── */}
        {step === 2 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Qualifications</CardTitle>
              <CardDescription>
                Add any certificates or qualifications relevant to your role. This step is optional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {quals.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No qualifications added yet. Click "Add Qualification" to begin, or skip this step.
                </p>
              )}

              {quals.map((q, idx) => (
                <div
                  key={idx}
                  className="border border-border/50 rounded-lg p-4 space-y-3 bg-muted/20"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Qualification {idx + 1}</span>
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
                      <Label className="text-xs">Qualification type <span className="text-destructive">*</span></Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={q.qualificationTypeId || ""}
                        onChange={(e) => updateQual(idx, "qualificationTypeId", Number(e.target.value))}
                      >
                        <option value="">Select qualification type…</option>
                        {qualTypes.map((qt) => (
                          <option key={qt.id} value={qt.id}>{qt.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Date achieved <span className="text-destructive">*</span></Label>
                      <Input
                        type="date"
                        value={q.dateAchieved}
                        onChange={(e) => updateQual(idx, "dateAchieved", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Expiry date (optional)</Label>
                      <Input
                        type="date"
                        value={q.expiryDate}
                        onChange={(e) => updateQual(idx, "expiryDate", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Notes (optional)</Label>
                      <Input
                        value={q.notes}
                        onChange={(e) => updateQual(idx, "notes", e.target.value)}
                        placeholder="Any relevant notes…"
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
                      ) : (
                        <div>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic"
                            ref={(el) => { fileInputRefs.current[idx] = el; }}
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
                        </div>
                      )}
                      {q.uploadError && (
                        <p className="text-xs text-destructive">{q.uploadError}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addQual} className="w-full">
                <Plus className="w-4 h-4 mr-1.5" /> Add Qualification
              </Button>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Review & Submit <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Review ─────────────────────────────────────────────── */}
        {step === 3 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Review Your Information</CardTitle>
              <CardDescription>
                Please check everything looks correct before submitting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Personal details summary */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Personal Details
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span>{personal.firstName} {personal.lastName}</span>
                  <span className="text-muted-foreground">Email</span>
                  <span className="break-all">{personal.email}</span>
                  {personal.phone && (
                    <>
                      <span className="text-muted-foreground">Phone</span>
                      <span>{personal.phone}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Job Title</span>
                  <span>{personal.jobTitle}</span>
                  <span className="text-muted-foreground">Employment Type</span>
                  <span>
                    {EMPLOYMENT_TYPES.find((t) => t.value === personal.employmentType)?.label ?? personal.employmentType}
                  </span>
                  <span className="text-muted-foreground">Start Date</span>
                  <span>{personal.startDate}</span>
                  {personal.departmentId && (
                    <>
                      <span className="text-muted-foreground">Department</span>
                      <span>
                        {departments.find((d) => String(d.id) === personal.departmentId)?.name ?? "—"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Qualifications summary */}
              {quals.filter((q) => q.qualificationTypeId > 0 && q.dateAchieved).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Qualifications
                  </h3>
                  <div className="space-y-1.5">
                    {quals
                      .filter((q) => q.qualificationTypeId > 0 && q.dateAchieved)
                      .map((q, i) => (
                        <div key={i} className="flex flex-col gap-0.5 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {qualTypes.find((qt) => qt.id === q.qualificationTypeId)?.name ?? `ID ${q.qualificationTypeId}`}
                            </Badge>
                            <span className="text-muted-foreground">achieved {q.dateAchieved}</span>
                            {q.expiryDate && (
                              <span className="text-muted-foreground">· expires {q.expiryDate}</span>
                            )}
                          </div>
                          {q.fileName && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                              <Paperclip className="w-3 h-3" />
                              <span>{q.fileName}</span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {submitError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded p-3">
                  {submitError}
                </p>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>
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

        {/* ── Step 4: Confirmation ───────────────────────────────────────── */}
        {step === 4 && (
          <Card className="shadow-md text-center">
            <CardContent className="pt-10 pb-10 space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Application Submitted!</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Thank you, {personal.firstName}. Your application is now under review by the HR team.
                You'll receive your login details by email once it has been approved.
              </p>
              <p className="text-xs text-muted-foreground/60 pt-2">
                No pay rate or salary information is collected during onboarding.
                Your HR Manager will configure your pay details separately.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
