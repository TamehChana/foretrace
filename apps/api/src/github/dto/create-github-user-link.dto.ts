import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateGitHubUserLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(39)
  githubLogin!: string;

  @IsUUID()
  userId!: string;
}
