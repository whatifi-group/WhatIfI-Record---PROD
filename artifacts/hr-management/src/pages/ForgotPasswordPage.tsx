import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
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
import logoUrl from "@assets/Main_Logo_-_Colour_on_White_1784059733026.PNG";
import { Compass, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary/[0.03] pointer-events-none z-0">
        <Compass className="w-[800px] h-[800px]" strokeWidth={0.5} />
      </div>

      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-700 z-10">
        <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden relative">
          <div className="h-1 bg-gradient-to-r from-primary via-secondary to-destructive w-full absolute top-0 left-0" />

          <div className="p-8 sm:p-10">
            <div className="flex flex-col items-center mb-8">
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-border/50 mb-6">
                <img src={logoUrl} alt="WhatIfI Group Ltd" className="w-16 h-16 object-contain" />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground text-center tracking-tight">
                Reset your password
              </h1>
              <p className="text-muted-foreground text-sm mt-2 text-center">
                {submitted
                  ? "Check your email for a reset link."
                  : "Enter your email and we'll send you a reset link."}
              </p>
            </div>

            {submitted ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-sm text-center text-muted-foreground">
                  If an account exists for that email address, a password reset
                  link has been sent. It expires in&nbsp;1&nbsp;hour.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="mt-2 w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to sign in
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-md mb-6 text-center font-medium">
                    {error}
                  </div>
                )}

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="name@whatifigroup.com"
                              className="bg-background"
                              disabled={loading}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" className="w-full font-medium" size="lg" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        "Send reset link"
                      )}
                    </Button>

                    <div className="text-center">
                      <Link href="/login">
                        <button type="button" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                          <ArrowLeft className="h-3 w-3" />
                          Back to sign in
                        </button>
                      </Link>
                    </div>
                  </form>
                </Form>
              </>
            )}
          </div>

          <div className="bg-muted/50 p-4 text-center border-t border-border">
            <p className="text-xs text-muted-foreground font-medium">
              Authorised access only. All activities are recorded.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
