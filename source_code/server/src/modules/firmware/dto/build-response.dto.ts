/**
 * Build Response DTOs
 */

export interface BuildResponse {
  success: boolean;
  build_id: string;
  firmware_url: string;
  size: number;
  md5: string;
  build_log?: string;
}

export interface BuildStatusResponse {
  buildId: string;
  status: BuildStatus;
  stage?: string;
  percent: number;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  estimatedRemaining?: number;
  error?: string;
}

export enum BuildStatus {
  QUEUED = 'queued',
  BUILDING = 'building',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface QueueStatusResponse {
  queueLength: number;
  activeCount: number;
  maxConcurrent: number;
  available: number;
}

export interface BuildInitiatedResponse {
  buildId: string;
  queuePosition: number;
  estimatedStartTime?: string;
  streamUrl: string;
}
