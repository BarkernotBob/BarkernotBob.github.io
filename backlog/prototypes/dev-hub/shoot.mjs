// PROTOTYPE: screenshot notes in the isolated Obsidian (port 9339).
// usage: G=$(npm root -g) node shoot.mjs <desktop|phone> <outdir> <note-path> [<note-path> ...]
import { createRequire } from 'module';
const { chromium } = createRequire(process.env.G + '/')('playwright-core');
const [mode, outdir, ...notes] = process.argv.slice(2);
const phone = mode === 'phone';
const b = await chromium.connectOverCDP('http://localhost:9339');
const find = () => b.contexts()[0].pages().find(p => p.url().includes('index.html'));
let page = find();
if (await page.evaluate(ph => app.isMobile !== ph, phone)) {
  page.evaluate(ph => app.emulateMobile(ph), phone).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));
  page = find();
  await page.waitForFunction(() => window.app?.workspace?.layoutReady, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
}
await page.evaluate(async (phone) => {
  require('@electron/remote').getCurrentWindow().setContentSize(phone ? 390 : 1400, phone ? 844 : 1000);
  app.workspace.leftSplit?.collapse(); app.workspace.rightSplit?.collapse();
}, phone);
for (const note of notes) {
  await page.evaluate(async (note) => {
    const f = app.vault.getAbstractFileByPath(note);
    if (!f) throw new Error('missing ' + note);
    await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'preview' } });
  }, note);
  await page.waitForTimeout(2500);
  if (process.env.SHOOT_JS) { await page.evaluate(process.env.SHOOT_JS); await page.waitForTimeout(800); }
  const name = note.replace(/^Dev Hub prototype\//, '').replace(/[\/ ]+/g, '_').replace(/\.md$/, '') + (process.env.SUFFIX ?? '');
  await page.screenshot({ path: `${outdir}/${mode}-${name}.png` });
  console.log(`${outdir}/${mode}-${name}.png`);
}
await b.close();
