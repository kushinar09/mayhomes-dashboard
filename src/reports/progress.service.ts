import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface ProgressUpdate {
  stage: string;
  current: number;
  total: number;
  message: string;
  percentage: number;
  requestId?: string;
  result?: unknown;
}

@Injectable()
export class ProgressService {
  private progressSubjects = new Map<string, Subject<ProgressUpdate>>();

  getProgressStream(requestId: string): Subject<ProgressUpdate> {
    if (!this.progressSubjects.has(requestId)) {
      this.progressSubjects.set(requestId, new Subject<ProgressUpdate>());
    }
    return this.progressSubjects.get(requestId)!;
  }

  emitProgress(requestId: string, update: ProgressUpdate) {
    const subject = this.getProgressStream(requestId);
    subject.next({ ...update, requestId });
  }

  complete(requestId: string, result?: unknown) {
    const subject = this.progressSubjects.get(requestId);
    if (subject) {
      subject.next({
        stage: 'completed',
        current: 1,
        total: 1,
        message: 'Hoàn thành!',
        percentage: 100,
        requestId,
        result,
      });
      subject.complete();
      // Cleanup after a delay
      setTimeout(() => {
        this.progressSubjects.delete(requestId);
      }, 60000); // Cleanup after 1 minute
    }
  }

  error(requestId: string, error: Error) {
    const subject = this.progressSubjects.get(requestId);
    if (subject) {
      subject.error(error);
      setTimeout(() => {
        this.progressSubjects.delete(requestId);
      }, 60000);
    }
  }

  calculatePercentage(current: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  }
}

