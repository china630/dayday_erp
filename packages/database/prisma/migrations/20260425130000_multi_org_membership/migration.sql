-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable organization_memberships
CREATE TABLE "organization_memberships" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("user_id","organization_id")
);

-- Backfill from existing users (1:1 до миграции)
INSERT INTO "organization_memberships" ("user_id", "organization_id", "role", "joined_at")
SELECT "id", "organization_id", "role", "created_at" FROM "users";

-- New profile fields
ALTER TABLE "users" ADD COLUMN "full_name" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;

-- Drop legacy user ↔ org columns
ALTER TABLE "users" DROP CONSTRAINT "users_organization_id_fkey";
DROP INDEX IF EXISTS "users_organization_id_idx";
ALTER TABLE "users" DROP COLUMN "organization_id";
ALTER TABLE "users" DROP COLUMN "role";

ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");

-- AccessRequest
CREATE TABLE "access_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_requests_organization_id_status_idx" ON "access_requests"("organization_id", "status");
CREATE INDEX "access_requests_requester_id_idx" ON "access_requests"("requester_id");

ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OrganizationInvite
CREATE TABLE "organization_invites" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_invites_organization_id_email_idx" ON "organization_invites"("organization_id", "email");

ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
