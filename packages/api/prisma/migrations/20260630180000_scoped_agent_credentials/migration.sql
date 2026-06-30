-- AlterTable: capture the approving actor on MealSuggestion (approval is no
-- longer actorless). Nullable so existing rows remain valid.
ALTER TABLE "MealSuggestion" ADD COLUMN     "approvedByActorType" TEXT,
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- CreateTable: scoped, least-privilege MCP agent credential (hashed-only key).
CREATE TABLE "AgentCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsed" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable: append-only audit trail for agent authorization decisions.
CREATE TABLE "AgentAuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "credentialId" TEXT,
    "familyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentCredential_hashedKey_key" ON "AgentCredential"("hashedKey");

-- CreateIndex
CREATE INDEX "AgentCredential_familyId_idx" ON "AgentCredential"("familyId");

-- CreateIndex
CREATE INDEX "AgentAuditLog_familyId_idx" ON "AgentAuditLog"("familyId");

-- CreateIndex
CREATE INDEX "AgentAuditLog_credentialId_idx" ON "AgentAuditLog"("credentialId");

-- AddForeignKey: a credential does not survive its family.
ALTER TABLE "AgentCredential" ADD CONSTRAINT "AgentCredential_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: audit history survives credential deletion (SET NULL).
ALTER TABLE "AgentAuditLog" ADD CONSTRAINT "AgentAuditLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AgentCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
