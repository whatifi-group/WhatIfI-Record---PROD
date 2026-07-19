import { useState } from "react";
import { Link } from "wouter";
import {
  useListStudents,
  useCreateStudent,
  useUpdateStudent,
  getListStudentsQueryKey,
} from "@workspace/api-client-react";
import type { Student } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, IdCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface FormData {
  firstName: string;
  lastName: string;
  homeAddress: string;
  phoneNumber: string;
  emailAddress: string;
}

const defaultForm: FormData = {
  firstName: "",
  lastName: "",
  homeAddress: "",
  phoneNumber: "",
  emailAddress: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StudentRegister() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Student | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const { data: students, isLoading } = useListStudents();
  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });

  const openAdd = () => {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (item: Student) => {
    setEditingItem(item);
    setForm({
      firstName: item.firstName,
      lastName: item.lastName,
      homeAddress: item.homeAddress ?? "",
      phoneNumber: item.phoneNumber ?? "",
      emailAddress: item.emailAddress ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ title: "First name and last name are required", variant: "destructive" });
      return;
    }
    if (form.emailAddress.trim() && !EMAIL_PATTERN.test(form.emailAddress.trim())) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      homeAddress: form.homeAddress.trim() || undefined,
      phoneNumber: form.phoneNumber.trim() || undefined,
      emailAddress: form.emailAddress.trim() || undefined,
    };

    if (editingItem) {
      updateStudent.mutate(
        { studentId: editingItem.studentId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Student updated" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        },
      );
    } else {
      createStudent.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Student registered" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Failed to register student", variant: "destructive" }),
        },
      );
    }
  };

  const isSaving = createStudent.isPending || updateStudent.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <Link
        href="/course-management"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Course Management
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <IdCard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
              Student Register
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Register and manage students enrolled on courses.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" /> Register Student
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-semibold">Student ID</th>
                  <th className="px-6 py-4 font-semibold">First Name</th>
                  <th className="px-6 py-4 font-semibold">Last Name</th>
                  <th className="px-6 py-4 font-semibold">Home Address</th>
                  <th className="px-6 py-4 font-semibold">Phone Number</th>
                  <th className="px-6 py-4 font-semibold">Email Address</th>
                  <th className="px-6 py-4 font-semibold text-right w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {!students || students.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-muted-foreground text-sm"
                    >
                      No students registered yet. Click "Register Student" to get started.
                    </td>
                  </tr>
                ) : (
                  students.map((item) => (
                    <tr key={item.studentId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-3 align-middle font-medium text-foreground">
                        {item.studentId}
                      </td>
                      <td className="px-6 py-3 align-middle text-foreground">
                        {item.firstName}
                      </td>
                      <td className="px-6 py-3 align-middle text-foreground">
                        {item.lastName}
                      </td>
                      <td className="px-6 py-3 align-middle text-muted-foreground">
                        {item.homeAddress ?? <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="px-6 py-3 align-middle text-muted-foreground">
                        {item.phoneNumber ?? <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="px-6 py-3 align-middle text-muted-foreground">
                        {item.emailAddress ?? <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="px-6 py-3 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Student" : "Register Student"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input
                  className="mt-1"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  className="mt-1"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Home Address</Label>
              <Input
                className="mt-1"
                value={form.homeAddress}
                onChange={(e) => setForm((f) => ({ ...f, homeAddress: e.target.value }))}
              />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input
                className="mt-1"
                value={form.phoneNumber}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input
                className="mt-1"
                type="email"
                value={form.emailAddress}
                onChange={(e) => setForm((f) => ({ ...f, emailAddress: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingItem ? "Save Changes" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
