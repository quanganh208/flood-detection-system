-- CreateEnum
CREATE TYPE "RainStatus" AS ENUM ('DRY', 'LIGHT', 'HEAVY');

-- CreateEnum
CREATE TYPE "WaterStatus" AS ENUM ('SAFE', 'LOW', 'WARNING', 'DANGER', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('WATER_WARNING', 'WATER_DANGER', 'HEAVY_RAIN', 'DEVICE_OFFLINE', 'SENSOR_ERROR', 'OTA_FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OTAStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'INSTALLING', 'SUCCESS', 'FAILED');

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
CREATE TABLE "firmware_versions" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "md5Checksum" TEXT NOT NULL,
    "releaseNotes" TEXT,
    "isStable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmware_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_history" (
    "id" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "status" "OTAStatus" NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deviceId" TEXT NOT NULL,
    "firmwareId" TEXT NOT NULL,

    CONSTRAINT "ota_history_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "firmware_versions_buildId_key" ON "firmware_versions"("buildId");

-- CreateIndex
CREATE UNIQUE INDEX "firmware_versions_version_key" ON "firmware_versions"("version");

-- CreateIndex
CREATE INDEX "firmware_versions_version_idx" ON "firmware_versions"("version");

-- CreateIndex
CREATE INDEX "firmware_versions_buildId_idx" ON "firmware_versions"("buildId");

-- CreateIndex
CREATE INDEX "ota_history_deviceId_startedAt_idx" ON "ota_history"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "ota_history_status_idx" ON "ota_history"("status");

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_history" ADD CONSTRAINT "ota_history_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_history" ADD CONSTRAINT "ota_history_firmwareId_fkey" FOREIGN KEY ("firmwareId") REFERENCES "firmware_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
