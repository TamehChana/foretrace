import { IsString, MinLength } from 'class-validator';

/** Fine-grained PAT or classic PAT with `repo` (and `read:org` if using search API). */
export class SetGithubPatDto {
  @IsString()
  @MinLength(10, { message: 'Token looks too short' })
  pat!: string;
}
