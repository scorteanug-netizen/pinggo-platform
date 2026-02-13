import { MembershipRole } from "@prisma/client";
import { getActivityFeed } from "@/server/services/activityFeedService";
import { ActivityFeed } from "./ActivityFeed";

type ActivityFeedSectionProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

export async function ActivityFeedSection({
  workspaceId,
  viewerRole,
  viewerUserId,
}: ActivityFeedSectionProps) {
  const initial = await getActivityFeed({
    workspaceId,
    viewerRole,
    viewerUserId,
    offset: 0,
    limit: 20,
  });

  return (
    <ActivityFeed
      initialEvents={initial.events}
      initialHasMore={initial.hasMore}
      pageSize={20}
    />
  );
}
