-- Membership lifecycle states for invite/enable/disable flow
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

ALTER TABLE "Membership"
ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "invitedAt" TIMESTAMP(3),
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "disabledAt" TIMESTAMP(3);

-- Existing memberships are considered already accepted active users.
UPDATE "Membership"
SET "invitedAt" = "createdAt",
    "acceptedAt" = "createdAt"
WHERE "status" = 'ACTIVE';

CREATE INDEX "Membership_workspaceId_status_idx" ON "Membership"("workspaceId", "status");
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");
