import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { GithubModule } from './github/github.module';
import { ProjectsModule } from './projects/projects.module';
import { TerminalIngestModule } from './terminal/terminal-ingest.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    GithubModule,
    TerminalIngestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
