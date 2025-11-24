import { Controller, Get, Render, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/report-filter.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Render('reports/index')
  async index() {
    return {
      title: 'Facebook Insight Reports',
    };
  }

  @Get('campaigns')
  @Render('reports/campaigns')
  async getCampaignsReport(@Query() filterDto: ReportFilterDto) {
    try {
      const data = await this.reportsService.getCampaignReport(
        filterDto.sortBy,
        filterDto.sortOrder,
      );
      return {
        title: 'Campaign Report - Facebook Insight',
        data,
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        sort: {
          sortBy: filterDto.sortBy || 'Chi phí trung bình / Lead',
          sortOrder: filterDto.sortOrder || 'ASC',
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        title: 'Campaign Report - Facebook Insight',
        data: [],
        columns: [],
        sort: {
          sortBy: filterDto.sortBy || 'Chi phí trung bình / Lead',
          sortOrder: filterDto.sortOrder || 'ASC',
        },
        error: errorMessage,
      };
    }
  }

  @Get('simple')
  @Render('reports/simple')
  async getSimpleReport(@Query() filterDto: ReportFilterDto) {
    try {
      const data = await this.reportsService.getSimpleCampaignReport(
        filterDto.sortBy,
        filterDto.sortOrder,
      );
      return {
        title: 'Simple Campaign Report',
        data,
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        sort: {
          sortBy: filterDto.sortBy || 'lead_count',
          sortOrder: filterDto.sortOrder || 'DESC',
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        title: 'Simple Campaign Report',
        data: [],
        columns: [],
        sort: {
          sortBy: filterDto.sortBy || 'lead_count',
          sortOrder: filterDto.sortOrder || 'DESC',
        },
        error: errorMessage,
      };
    }
  }
}

