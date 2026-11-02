import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig()
const { app, close } = await buildApp(config)

if (config.DEV_LOGIN === 'on' && config.NODE_ENV === 'production') {
  app.log.warn('DEV_LOGIN is on in production: anyone can pick a role. Use only for demos.')
}

let closing = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return
    closing = true
    app.log.info({ signal }, 'shutting down')
    close()
      .then(() => process.exit(0))
      .catch((err) => {
        app.log.error({ err }, 'shutdown failed')
        process.exit(1)
      })
  })
}

await app.listen({ host: config.HOST, port: config.PORT })
