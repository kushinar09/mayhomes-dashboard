import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { Bitrix24Module } from '../bitrix24/bitrix24.module';

@Module({
  imports: [Bitrix24Module],
  controllers: [DealsController],
  providers: [DealsService],
})
export class DealsModule {}
