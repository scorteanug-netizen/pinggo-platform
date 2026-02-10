"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sanitizeNextPath } from "@/lib/routes";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNextPath(searchParams.get("next"), "/dashboard");
  const callbackError = searchParams.get("error");
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function consumeInviteHash() {
      if (typeof window === "undefined" || !window.location.hash) return;

      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");
      if (!accessToken || !refreshToken) return;

      setIsLoading(true);
      setErrorMessage("");

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;
      setIsLoading(false);

      if (error) {
        setErrorMessage(error.message || "Linkul de conectare nu este valid.");
        return;
      }

      const redirectPath = type === "invite" || type === "recovery" ? "/auth/set-password" : nextPath;
      router.replace(redirectPath);
      router.refresh();
    }

    consumeInviteHash();
    return () => {
      cancelled = true;
    };
  }, [nextPath, router, supabase]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message || "Conectare esuata.");
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Conectare</CardTitle>
          <CardDescription>Autentificare cu email si parola.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nume@firma.ro"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Parola</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-orange-500 text-white hover:bg-orange-600"
              disabled={isLoading}
            >
              {isLoading ? "Se conecteaza..." : "Conecteaza-te"}
            </Button>

            {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}
            {!errorMessage && callbackError ? (
              <p className="text-sm text-rose-600">{decodeURIComponent(callbackError)}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
