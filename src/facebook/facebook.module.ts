import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FacebookService } from './facebook.service';

@Module({
  imports: [ConfigModule],
  providers: [FacebookService],
  exports: [FacebookService],
})
export class FacebookModule {}
