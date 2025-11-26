import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { Bitrix24Module } from '../bitrix24/bitrix24.module';

@Module({
  imports: [Bitrix24Module],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}

