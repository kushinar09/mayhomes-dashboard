import { Controller, Get, Render, Res, Sse, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { ProgressService, ProgressUpdate } from './progress.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly progressService: ProgressService,
  ) {}

  @Get()
  @Render('reports/campaigns')
  async index() {
    try {
      const data = await this.reportsService.getAdsReport();
      const summaryData = await this.reportsService.getNameSpendSummary();
      // Lọc bỏ cột ID nếu có, và đảm bảo Campaign ID ở đầu
      const allColumns =
        data.length > 0 ? Object.keys(data[0]) : [];
      const columns = allColumns
        .filter((col) => col !== 'ID')
        .sort((a, b) => {
          // Đưa Campaign ID lên đầu
          if (a === 'Campaign ID') return -1;
          if (b === 'Campaign ID') return 1;
          return 0;
        });
      const summaryColumns =
        summaryData.length > 0 ? Object.keys(summaryData[0]) : [];
      return {
        data,
        columns,
        summaryData,
        summaryColumns,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        data: [],
        columns: [],
        summaryData: [],
        summaryColumns: [],
        error: errorMessage,
      };
    }
  }

  @Get('lead-campaign')
  @Render('reports/lead-campaign')
  async getLeadCampaignReport() {
    // Chỉ render template rỗng, dữ liệu sẽ được load từ API
    return {};
  }

  @Sse('lead-campaign/progress/:requestId')
  getLeadCampaignProgress(@Param('requestId') requestId: string): Observable<MessageEvent> {
    const progressStream = this.progressService.getProgressStream(requestId);
    
    return new Observable((observer) => {
      const subscription = progressStream.subscribe(
        (update: ProgressUpdate) => {
          observer.next({
            data: JSON.stringify(update),
          } as MessageEvent);
        },
        (error) => {
          observer.error(error);
        },
        () => {
          observer.complete();
        },
      );

      // Cleanup subscription khi client disconnect
      return () => {
        subscription.unsubscribe();
      };
    });
  }

  @Get('lead-campaign/api')
  @HttpCode(HttpStatus.OK)
  async getLeadCampaignReportApi() {
    // Generate unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Start processing in background
    setImmediate(async () => {
      try {
        const progressCallback = (update: ProgressUpdate) => {
          this.progressService.emitProgress(requestId, update);
        };

        const result = await this.reportsService.getLeadCampaignReport(progressCallback, requestId);
        
        const table1Columns =
          result.table1.length > 0 ? Object.keys(result.table1[0]) : [];
        const table2Columns =
          result.table2.length > 0 ? Object.keys(result.table2[0]) : [];

        // Complete với result
        this.progressService.complete(requestId, {
          table1: result.table1,
          table1Columns,
          table2: result.table2,
          table2Columns,
          projects: result.projects,
          campaigns: result.campaigns,
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.progressService.error(requestId, new Error(errorMessage));
      }
    });

    // Return request ID immediately
    return {
      success: true,
      requestId,
      message: 'Processing started. Connect to SSE endpoint for progress updates.',
    };
  }

}
