/**
 * SysAdmin > Notifications — edit recipient lists and email copy for every
 * transactional email the app sends. Templates and their default content
 * are seeded server-side (see api-server/src/lib/seedNotificationSettings.ts)
 * and only ever inserted once; edits made here persist across restarts.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Mail, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface NotificationSetting {
  key: string;
  recipients: string | null;
  subject: string;
  bodyText: string;
  updatedAt: string;
  label: string;
  description: string;
  placeholders: string[];
  recipientsEditable: boolean;
}

function TemplateCard({
  template,
  onSaved,
}: {
  template: NotificationSetting;
  onSaved: (updated: NotificationSetting) => void;
}) {
  const { toast } = useToast();
  const [recipients, setRecipients] = useState(template.recipients ?? "");
  const [subject, setSubject] = useState(template.subject);
  const [bodyText, setBodyText] = useState(template.bodyText);
  const [saving, setSaving] = useState(false);

  const dirty =
    recipients !== (template.recipients ?? "") ||
    subject !== template.subject ||
    bodyText !== template.bodyText;

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string | null> = { subject, bodyText };
      if (template.recipientsEditable) {
        body.recipients = recipients.trim() === "" ? null : recipients;
      }
      const res = await fetch(`/api/sysadmin/notification-settings/${template.key}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      const updated = await res.json();
      onSaved({ ...template, ...updated });
      toast({ title: "Saved", description: `${template.label} updated.` });
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-base font-display font-semibold text-foreground">{template.label}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>
      </div>

      {template.recipientsEditable ? (
        <div className="space-y-1.5">
          <Label htmlFor={`recipients-${template.key}`}>Recipients (comma-separated)</Label>
          <Input
            id={`recipients-${template.key}`}
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="hr@whatifigroup.co.uk, ops@whatifigroup.co.uk"
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Recipient is determined automatically — not configurable here.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`subject-${template.key}`}>Subject</Label>
        <Input
          id={`subject-${template.key}`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`body-${template.key}`}>Body</Label>
        <Textarea
          id={`body-${template.key}`}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={6}
          className="font-mono text-xs"
        />
      </div>

      {template.placeholders.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Available placeholders:{" "}
          {template.placeholders.map((p) => (
            <code key={p} className="mx-0.5 px-1 py-0.5 bg-muted rounded">{`{{${p}}}`}</code>
          ))}
        </p>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export default function NotificationSettings() {
  const [templates, setTemplates] = useState<NotificationSetting[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sysadmin/notification-settings", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load notification settings");
        return r.json();
      })
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"));
  }, []);

  function handleSaved(updated: NotificationSetting) {
    setTemplates((prev) =>
      prev ? prev.map((t) => (t.key === updated.key ? updated : t)) : prev,
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 border-b border-border/50 pb-6">
        <Link href="/sysadmin">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Mail className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recipient addresses and email copy for every transactional email the app sends.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!templates && !error ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {templates?.map((t) => (
            <TemplateCard key={t.key} template={t} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
