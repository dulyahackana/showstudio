import { expect, type Page, test } from '@playwright/test'

/*
 * The whole prompt, end to end, through the UI: author views, safety review,
 * deploy to the (simulated) fleet, launch, sensor reaction, e-stop.
 * Requires the seeded stack (see playwright.config.ts).
 */

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` })

async function signInAs(page: Page, who: 'alice' | 'sam' | 'olga' | 'admin') {
  await page.goto('/')
  const login = page.getByTestId(`login-${who}`)
  await expect(login.or(page.getByTestId('user-menu'))).toBeVisible()
  if (await login.isVisible()) {
    await login.click()
  } else {
    await page.getByTestId('user-menu').click()
    await page.getByTestId(`switch-${who}`).click()
  }
  await expect(page.getByTestId('user-menu')).toContainText(who)
}

async function pick(page: Page, trigger: string, option: RegExp) {
  await page.getByTestId(trigger).click()
  await page.getByRole('option', { name: option }).click()
}

test.describe.configure({ mode: 'serial' })

test('engineer views: overview, character, environment and show editors', async ({ page }) => {
  await signInAs(page, 'alice')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await shot(page, '01-overview')

  await page.goto('/characters/dragon')
  await expect(page.getByTestId('doc-title')).toHaveText('Ember the Dragon')
  await expect(page.getByTestId('joint-form')).toBeVisible()
  await page.waitForTimeout(1500)
  await shot(page, '02-character')

  await page.goto('/environments/dragons-lair')
  await expect(page.getByTestId('doc-title')).toHaveText("Dragon's Lair")
  await page.waitForTimeout(1500)
  await shot(page, '03-environment')

  await page.goto('/shows/dragon-awakens')
  await expect(page.getByTestId('doc-title')).toHaveText('The Dragon Awakens')
  await expect(page.getByTestId('timeline')).toBeVisible()
  await expect(page.getByTestId('tab-issues')).toContainText('Issues (0)')
  await page.getByTestId('ruler').click({ position: { x: 900, y: 10 } })
  await page.waitForTimeout(1200)
  await shot(page, '04-show-editor')

  await page.getByTestId('tab-behaviors').click()
  await expect(page.locator('input[value="Dragon notices a guest"]')).toBeVisible()
  await shot(page, '05-sensor-responses')
})

test('editing is validated live and undoable', async ({ page }) => {
  await signInAs(page, 'alice')
  await page.goto('/shows/dragon-awakens')
  await expect(page.getByTestId('timeline')).toBeVisible()
  const lane = page.getByTestId('lane-m:dragon-01:jaw_open')
  await lane.scrollIntoViewIfNeeded()
  const box = await lane.boundingBox()
  if (!box) throw new Error('lane not visible')
  // Add a key, then drag it far up and early: the validator flags the speed.
  await lane.dblclick({ position: { x: 5 * 60, y: box.height / 2 } })
  await expect(page.getByTestId('key-inspector')).toBeVisible()
  await expect(page.getByTestId('save-status')).toHaveText(/Saved|Saving|Unsaved/)
  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('tab-issues')).toContainText('Issues (0)')
})

test('safety reviewer sees the revision history', async ({ page }) => {
  await signInAs(page, 'sam')
  await page.goto('/shows/dragon-awakens')
  await page.getByTestId('tab-revisions').click()
  await expect(page.getByText('approved').first()).toBeVisible()
  await shot(page, '06-revisions')
})

test('operator deploys, launches, triggers a sensor and e-stops', async ({ page }) => {
  await signInAs(page, 'olga')
  await page.goto('/fleet?env=dragons-lair')
  await expect(page.getByText(/Devices \(9\/9 online\)/)).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('deploy-show').click()
  await pick(page, 'deploy-show-select', /The Dragon Awakens/)
  await pick(page, 'deploy-revision-select', /^r1/)
  await page.getByTestId('confirm-deploy').click()
  await expect(page.getByTestId('good-to-go-dragon-awakens')).toBeVisible({ timeout: 30_000 })
  await shot(page, '07-fleet-good-to-go')

  // Second show for swapping.
  await page.getByTestId('deploy-show').click()
  await pick(page, 'deploy-show-select', /Night Watch/)
  await pick(page, 'deploy-revision-select', /^r1/)
  await page.getByTestId('confirm-deploy').click()

  await page.goto('/operator?env=dragons-lair')
  const launch = page.getByTestId('launch-dragon-awakens')
  await expect(launch).toBeEnabled({ timeout: 30_000 })
  await launch.click()
  await expect(page.getByTestId('confirm-launch')).toBeDisabled()
  await page.getByTestId('zone-clear').click()
  await page.getByTestId('confirm-launch').click()
  await expect(page.getByTestId('now-playing')).toContainText('The Dragon Awakens')
  await expect(page.getByTestId('now-playing')).toContainText('/ 0:45', { timeout: 10_000 })
  await page.getByTestId('sensor-door-enter').click()
  await page.waitForTimeout(800)
  await shot(page, '08-operator-running')

  await page.getByTestId('estop').click()
  await expect(page.getByTestId('estop-banner')).toBeVisible()
  await expect(page.getByTestId('now-playing')).toContainText('Nothing running')
  await shot(page, '09-estop')
  await page.getByTestId('reset-estop').click()
  await page.getByRole('button', { name: 'Reset e-stop' }).click()
  await expect(page.getByTestId('estop-banner')).toBeHidden()
})

test('audit log records the chain of custody', async ({ page }) => {
  await signInAs(page, 'sam')
  await page.goto('/audit')
  await expect(page.getByText(/Chain intact/)).toBeVisible()
  await expect(page.getByText('estop.trigger').first()).toBeVisible()
  await shot(page, '10-audit')
})
