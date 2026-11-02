import { chromium } from '@playwright/test'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 300)))
await p.goto('http://localhost:5273/'); await p.getByTestId('login-alice').click(); await p.waitForSelector('[data-testid=user-menu]')
await p.goto('http://localhost:5273/environments/dragons-lair'); await p.waitForTimeout(2500)
await p.screenshot({ path: process.argv[2] })
console.log(errs.join('\n') || 'no errors')
await b.close()
