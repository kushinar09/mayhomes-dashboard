import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Bitrix24Module } from '../bitrix24/bitrix24.module';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports: [Bitrix24Module, FacebookModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

