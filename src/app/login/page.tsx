import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { getCurrentUserEmail } from "@/server/authMode";

export default async function LoginPage() {
  const email = await getCurrentUserEmail();
  if (email) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
