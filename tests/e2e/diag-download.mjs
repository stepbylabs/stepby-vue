// stepby-vue/tests/e2e/diag-download.mjs
// 诊断：备份页点击下载按钮后，捕获全部 network 请求/响应与 console 错误。
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    logs.push(`[console.${m.type()}] ${m.text().slice(0, 200)}`);
});
page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.url().slice(-80)} :: ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.url().includes("download") || r.url().includes("backup"))
    logs.push(`[response] ${r.status()} ${r.url().slice(-90)}`);
});
page.on("request", (r) => {
  if (r.url().includes("download")) logs.push(`[request] ${r.method()} ${r.url().slice(-90)}`);
});

await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await page.fill('input[name="username"]', "admin");
await page.fill('input[name="password"]', "admin123");
await page.click('button:has-text("登")');
await page.waitForURL(/\/index/, { timeout: 30000 });
await page.goto("http://localhost:5173/index", { waitUntil: "domcontentloaded", timeout: 90000 });
// 等动态路由挂载完成（vite dev 下 getInfo+addRoute 需要时间）
await page.waitForTimeout(12000);
// SPA 内二次导航，落回 /index 则重试一次（动态路由挂载竞态）
for (let attempt = 1; attempt <= 3; attempt++) {
  await page.goto("http://localhost:5173/monitor/backup", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);
  if (page.url().includes("/monitor/backup")) break;
  console.log(`attempt ${attempt} bounced to ${page.url()}，重试`);
}
console.log("now_url=", page.url());
try {
  await page.waitForSelector(".el-table__body-wrapper tbody tr", { timeout: 90000 });
} catch {
  console.log("=== TABLE_WAIT_FAILED ===");
  console.log("url=", page.url());
  console.log(
    "has404=",
    await page
      .content()
      .then((c) => c.includes("404") || c.includes("找不到")),
  );
  console.log(
    "hasTable=",
    await page.content().then((c) => c.includes("el-table")),
  );
  console.log("body_text=", (await page.locator("body").innerText().catch(() => "")).slice(0, 300));
  console.log("=== captured logs ===");
  for (const l of logs) console.log(l);
  await browser.close();
  process.exit(1);
}

console.log("=== 点击下载按钮（force 穿透蒙层）===");
const btn = page.locator('.el-table__body-wrapper tbody tr').first().locator('button:has-text("下载")').first();
console.log("btn_count=", await btn.count());
await btn.click({ force: true, timeout: 10000 }).catch((e) => console.log("click_err=", String(e).slice(0, 150)));
await page.waitForTimeout(15000);
// 若出现 MessageBox（安全提示等）则确认后再等 10s
const mb = page.locator(".el-overlay-message-box .el-button--primary").first();
if (await mb.isVisible({ timeout: 2000 }).catch(() => false)) {
  console.log("=== MessageBox dump ===");
  console.log("text=", await page.locator(".el-overlay-message-box").first().innerText().catch(() => "N/A"));
  console.log("buttons=", await page.locator(".el-overlay-message-box button").allInnerTexts().catch(() => []));
  await mb.click();
  await page.waitForTimeout(10000);
}
console.log("=== 捕获日志 ===");
for (const l of logs) console.log(l);
await browser.close();
