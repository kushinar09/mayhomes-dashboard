import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { FacebookModule } from '../facebook/facebook.module';
import { LeadsModule } from '../leads/leads.module';
import { Bitrix24Module } from '../bitrix24/bitrix24.module';

@Module({
  imports: [FacebookModule, LeadsModule, Bitrix24Module],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

