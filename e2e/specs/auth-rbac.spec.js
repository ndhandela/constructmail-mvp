// Auth & RBAC: invite-only signup (already exercised by global-setup for
// every spec — this file adds the pieces not covered elsewhere), session
// boundaries, and the GC-owner "restrict a teammate to one module" flow.
const { test, expect } = require('@playwright/test');
const { loadFixtures } = require('../helpers/fixtures');
const { loginAndReachDashboard, login, completeRoleOnboardingIfPresent } = require('../helpers/uiActions');
const { testEmail } = require('../helpers/testTag');
const db = require('../helpers/db');

let fixtures;
test.beforeAll(() => { fixtures = loadFixtures(); });
test.afterAll(async () => { await db.closePool(); });

test.describe('Auth', () => {
  test('login is rejected without exposing whether the account exists', async ({ page }) => {
    await login(page, fixtures.full.ownerEmail, 'definitely-wrong-password');
    await expect(page.getByText('Invalid email or password.')).toBeVisible();
  });

  test('an unauthenticated visit to a module route redirects to login, never renders the app shell', async ({ page }) => {
    await page.goto('/capital');
    await expect(page.getByPlaceholder('john@yourcompany.com')).toBeVisible();
  });
});

test.describe('RBAC — team member scoped to one module', () => {
  test('a teammate restricted to Invoices only cannot reach other modules', async ({ page }) => {
    const memberEmail = testEmail('rbac_spec_restricted_member');

    await loginAndReachDashboard(page, {
      email: fixtures.full.ownerEmail,
      password: fixtures.full.password,
      projectName: 'E2E RBAC Project',
    });
    await page.goto('/company-settings');
    await page.getByRole('button', { name: 'Team' }).click();
    await page.getByPlaceholder('Jane Doe').fill('E2E Spec Restricted Member');
    await page.getByPlaceholder('teammate@company.com').fill(memberEmail);
    await page.getByText(/Restrict this teammate to Invoices only/i).click();
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText(`Invite sent to ${memberEmail}.`)).toBeVisible();

    const user = await db.getUserByEmail(memberEmail);
    expect(user.restricted_module).toBe('invoice_tracker');

    const inviteToken = await db.getInviteToken(memberEmail);
    const memberContext = await page.context().browser().newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/accept-invite?token=${inviteToken}`);
    await memberPage.getByPlaceholder('Min. 8 characters').fill('E2eRestrictedMember!2026');
    await memberPage.getByPlaceholder('Repeat password').fill('E2eRestrictedMember!2026');
    await memberPage.getByRole('button', { name: 'Set Password' }).click();
    await memberPage.getByRole('link', { name: 'Sign in now' }).click();
    await login(memberPage, memberEmail, 'E2eRestrictedMember!2026');
    await completeRoleOnboardingIfPresent(memberPage); // first login for this account — same one-time prompt every account gets

    // Sidebar.js explicitly does filter by `restricted_module` (unlike the
    // lead-account case in daily-logs.spec.js) — this should actually
    // hide everything except Invoices.
    await expect(memberPage.getByRole('button', { name: 'Invoices' })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'Capital Tracker' })).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: 'Documents' })).toHaveCount(0);

    await memberContext.close();
  });

  // KNOWN BUG (see BUG REPORT: "Team invite race — no project access if
  // submitted before the project list loads"): CompanyTeamSection.js
  // fetches the company's projects on mount and only checks all of them
  // into `selectedInviteProjectIds` once that fetch resolves; submitting
  // the invite form before it resolves sends `projectIds: []` with no
  // warning, silently leaving the new teammate with zero project_members
  // rows — they land on a permanent "Your company owner hasn't created a
  // project yet" dead end despite a project existing. Found by hitting it
  // organically during manual testing (filling and submitting the form
  // quickly); the race is inherently timing-dependent, so this test
  // forces it deterministically by delaying the
  // GET /api/projects/company/:id response rather than hoping a plain
  // fast `click()` outpaces it. Recoverable by the owner via each
  // member's "Edit project access" pencil icon afterward, so this is
  // Medium, not High, severity.
  test('inviting a teammate before the project list loads should not silently grant zero project access', async ({ page }) => {
    test.fail();
    const memberEmail = testEmail('rbac_spec_race_member');

    await loginAndReachDashboard(page, {
      email: fixtures.full.ownerEmail,
      password: fixtures.full.password,
      projectName: 'E2E RBAC Project',
    });
    await page.goto('/company-settings');

    await page.route('**/api/projects/company/**', async (route) => {
      await new Promise((r) => setTimeout(r, 4000)); // outlast a normal click-through
      await route.continue();
    });
    await page.getByRole('button', { name: 'Team' }).click();
    await page.getByPlaceholder('Jane Doe').fill('E2E Spec Race Member');
    await page.getByPlaceholder('teammate@company.com').fill(memberEmail);
    await page.getByRole('button', { name: 'Send invite' }).click(); // fires before the delayed project list resolves
    await expect(page.getByText(`Invite sent to ${memberEmail}.`)).toBeVisible();

    const user = await db.getUserByEmail(memberEmail);
    const { rows } = await db.query('SELECT * FROM project_members WHERE user_id = $1', [user.id]);
    expect(rows.length).toBeGreaterThan(0); // fails today — comes back empty
  });
});
