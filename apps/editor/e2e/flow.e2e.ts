import { expect, type Page, test } from '@playwright/test'

/*
 * The whole prompt, end to end, through the UI, following a project's four steps:
 * animate, safety review, deploy to the (simulated) fleet, launch, sensor reaction,
 * e-stop. Requires the seeded stack (see playwright.config.ts).
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
  await expect(page.getByTestId('board-dragon-awakens')).toBeVisible()
  await expect(page.getByTestId('nav-project-lantern-night')).toBeVisible()
  await shot(page, '01-overview')

  await page.getByTestId('nav-project-dragon-awakens').click()
  await expect(page.getByTestId('home-step-deploy')).toBeVisible()
  await shot(page, '01b-project')

  await page.goto('/characters/dragon')
  await expect(page.getByTestId('doc-title')).toHaveText('Ember the Dragon')
  await expect(page.getByTestId('joint-form')).toBeVisible()
  await page.waitForTimeout(1500)
  await shot(page, '02-character')

  await page.goto('/environments/dragons-lair')
  await expect(page.getByTestId('doc-title')).toHaveText("The Dragon's Hoard")
  await page.waitForTimeout(1500)
  await shot(page, '03-environment')

  await page.goto('/projects/dragon-awakens')
  await page.getByTestId('step-animate').click()
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
  await page.goto('/projects/dragon-awakens/show')
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
  await page.goto('/projects/dragon-awakens/revisions')
  await expect(page.getByText('approved').first()).toBeVisible()
  await shot(page, '06-revisions')
})

test('operator deploys, launches, triggers a sensor and e-stops', async ({ page }) => {
  await signInAs(page, 'olga')
  // Projects are private to their team: Olga is not on the draft "Lantern Night".
  await expect(page.getByTestId('nav-project-dragon-awakens')).toBeVisible()
  await expect(page.getByTestId('nav-project-lantern-night')).toHaveCount(0)

  await page.goto('/projects/dragon-awakens/deploy')
  await expect(page.getByTestId('devices-online')).toHaveText(/13\/13 online/, { timeout: 30_000 })
  await pick(page, 'deploy-revision-select', /^r1/)
  await page.getByTestId('deploy-show').click()
  await expect(page.getByTestId('good-to-go-dragon-awakens').first()).toBeVisible({ timeout: 30_000 })
  await shot(page, '07-deploy-good-to-go')

  // Second show for swapping.
  await page.goto('/projects/night-watch/deploy')
  await expect(page.getByTestId('devices-online')).toHaveText(/13\/13 online/)
  await page.getByTestId('deploy-show').click()
  await expect(page.getByTestId('good-to-go-night-watch').first()).toBeVisible({ timeout: 30_000 })

  await page.goto('/projects/dragon-awakens/launch')
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

test('everyone only sees the actions their roles allow', async ({ page }) => {
  // Operator: the library and layouts are read-only, but deploying and launching are hers.
  await signInAs(page, 'olga')
  await page.goto('/characters')
  await expect(page.getByTestId('card-dragon')).toBeVisible()
  await expect(page.getByTestId('new-document')).toHaveCount(0)
  await expect(page.getByTestId('new-project')).toHaveCount(0)
  await page.goto('/characters/dragon')
  await expect(page.getByTestId('view-only')).toBeVisible()
  await expect(page.getByTestId('add-joint')).toHaveCount(0)
  await expect(page.getByTestId('publish')).toHaveCount(0)
  await page.goto('/projects/dragon-awakens/deploy')
  await expect(page.getByTestId('deploy-show')).toBeVisible()

  // Safety reviewer: can look at the timeline and the devices, but not change or run anything.
  await signInAs(page, 'sam')
  await page.goto('/projects/dragon-awakens/show')
  await expect(page.getByTestId('timeline')).toBeVisible()
  await expect(page.getByTestId('view-only')).toBeVisible()
  await expect(page.getByTestId('publish')).toHaveCount(0)
  await page.goto('/projects/dragon-awakens/deploy')
  await expect(page.getByTestId('devices-online')).toBeVisible()
  await expect(page.getByTestId('deploy-show')).toHaveCount(0)
  await page.goto('/projects/dragon-awakens/launch')
  await expect(page.getByTestId('prepared-dragon-awakens')).toBeVisible()
  await expect(page.getByTestId('launch-dragon-awakens')).toHaveCount(0)
  await expect(page.getByTestId('estop')).toBeVisible() // safety outranks access control
  await shot(page, '11-reviewer-control-room')
})

test('audit log records the chain of custody', async ({ page }) => {
  await signInAs(page, 'sam')
  await page.goto('/audit')
  await expect(page.getByText(/Chain intact/)).toBeVisible()
  await expect(page.getByText('estop.trigger').first()).toBeVisible()
  await shot(page, '10-audit')
})
