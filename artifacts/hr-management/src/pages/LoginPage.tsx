import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = useLogin();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      }
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
                <img src={logoUrl} alt="WhatIfI Group Ltd" className="w-16 h-16 object-contain" />
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

            {errorMsg && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-md mb-6 text-center font-medium">
                {errorMsg}
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Email</FormLabel>
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
                      <FormLabel className="text-foreground">Password</FormLabel>
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
