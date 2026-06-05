import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { configuration } from './config/configuration.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { HealthModule } from './health/health.module.js'
import { ReportsModule } from './reports/reports.module.js'
import { AuthModule } from './auth/auth.module.js'
import { SchoolsModule } from './schools/schools.module.js'

@Module({
  imports: [
    // envFilePath lets native `nest start` (cwd = apps/api) load the monorepo
    // root .env. In Docker the vars arrive via compose env_file, so the file
    // need not exist there. Vars already in process.env take precedence (so an
    // exported DATABASE_URL override wins over the file's compose-internal one).
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    HealthModule,
    ReportsModule,
    AuthModule,
    SchoolsModule,
  ],
})
export class AppModule {}
