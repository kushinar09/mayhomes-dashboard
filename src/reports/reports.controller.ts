import { Controller, Get, Render } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Render('reports/campaigns')
  async index() {
    try {
      const data = await this.reportsService.getAdsReport();
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
      return {
        title: 'Facebook Ads Report',
        data,
        columns,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        title: 'Facebook Ads Report',
        data: [],
        columns: [],
        error: errorMessage,
      };
    }
  }
}
