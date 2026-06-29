import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  // rawBody:true makes Nest's express adapter retain the RAW request buffer on
  // req.rawBody (in ADDITION to the parsed JSON on req.body). The Stripe webhook
  // controller verifies the signature against req.rawBody, so every other route
  // keeps normal JSON parsing untouched and we avoid a direct `express` import
  // (express is only a transitive dep of @nestjs/platform-express).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  })

  // Raise the JSON body limit above the ~100kb express default so the board-report
  // logo upload (base64 data URL, guarded to 5MB decoded in SchoolsService → ~7MB
  // base64) is gated by that friendly 400 check rather than a generic 413 from the
  // parser. 8mb leaves headroom for the data-URL expansion + the rest of the body.
  app.useBodyParser('json', { limit: '8mb' })
  app.useBodyParser('urlencoded', { limit: '8mb', extended: true })

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
