import { Injectable, Logger } from '@nestjs/common';
import { BuildStatus } from '../dto/build-response.dto';

export interface BuildState {
  buildId: string;
  builderBuildId?: string;
  status: BuildStatus;
  stage?: string;
  percent: number;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  fileCount: number;
  queuePosition?: number;
  error?: string;
  buildLog?: string;
  firmwareUrl?: string;
  size?: number;
  md5?: string;
}

@Injectable()
export class BuildStateService {
  private readonly logger = new Logger(BuildStateService.name);

  private states = new Map<string, BuildState>();

  getState(buildId: string): BuildState | null {
    return this.states.get(buildId) || null;
  }

  setState(buildId: string, state: Partial<BuildState>): void {
    const current = this.getState(buildId);
    const updated: BuildState = {
      buildId,
      status: BuildStatus.QUEUED,
      percent: 0,
      fileCount: 0,
      ...current,
      ...state,
    };

    this.states.set(buildId, updated);
  }

  deleteState(buildId: string): void {
    this.states.delete(buildId);
  }

  getAllActive(): BuildState[] {
    const states = Array.from(this.states.values());
    return states.filter(
      (s) => s.status === BuildStatus.BUILDING || s.status === BuildStatus.QUEUED,
    );
  }

  getAllStates(): BuildState[] {
    return Array.from(this.states.values());
  }

  exists(buildId: string): boolean {
    return this.states.has(buildId);
  }

  countByStatus(status: BuildStatus): number {
    const states = Array.from(this.states.values());
    return states.filter((s) => s.status === status).length;
  }

  cleanupOldBuilds(maxAge: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [buildId, state] of this.states.entries()) {
      const completedAt = state.completedAt?.getTime();
      if (completedAt && now - completedAt > maxAge) {
        this.states.delete(buildId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} old builds`);
    }

    return cleaned;
  }
}
