import './bootstrap-env.js' // MUST be first: assembles DATABASE_URL + enforces TLS before config/Prisma read env
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { readFileSync } from 'node:fs'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  // rawBody:true makes Nest's express adapter retain the RAW request buffer on
  // req.rawBody (in ADDITION to the parsed JSON on req.body). The Stripe webhook
  // controller verifies the signature against req.rawBody, so every other route
  // keeps normal JSON parsing untouched and we avoid a direct `express` import
  // (express is only a transitive dep of @nestjs/platform-express).
  // Strict end-to-end TLS: when the entrypoint provides a cert (ENABLE_TLS in
  // prod → self-signed, generated in start.sh), serve HTTPS so the ALB→task hop
  // inside the VPC is encrypted too. The ALB does not validate the backend cert
  // (encryption-only). No cert → plain HTTP (local dev / docker-compose).
  const httpsKey = process.env.HTTPS_KEY_FILE
  const httpsCert = process.env.HTTPS_CERT_FILE
  const httpsOptions =
    httpsKey && httpsCert
      ? { key: readFileSync(httpsKey), cert: readFileSync(httpsCert) }
      : undefined

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    ...(httpsOptions ? { httpsOptions } : {}),
  })

  // Raise the JSON body limit above the ~100kb express default so the board-report
  // logo upload (base64 data URL, guarded to 5MB decoded in SchoolsService → ~7MB
  // base64) is gated by that friendly 400 check rather than a generic 413 from the
  // parser. 8mb leaves headroom for the data-URL expansion + the rest of the body.
  app.useBodyParser('json', { limit: '8mb' })
  app.useBodyParser('urlencoded', { limit: '8mb', extended: true })

  // Behind CloudFront + ALB — trust EXACTLY the proxy-chain hop count so req.ip is
  // the real client from X-Forwarded-For and a client-INJECTED XFF entry (to the
  // left of the trusted hops) is ignored. `true` would trust the spoofable
  // leftmost entry, defeating the per-IP auth throttle. Default 2 (CloudFront+ALB);
  // override via TRUST_PROXY_HOPS if the chain differs. The edge AWS WAF rate rule
  // remains the primary IP defense; this is defense-in-depth.
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS ?? '2', 10))

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
  console.log(
    `[api] listening on :${port} (${httpsOptions ? 'HTTPS' : 'HTTP'}, cors origin ${webOrigin})`,
  )
}

void bootstrap()
