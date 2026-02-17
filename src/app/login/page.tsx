import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { getCurrentUserEmail } from "@/server/authMode";

export default async function LoginPage() {
  try {
    const email = await getCurrentUserEmail();
    if (email) redirect("/dashboard");
  } catch {
    // Auth/DB not configured — show login form
  }
  return <LoginForm />;
}
