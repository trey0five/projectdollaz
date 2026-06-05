import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  const config = app.get(ConfigService)
  const webOrigin = config.get<string>('webOrigin') ?? 'http://localhost:5173'
  const port = config.get<number>('port') ?? 8000

  app.enableCors({ origin: webOrigin, credentials: true })

  // No global prefix in 1A — /health is curled at the root.
  await app.listen(port, '0.0.0.0')
  console.log(`[api] listening on :${port} (cors origin ${webOrigin})`)
}

void bootstrap()
