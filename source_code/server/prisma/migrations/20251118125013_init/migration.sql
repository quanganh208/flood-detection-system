-- CreateEnum
CREATE TYPE "RainStatus" AS ENUM ('DRY', 'LIGHT', 'HEAVY');

-- CreateEnum
CREATE TYPE "WaterStatus" AS ENUM ('SAFE', 'LOW', 'WARNING', 'DANGER', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('WATER_WARNING', 'WATER_DANGER', 'HEAVY_RAIN', 'DEVICE_OFFLINE', 'SENSOR_ERROR', 'OTA_FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('PENDING', 'QUEUED', 'BUILDING', 'TESTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OTAStatus" AS ENUM ('PENDING', 'CHECKING', 'DOWNLOADING', 'VERIFYING', 'INSTALLING', 'REBOOTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeployStrategy" AS ENUM ('MANUAL', 'ALL_DEVICES', 'GRADUAL', 'CANARY', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "DeployStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "macAddress" TEXT NOT NULL,
    "ipAddress" TEXT,
    "wifiSSID" TEXT,
    "rssi" INTEGER,
    "firmwareVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uptime" INTEGER NOT NULL DEFAULT 0,
    "chipModel" TEXT,
    "freeHeap" INTEGER,
    "flashSize" INTEGER,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" TEXT NOT NULL,
    "rainAnalog" INTEGER NOT NULL,
    "rainDigital" BOOLEAN NOT NULL,
    "waterLevel" INTEGER NOT NULL,
    "rainStatus" "RainStatus" NOT NULL,
    "waterStatus" "WaterStatus" NOT NULL,
    "rssi" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "waterLevel" INTEGER,
    "rainAnalog" INTEGER,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmwares" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceFiles" JSONB NOT NULL,
    "configFile" TEXT,
    "buildLog" TEXT,
    "buildDuration" INTEGER,
    "buildStatus" "BuildStatus" NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "md5Checksum" TEXT NOT NULL,
    "description" TEXT,
    "releaseNotes" TEXT,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "firmwares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "strategy" "DeployStrategy" NOT NULL DEFAULT 'MANUAL',
    "targetDevices" JSONB,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
    "status" "DeployStatus" NOT NULL DEFAULT 'PENDING',
    "totalDevices" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "firmwareId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_updates" (
    "id" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "status" "OTAStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "downloadTime" INTEGER,
    "installTime" INTEGER,
    "totalTime" INTEGER,
    "bytesDownloaded" INTEGER,
    "checksumMatch" BOOLEAN,
    "rollbackReason" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deviceId" TEXT NOT NULL,
    "firmwareId" TEXT NOT NULL,
    "deploymentId" TEXT,

    CONSTRAINT "ota_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceId_key" ON "devices"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_macAddress_key" ON "devices"("macAddress");

-- CreateIndex
CREATE INDEX "devices_deviceId_idx" ON "devices"("deviceId");

-- CreateIndex
CREATE INDEX "devices_macAddress_idx" ON "devices"("macAddress");

-- CreateIndex
CREATE INDEX "devices_isOnline_isActive_idx" ON "devices"("isOnline", "isActive");

-- CreateIndex
CREATE INDEX "devices_lastHeartbeat_idx" ON "devices"("lastHeartbeat");

-- CreateIndex
CREATE INDEX "devices_latitude_longitude_idx" ON "devices"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "sensor_readings_deviceId_timestamp_idx" ON "sensor_readings"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "sensor_readings_timestamp_idx" ON "sensor_readings"("timestamp");

-- CreateIndex
CREATE INDEX "sensor_readings_waterStatus_idx" ON "sensor_readings"("waterStatus");

-- CreateIndex
CREATE INDEX "alerts_deviceId_createdAt_idx" ON "alerts"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_isResolved_idx" ON "alerts"("isResolved");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "firmwares_buildId_key" ON "firmwares"("buildId");

-- CreateIndex
CREATE INDEX "firmwares_buildId_idx" ON "firmwares"("buildId");

-- CreateIndex
CREATE INDEX "firmwares_version_idx" ON "firmwares"("version");

-- CreateIndex
CREATE INDEX "firmwares_isLatest_idx" ON "firmwares"("isLatest");

-- CreateIndex
CREATE INDEX "firmwares_buildStatus_idx" ON "firmwares"("buildStatus");

-- CreateIndex
CREATE INDEX "firmwares_createdAt_idx" ON "firmwares"("createdAt");

-- CreateIndex
CREATE INDEX "deployments_status_idx" ON "deployments"("status");

-- CreateIndex
CREATE INDEX "deployments_firmwareId_idx" ON "deployments"("firmwareId");

-- CreateIndex
CREATE INDEX "ota_updates_deviceId_initiatedAt_idx" ON "ota_updates"("deviceId", "initiatedAt");

-- CreateIndex
CREATE INDEX "ota_updates_status_idx" ON "ota_updates"("status");

-- CreateIndex
CREATE INDEX "ota_updates_firmwareId_idx" ON "ota_updates"("firmwareId");

-- CreateIndex
CREATE INDEX "ota_updates_deploymentId_idx" ON "ota_updates"("deploymentId");

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_firmwareId_fkey" FOREIGN KEY ("firmwareId") REFERENCES "firmwares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_updates" ADD CONSTRAINT "ota_updates_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_updates" ADD CONSTRAINT "ota_updates_firmwareId_fkey" FOREIGN KEY ("firmwareId") REFERENCES "firmwares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_updates" ADD CONSTRAINT "ota_updates_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
