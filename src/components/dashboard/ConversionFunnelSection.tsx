import { MembershipRole } from "@prisma/client";
import { getConversionFunnel } from "@/server/services/conversionFunnelService";
import { ConversionFunnel } from "./ConversionFunnel";

type ConversionFunnelSectionProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

export async function ConversionFunnelSection({
  workspaceId,
  viewerRole,
  viewerUserId,
}: ConversionFunnelSectionProps) {
  const data = await getConversionFunnel({
    workspaceId,
    viewerRole,
    viewerUserId,
  });

  return (
    <ConversionFunnel
      stages={data.stages}
      overallConversionPct={data.overallConversionPct}
      biggestDropoff={data.biggestDropoff}
    />
  );
}
