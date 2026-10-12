// PROTOTYPE: turn on community plugins in the isolated Obsidian (port 9339).
import { createRequire } from 'module';
const { chromium } = createRequire(process.env.G + '/')('playwright-core');
const b = await chromium.connectOverCDP('http://localhost:9339');
const page = b.contexts()[0].pages().find(p => p.url().includes('index.html'));
console.log(await page.evaluate(async () => {
  await app.plugins.setEnable(true);
  for (const id of ['dataview', 'obsidian-meta-bind-plugin']) await app.plugins.enablePluginAndSave(id);
  return Object.keys(app.plugins.plugins);
}));
await b.close();
