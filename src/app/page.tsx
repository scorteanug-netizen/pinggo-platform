import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/server/authMode";

export default async function HomePage() {
  const email = await getCurrentUserEmail();
  if (email) redirect("/dashboard");
  redirect("/login");
}
