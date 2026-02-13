import { redirect } from "next/navigation";

export default async function AutopilotScenarioRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/flows/${id}`);
}
