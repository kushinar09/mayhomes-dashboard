import { IsOptional, IsString, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class ReportFilterDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'], { message: 'sortOrder must be ASC or DESC' })
  @Transform(({ value }) => value?.toUpperCase())
  sortOrder?: 'ASC' | 'DESC';
}

