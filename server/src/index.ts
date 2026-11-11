import { buildApp } from './app.js';
import { config } from './config.js';

async function start() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST
    });
    console.log(`Server listening at ${address}`);
    console.log(`Active Timezone: ${config.TIMEZONE}`);
    console.log(`LLM Provider: ${config.LLM_PROVIDER}`);
    console.log(`Search Provider: ${config.SEARCH_PROVIDER}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
