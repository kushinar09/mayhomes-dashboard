import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports: [FacebookModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

