/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';
import * as hbs from 'hbs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable validation pipe với transform
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      whitelist: true,
    }),
  );

  // Cấu hình HBS view engine
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');

  // Đăng ký Handlebars helpers
  hbs.registerHelper('formatDate', (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateString;
    }
  });

  hbs.registerHelper(
    'buildLeadPaginationUrl',
    (
      page: number,
      filters: {
        dateFrom?: string;
        dateTo?: string;
        statusId?: string;
        sourceId?: string;
        search?: string;
      },
      sort?: { sortBy?: string; sortOrder?: string },
    ) => {
      const params = new URLSearchParams();
      params.set('page', page.toString());

      if (filters?.dateFrom) params.set('dateFrom', String(filters.dateFrom));
      if (filters?.dateTo) params.set('dateTo', String(filters.dateTo));
      if (filters?.statusId) params.set('statusId', String(filters.statusId));
      if (filters?.sourceId) params.set('sourceId', String(filters.sourceId));
      if (filters?.search) params.set('search', String(filters.search));

      if (sort?.sortBy) params.set('sortBy', String(sort.sortBy));
      if (sort?.sortOrder) params.set('sortOrder', String(sort.sortOrder));

      return `/leads?${params.toString()}`;
    },
  );

  hbs.registerHelper(
    'buildLeadSortUrl',
    (
      sortBy: string,
      currentSort: { sortBy: string; sortOrder: string },
      filters: {
        dateFrom?: string;
        dateTo?: string;
        statusId?: string;
        sourceId?: string;
        search?: string;
      },
    ) => {
      const params = new URLSearchParams();

      // Toggle sort order nếu đang sort cùng cột
      const currentSortBy = currentSort?.sortBy;
      const currentSortOrder = currentSort?.sortOrder?.toUpperCase();

      if (currentSortBy === sortBy) {
        // Nếu đang sort cùng cột, toggle order
        params.set('sortOrder', currentSortOrder === 'ASC' ? 'DESC' : 'ASC');
      } else {
        // Nếu click cột khác, mặc định ASC
        params.set('sortOrder', 'ASC');
      }
      params.set('sortBy', sortBy);

      if (filters?.dateFrom) params.set('dateFrom', String(filters.dateFrom));
      if (filters?.dateTo) params.set('dateTo', String(filters.dateTo));
      if (filters?.statusId) params.set('statusId', String(filters.statusId));
      if (filters?.sourceId) params.set('sourceId', String(filters.sourceId));
      if (filters?.search) params.set('search', String(filters.search));

      return `/leads?${params.toString()}`;
    },
  );

  hbs.registerHelper(
    'getPaginationPages',
    (currentPage: number, totalPages: number) => {
      if (totalPages <= 0) return { pages: [], showInput: false };

      // Nếu <= 10 trang, hiển thị tất cả
      if (totalPages <= 10) {
        return {
          pages: Array.from({ length: totalPages }, (_, i) => i + 1),
          showInput: false,
        };
      }

      const pages: Array<number | 'ellipsis'> = [];
      const showInput = true;

      // Luôn hiển thị trang 1 và 2
      pages.push(1);
      pages.push(2);

      // Tính toán vùng hiển thị xung quanh trang hiện tại
      const startAround = Math.max(3, currentPage - 2);
      const endAround = Math.min(totalPages - 2, currentPage + 2);

      // Nếu có khoảng trống giữa trang 2 và vùng xung quanh, thêm ellipsis
      if (startAround > 3) {
        pages.push('ellipsis');
      }

      // Thêm các trang xung quanh trang hiện tại (trừ trang 1, 2 và 2 trang cuối)
      for (let i = startAround; i <= endAround; i++) {
        if (i > 2 && i < totalPages - 1) {
          pages.push(i);
        }
      }

      // Nếu có khoảng trống giữa vùng xung quanh và 2 trang cuối, thêm ellipsis
      if (endAround < totalPages - 3) {
        pages.push('ellipsis');
      }

      // Luôn hiển thị 2 trang cuối
      if (totalPages > 1) {
        pages.push(totalPages - 1);
      }
      pages.push(totalPages);

      return { pages, showInput };
    },
  );

  hbs.registerHelper('isCurrentPage', (page: number, currentPage: number) => {
    return page === currentPage;
  });

  hbs.registerHelper('gt', (a: number, b: number) => {
    return a > b;
  });

  hbs.registerHelper('add', (a: number, b: number) => {
    return a + b;
  });

  hbs.registerHelper('subtract', (a: number, b: number) => {
    return a - b;
  });

  hbs.registerHelper('eq', (a: unknown, b: unknown) => {
    return a === b;
  });

  hbs.registerHelper('ne', (a: unknown, b: unknown) => {
    return a !== b;
  });

  hbs.registerHelper('and', (a: unknown, b: unknown) => {
    return a && b;
  });

  hbs.registerHelper('or', (a: unknown, b: unknown) => {
    return a || b;
  });

  hbs.registerHelper('not', (a: unknown) => {
    return !a;
  });

  hbs.registerHelper('lookup', (obj: Record<string, unknown>, key: string) => {
    return obj?.[key];
  });

  hbs.registerHelper('isNumeric', (value: unknown) => {
    if (value === null || value === undefined || value === '') return false;
    return !isNaN(Number(value));
  });

  hbs.registerHelper('formatNumber', (value: unknown) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('vi-VN');
  });

  hbs.registerHelper(
    'getSortIcon',
    (sortBy: string, currentSort: { sortBy: string; sortOrder: string }) => {
      if (!currentSort || currentSort.sortBy !== sortBy) {
        return '<i class="bi bi-arrow-down-up text-muted"></i>';
      }
      const sortOrder = currentSort.sortOrder?.toUpperCase();
      if (sortOrder === 'ASC') {
        return '<i class="bi bi-arrow-up"></i>';
      }
      return '<i class="bi bi-arrow-down"></i>';
    },
  );

  hbs.registerHelper(
    'buildReportSortUrl',
    (
      sortBy: string,
      currentSort: { sortBy: string; sortOrder: string },
      reportType: 'campaigns' | 'simple' = 'campaigns',
    ) => {
      const params = new URLSearchParams();

      // Toggle sort order nếu đang sort cùng cột
      const currentSortBy = currentSort?.sortBy;
      const currentSortOrder = currentSort?.sortOrder?.toUpperCase();

      if (currentSortBy === sortBy) {
        // Nếu đang sort cùng cột, toggle order
        params.set('sortOrder', currentSortOrder === 'ASC' ? 'DESC' : 'ASC');
      } else {
        // Nếu click cột khác, mặc định ASC
        params.set('sortOrder', 'ASC');
      }
      params.set('sortBy', sortBy);

      return `/reports/${reportType}?${params.toString()}`;
    },
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
