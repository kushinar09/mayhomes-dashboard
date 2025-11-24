import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Bitrix24Service } from './bitrix24.service';

@Module({
  imports: [ConfigModule],
  providers: [Bitrix24Service],
  exports: [Bitrix24Service],
})
export class Bitrix24Module {}
