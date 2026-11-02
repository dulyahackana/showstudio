// Design review: capture every screen of an isolated stack (:5273). Usage: bun shots.tmp.mjs <outdir> [only]
import { chromium } from '@playwright/test'
const out = process.argv[2]
const only = process.argv[3]
const base = 'http://localhost:5273'
const api = 'http://localhost:4400/api/v1'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
const shot = async (name, settle = 900) => {
  if (only && !only.split(',').some((o) => name.includes(o))) return
  await page.waitForTimeout(settle)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log('shot', name)
}
const go = async (path, name, settle) => {
  if (only && !only.split(',').some((o) => name.includes(o))) return
  await page.goto(base + path)
  await shot(name, settle)
}
await page.goto(base + '/')
await shot('00-login', 600)
await page.getByTestId('login-alice').click()
await page.waitForSelector('[data-testid=user-menu]')
await shot('01-overview')
await go('/characters', '02-characters')
await go('/characters/dragon', '03-character', 2200)
await go('/environments', '04-environments')
await go('/environments/dragons-lair', '05-environment', 2200)
await go('/shows', '06-shows')
await go('/shows/dragon-awakens', '07-show', 2200)
if (!only || '08-behaviors'.includes(only)) {
  await page.goto(base + '/shows/dragon-awakens'); await page.waitForTimeout(1500)
  await page.getByTestId('tab-behaviors').click(); await shot('08-behaviors')
}
await go('/assets', '09-assets')
// Operator flow through the API so fleet/operator screens show live state.
const token = (await (await fetch(`${api}/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'olga', roles: ['operator', 'engineer'] }) })).json()).token
const post = (p, b) => fetch(api + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(b) }).then((r) => r.json())
await go('/fleet?env=dragons-lair', '10-fleet-idle', 1500)
await post('/fleet/deployments', { showId: 'dragon-awakens', revision: 1 })
await post('/fleet/deployments', { showId: 'night-watch', revision: 1 })
await page.waitForTimeout(2500)
await go('/fleet?env=dragons-lair', '11-fleet-ready', 1500)
await go('/operator?env=dragons-lair', '12-operator-ready', 1500)
await post('/fleet/launch', { showId: 'dragon-awakens', revision: 1, zoneClearConfirmed: true })
await page.waitForTimeout(6000)
await post('/fleet/sensors/door/simulate', { environmentId: 'dragons-lair', event: 'enter' })
await go('/operator?env=dragons-lair', '13-operator-running', 2500)
await post('/fleet/stop', { environmentId: 'dragons-lair' })
await go('/audit', '14-audit')
await go('/projects/dragons-hoard', '15-project')
if (!only || only.split(',').some((o) => '16-env-gizmo'.includes(o))) {
  await page.goto(base + '/environments/dragons-lair'); await page.waitForTimeout(1800)
  await page.getByText('dragon-01', { exact: true }).first().click(); await page.waitForTimeout(800)
  await shot('16-env-gizmo', 600)
  await page.getByText('light-01', { exact: true }).first().click().catch(() => {})
}
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no console errors')
await browser.close()
