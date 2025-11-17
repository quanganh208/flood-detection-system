/**
 * SSE Event DTOs for ESP32 Firmware Build System
 * Based on sse-event-schema.json specification
 */

export type BuildStage =
  | 'initializing'
  | 'validating'
  | 'compiling'
  | 'linking'
  | 'packaging'
  | 'finalizing';

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export type LogSource = 'platformio' | 'compiler' | 'linker' | 'system';

export type ErrorType =
  | 'validation_error'
  | 'compilation_error'
  | 'linking_error'
  | 'timeout_error'
  | 'system_error'
  | 'cancellation';

export type CancellationReason = 'user_requested' | 'timeout' | 'system_shutdown';

/**
 * Base SSE Event structure
 */
export interface BaseEvent<T = Record<string, unknown>> {
  event: string;
  id: string;
  data: T;
}

/**
 * Build Started Event
 */
export interface BuildStartedEventData {
  buildId: string;
  timestamp: string;
  fileCount: number;
  queuePosition: number;
  estimatedDuration?: number;
}

export interface BuildStartedEvent extends BaseEvent<BuildStartedEventData> {
  event: 'build_started';
  data: BuildStartedEventData;
}

/**
 * Progress Event
 */
export interface ProgressEventData {
  buildId: string;
  timestamp: string;
  stage: BuildStage;
  percent: number;
  message?: string;
  currentFile?: string;
}

export interface ProgressEvent extends BaseEvent<ProgressEventData> {
  event: 'progress';
  data: ProgressEventData;
}

/**
 * Log Event
 */
export interface LogMetadata {
  file?: string;
  line?: number;
  column?: number;
}

export interface LogEventData {
  buildId: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: LogSource;
  metadata?: LogMetadata;
}

export interface LogEvent extends BaseEvent<LogEventData> {
  event: 'log';
  data: LogEventData;
}

/**
 * Build Complete Event
 */
export interface BuildMetadata {
  flashSize?: number;
  ramUsage?: number;
  platform?: string;
  framework?: string;
}

export interface BuildCompleteEventData {
  buildId: string;
  timestamp: string;
  success: boolean;
  duration: number;
  firmwareUrl?: string;
  size?: number;
  md5?: string;
  metadata?: BuildMetadata;
}

export interface BuildCompleteEvent extends BaseEvent<BuildCompleteEventData> {
  event: 'build_complete';
  data: BuildCompleteEventData;
}

/**
 * Error Event
 */
export interface ErrorEventData {
  buildId: string;
  timestamp: string;
  errorType: ErrorType;
  message: string;
  details?: string;
  recoverable?: boolean;
  suggestions?: string[];
}

export interface ErrorEvent extends BaseEvent<ErrorEventData> {
  event: 'error';
  data: ErrorEventData;
}

/**
 * Heartbeat Event
 */
export interface HeartbeatEventData {
  timestamp: string;
  activeBuilds: number;
  queueLength?: number;
}

export interface HeartbeatEvent extends BaseEvent<HeartbeatEventData> {
  event: 'heartbeat';
  data: HeartbeatEventData;
}

/**
 * Build Cancelled Event
 */
export interface BuildCancelledEventData {
  buildId: string;
  timestamp: string;
  reason: CancellationReason;
  message?: string;
}

export interface BuildCancelledEvent extends BaseEvent<BuildCancelledEventData> {
  event: 'build_cancelled';
  data: BuildCancelledEventData;
}

/**
 * Union type of all SSE events
 */
export type SSEBuildEvent =
  | BuildStartedEvent
  | ProgressEvent
  | LogEvent
  | BuildCompleteEvent
  | ErrorEvent
  | HeartbeatEvent
  | BuildCancelledEvent;

/**
 * Generic event type for internal use
 */
export interface BuildEvent {
  event: string;
  data: Record<string, unknown>;
}
