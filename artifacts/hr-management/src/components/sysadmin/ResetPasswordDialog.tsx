import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useResetUserPassword } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { KeyRound } from "lucide-react";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  userName: string;
}

export function ResetPasswordDialog({ open, onOpenChange, userId, userName }: Props) {
  const { toast } = useToast();
  const resetPassword = useResetUserPassword();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = (values: FormValues) => {
    resetPassword.mutate(
      { id: userId, data: { password: values.password } },
      {
        onSuccess: () => {
          toast({
            title: "Password reset",
            description: `Password for ${userName} has been updated successfully.`,
          });
          form.reset();
          onOpenChange(false);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to reset password. Please try again.",
          });
        },
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) form.reset();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle>Reset Password</DialogTitle>
          </div>
          <DialogDescription>
            Set a new password for <span className="font-medium text-foreground">{userName}</span>.
            They will need to use this password on their next login.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"

                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"

                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={resetPassword.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetPassword.isPending}>
                {resetPassword.isPending ? "Saving…" : "Reset Password"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
