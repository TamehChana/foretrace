import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateGitHubConnectionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(256)
  @Matches(/^[\w.-]+\/[\w.-]+$/, {
    message: 'Use owner/repo (GitHub repository full name)',
  })
  repositoryFullName!: string;
}
