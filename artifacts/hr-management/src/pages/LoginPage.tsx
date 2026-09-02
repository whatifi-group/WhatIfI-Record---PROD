import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEnvironment } from "@/contexts/EnvironmentContext";
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
import { Compass, Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/** Base path for the API, matching the pattern used by the other auth pages. */
const apiBase = () => `${import.meta.env.BASE_URL}api`;

/**
 * Failure codes set by GET /api/auth/sso/callback when it redirects back here.
 * The server keeps the specifics in its log; these are what the user sees.
 */
const SSO_ERRORS: Record<string, string> = {
  no_account:
    "There's no WhatIfI Record account for that Microsoft address. Contact your system administrator.",
  inactive:
    "Your WhatIfI Record account isn't active. Contact your system administrator.",
  ambiguous_email:
    "More than one employee record uses that email address, so we couldn't tell which is yours. Contact your system administrator.",
  wrong_tenant: "That account isn't part of the WhatIfI Group organisation.",
  sso_failed: "Microsoft sign-in didn't complete. Please try again.",
};

/** The Microsoft logo — four coloured squares, per Microsoft's brand guidance. */
function MicrosoftLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 21 21"
      aria-hidden="true"
      className="mr-2 shrink-0"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = useLogin();
  const { ssoEnabled } = useEnvironment();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Read the callback's ?error= once, straight from the URL — wouter's router
  // is mounted on the path only, so the query string isn't in its location.
  const [ssoError] = useState<string | null>(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (!code) return null;
    return SSO_ERRORS[code] ?? SSO_ERRORS.sso_failed;
  });

  // With SSO configured, password sign-in is a break-glass path for system
  // accounts and stays tucked away until asked for. Without it, it's the only
  // way in, so it's shown outright. Derived rather than seeded into state
  // because `ssoEnabled` is false until /environment resolves.
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const showPasswordForm = passwordFormOpen || !ssoEnabled;

  const signInWithMicrosoft = (prompt?: string) => {
    const query = prompt ? `?prompt=${prompt}` : "";
    window.location.href = `${apiBase()}/auth/sso/login${query}`;
  };

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setErrorMsg(null);
    login.mutate(
      { data: values },
      {
        onSuccess: (user) => {
          // Set auth data directly so isAuthenticated is true before navigation,
          // preventing the Router from bouncing back to /login.
          queryClient.setQueryData(getGetMeQueryKey(), user);
          setLocation("/");
        },
        onError: (err: any) => {
          setErrorMsg(err.message || "Invalid email or password.");
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Compass background decorative element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary/[0.03] pointer-events-none z-0">
        <Compass className="w-[800px] h-[800px]" strokeWidth={0.5} />
      </div>

      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-700 z-10">
        <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden relative">
          <div className="h-1 bg-gradient-to-r from-primary via-secondary to-destructive w-full absolute top-0 left-0" />

          <div className="p-8 sm:p-10">
            <div className="flex flex-col items-center mb-8">
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-border/50 mb-6">
                <img
                  src={logoUrl}
                  alt="WhatIfI Group Ltd"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground text-center tracking-tight">
                WhatIfI Record
              </h1>
              <p className="text-muted-foreground text-xs mt-1 text-center">
                WhatIfI Group Management Information System
              </p>
              <p className="text-muted-foreground text-sm mt-2 text-center">
                Sign in to continue
              </p>
            </div>

            {(errorMsg || ssoError) && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-md mb-6 text-center font-medium">
                {errorMsg ?? ssoError}
              </div>
            )}

            {ssoEnabled && (
              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full font-medium"
                  size="lg"
                  onClick={() => signInWithMicrosoft()}
                >
                  <MicrosoftLogo />
                  Sign in with Microsoft
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => signInWithMicrosoft("select_account")}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Use a different account
                  </button>
                </div>

                {!showPasswordForm && (
                  <div className="text-center pt-4 border-t border-border mt-6">
                    <button
                      type="button"
                      onClick={() => setPasswordFormOpen(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Sign in with a system account
                    </button>
                  </div>
                )}
              </div>
            )}

            {showPasswordForm && (
              <>
                {ssoEnabled && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center mb-5">
                      System accounts only — for administrator access when
                      Microsoft sign-in is unavailable.
                    </p>
                  </div>
                )}
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-5"
                  >
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">
                            Email
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              {...field}
                              className="bg-background"
                              disabled={login.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">
                            Password
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              {...field}
                              className="bg-background"
                              disabled={login.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full font-medium mt-2"
                      size="lg"
                      disabled={login.isPending}
                    >
                      {login.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        "Sign in"
                      )}
                    </Button>

                    <div className="text-center pt-1">
                      <Link href="/forgot-password">
                        <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                          Forgot your password?
                        </span>
                      </Link>
                    </div>
                  </form>
                </Form>
              </>
            )}
          </div>

          <div className="bg-muted/50 p-4 text-center border-t border-border">
            <p className="text-xs text-muted-foreground font-medium">
              © 2026 WhatIfI Group Ltd
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
