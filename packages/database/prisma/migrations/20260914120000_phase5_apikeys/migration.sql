-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "keyId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- CreateIndex
CREATE INDEX "ApiRequest_organizationId_createdAt_idx" ON "ApiRequest"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequest_keyId_idx" ON "ApiRequest"("keyId");


-- AlterTable
ALTER TABLE "Session" ADD COLUMN "tokenHash" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "tokenHash" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");
