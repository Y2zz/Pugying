import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ArrayUnique } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TOUTIAO_ARTICLE_DECLARATIONS, type ArticleAccountSettings, type ToutiaoArticleDeclaration } from '../../domain/article-settings';

export class ArticleAccountSettingsDto implements ArticleAccountSettings {
  @ApiPropertyOptional({ enum: ['single', 'triple', 'none'] })
  @IsOptional()
  @IsIn(['single', 'triple', 'none'])
  coverMode?: 'single' | 'triple' | 'none';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  customCover?: boolean;

  @ApiPropertyOptional({ description: '抖音文章摘要' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  summary?: string;

  @ApiPropertyOptional({ enum: ['open', 'closed', 'selected'] })
  @IsOptional()
  @IsIn(['open', 'closed', 'selected'])
  comments?: 'open' | 'closed' | 'selected';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  original?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  advertisement?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  exclusive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowReward?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  syncToMicroPost?: boolean;

  @ApiPropertyOptional({ enum: TOUTIAO_ARTICLE_DECLARATIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...TOUTIAO_ARTICLE_DECLARATIONS], { each: true })
  declarations?: ToutiaoArticleDeclaration[];
}
