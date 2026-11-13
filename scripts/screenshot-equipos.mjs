// Screenshot helper for verifying the equipos table layout.
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:3000/'
const OUT = '/home/z/my-project/upload/equipos-screenshot.png'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1483, height: 900 },
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('PAGE ERR:', m.text())
  })
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  // Give client components time to fetch
  await page.waitForTimeout(2500)
  // Try to click into Equipos view if there's a nav
  try {
    const link = page.locator('text=Equipos').first()
    if (await link.count() > 0) {
      await link.click({ timeout: 2000 })
      await page.waitForTimeout(2500)
    }
  } catch {}
  await page.screenshot({ path: OUT, fullPage: false })
  console.log('Saved:', OUT)
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
