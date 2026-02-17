import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/server/authMode";

export default async function HomePage() {
  try {
    const email = await getCurrentUserEmail();
    if (email) redirect("/dashboard");
  } catch {
    // Auth/DB not configured or error — send to login
  }
  redirect("/login");
}
