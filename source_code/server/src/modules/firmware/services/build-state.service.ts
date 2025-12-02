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

  getAllStates(): BuildState[] {
    return Array.from(this.states.values());
  }
}
