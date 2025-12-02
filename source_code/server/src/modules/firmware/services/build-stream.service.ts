import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable, merge, from, interval } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';
import { BuildEvent } from '../dto/build-event.dto';

export interface SseMessage {
  data: unknown;
  id?: string;
  type?: string;
  retry?: number;
}

@Injectable()
export class BuildStreamService {
  private readonly logger = new Logger(BuildStreamService.name);

  private buildStreams = new Map<string, Subject<BuildEvent>>();
  private eventHistory = new Map<string, Array<BuildEvent & { id: number }>>();
  private eventIdCounter = new Map<string, number>();

  getBuildStream(buildId: string, lastEventId?: number): Observable<SseMessage> {
    let subject = this.buildStreams.get(buildId);
    if (!subject) {
      subject = new Subject<BuildEvent>();
      this.buildStreams.set(buildId, subject);
      this.eventIdCounter.set(buildId, 0);
      this.logger.log(`Created new stream for build: ${buildId}`);
    }

    const replayEvents = this.getEventsAfter(buildId, lastEventId);
    const heartbeat$ = interval(15000).pipe(map(() => this.createHeartbeatEvent()));

    return merge(from(replayEvents), subject.asObservable(), heartbeat$).pipe(
      map((event) => this.toSseMessage(buildId, event)),
      takeWhile((message) => !this.isFinalEvent(message.type || ''), true),
    );
  }

  emitBuildEvent(buildId: string, event: BuildEvent): void {
    let subject = this.buildStreams.get(buildId);
    if (!subject) {
      this.logger.warn(`No active stream for build: ${buildId}, creating one`);
      subject = new Subject<BuildEvent>();
      this.buildStreams.set(buildId, subject);
      this.eventIdCounter.set(buildId, 0);
    }

    const eventId = this.incrementEventId(buildId);
    const fullEvent = { ...event, id: eventId };

    this.addToHistory(buildId, fullEvent);
    subject.next(event);

    if (this.isFinalEvent(event.event)) {
      this.logger.log(`Final event received for build: ${buildId}, scheduling cleanup`);
      setTimeout(() => this.closeBuildStream(buildId), 30000);
    }
  }

  closeBuildStream(buildId: string): void {
    const subject = this.buildStreams.get(buildId);
    if (subject) {
      subject.complete();
      this.buildStreams.delete(buildId);
      this.logger.log(`Closed stream for build: ${buildId}`);
    }

    setTimeout(() => {
      this.eventHistory.delete(buildId);
      this.eventIdCounter.delete(buildId);
    }, 3600000);
  }

  private getEventsAfter(buildId: string, eventId?: number): Array<BuildEvent & { id: number }> {
    if (eventId === undefined) {
      return [];
    }

    const history = this.eventHistory.get(buildId) || [];
    return history.filter((e) => e.id > eventId);
  }

  private addToHistory(buildId: string, event: BuildEvent & { id: number }): void {
    let history = this.eventHistory.get(buildId);
    if (!history) {
      history = [];
      this.eventHistory.set(buildId, history);
    }

    history.push(event);

    if (history.length > 100) {
      history.shift();
    }
  }

  private incrementEventId(buildId: string): number {
    const current = this.eventIdCounter.get(buildId) || 0;
    const next = current + 1;
    this.eventIdCounter.set(buildId, next);
    return next;
  }

  private isFinalEvent(eventType: string): boolean {
    return ['build_complete', 'error', 'build_cancelled'].includes(eventType);
  }

  private createHeartbeatEvent(): BuildEvent {
    return {
      event: 'heartbeat',
      data: {
        timestamp: new Date().toISOString(),
        activeBuilds: this.buildStreams.size,
      },
    };
  }

  private toSseMessage(buildId: string, event: BuildEvent): SseMessage {
    const eventId = (event as BuildEvent & { id?: number }).id;

    return {
      data: event.data,
      type: event.event,
      id: eventId !== undefined ? String(eventId) : undefined,
      retry: 10000,
    };
  }
}
