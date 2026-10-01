// Quick diagnostic: verify login page renders and identify selector issues
import { createRequire } from 'module';
import { TEST_USER, TEST_PASS, BASE_URL } from './test-config.mjs';
const require = createRequire(import.meta.url);
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  const { execSync } = require('child_process');
  const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
  const globalRequire = createRequire(`file://${globalRoot}/_`);
  chromium = globalRequire('playwright').chromium;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

    console.log('--- 1. Navigate to /login ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2500);

    console.log('--- 2. Inspect all inputs ---');
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(el => ({
        type: el.type,
        name: el.name,
        placeholder: el.placeholder,
        visible: el.offsetParent !== null,
        classes: el.className.slice(0, 80),
        id: el.id || ''
      }));
    });
    console.log('Inputs:', JSON.stringify(inputs, null, 2));

    console.log('--- 3. Check Cookie consent banner ---');
    // Use Playwright locator API (has-text is supported here)
    const agreeBtn = page.locator('button:has-text("同意")').first();
    const agreeVisible = await agreeBtn.isVisible({ timeout: 500 }).catch(() => false);
    console.log('Cookie banner visible:', agreeVisible);
    if (agreeVisible) {
      await agreeBtn.click({ timeout: 2000 }).catch(() => {});
      console.log('Clicked 同意 button');
      await page.waitForTimeout(500);
    }

    console.log('--- 4. Test main.mjs selectors ---');
    const userSelector = 'input[placeholder="账号"], input[placeholder="Username"], input[name="username"]';
    const userCount = await page.locator(userSelector).count();
    console.log('Username input count:', userCount);

    // Test individual selectors
    const cnCount = await page.locator('input[placeholder="账号"]').count();
    const enCount = await page.locator('input[placeholder="Username"]').count();
    const nameCount = await page.locator('input[name="username"]').count();
    console.log(`  placeholder="账号": ${cnCount}`);
    console.log(`  placeholder="Username": ${enCount}`);
    console.log(`  name="username": ${nameCount}`);

    console.log('--- 5. Test broader selectors ---');
    const allTextCount = await page.locator('input[type="text"]').count();
    const elInputCount = await page.locator('.el-input input').count();
    console.log(`  input[type="text"]: ${allTextCount}`);
    console.log(`  .el-input input: ${elInputCount}`);

    if (elInputCount > 0) {
      console.log('--- 6. Try login with .el-input input fallback ---');
      const firstInput = page.locator('.el-input input[type="text"]').first();
      await firstInput.fill(TEST_USER);
      console.log(`Filled username (${TEST_USER}) into first .el-input input`);
      const passInput = page.locator('input[type="password"]').first();
      await passInput.fill(TEST_PASS);
      console.log('Filled password');

      // Verify captcha is disabled
      const codeInput = page.locator('input[placeholder="验证码"], input[placeholder="Captcha"]').first();
      const codeVisible = await codeInput.isVisible({ timeout: 500 }).catch(() => false);
      console.log('Captcha input visible:', codeVisible);

      // Click login button - use text-based locator
      const loginBtn = page.locator('.el-button--primary').first();
      const btnText = await loginBtn.textContent().catch(() => '?');
      console.log('Primary button text:', btnText.trim());
      await loginBtn.click();
      console.log('Clicked primary button');

      await page.waitForURL('**/index**', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2500);
      console.log('After login URL:', page.url());
    }

    console.log('--- 7. Console errors ---');
    console.log(`Total errors: ${errors.length}`);
    errors.slice(0, 8).forEach((e, i) => console.log(`  [${i + 1}]`, e.slice(0, 250)));

    await page.screenshot({ path: 'screenshots/check-login.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
