// PROTOTYPE: eval JS in the isolated Obsidian. usage: node ev.mjs '<expr>'
import { createRequire } from 'module';
const { chromium } = createRequire(process.env.G + '/')('playwright-core');
const b = await chromium.connectOverCDP('http://localhost:9339');
const page = b.contexts()[0].pages().find(p => p.url().includes('index.html'));
console.log(JSON.stringify(await page.evaluate(`(async()=>{ ${process.argv[2]} })()`), null, 1));
await b.close();
