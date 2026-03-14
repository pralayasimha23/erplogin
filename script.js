const { chromium } = require('playwright');
const axios = require('axios');

(async () => {
  const WEBHOOK = process.env.N8N_WEBHOOK;

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    console.log("Opening login page...");

    await page.goto("https://erp.alliancein.com/allianceerp/security/Login", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Wait for the form fields to be ready
    await page.waitForSelector("#user",     { timeout: 15000 });
    await page.waitForSelector("#password", { timeout: 15000 });

    await page.fill("#user",     "EIN 4262");
    await page.fill("#password", "Urbanrise@143");

    console.log("Submitting login form...");

    // Wait for navigation triggered by the button click
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 })
        .catch(() => console.log("Navigation wait timed out — continuing anyway")),
      page.click("#buttonOK")
    ]);

    // Extra settle time for JS-rendered dashboards
    await page.waitForTimeout(5000);

    const currentURL = page.url();
    console.log("Current URL:", currentURL);

    // Take a debug screenshot so you can see exactly what the page looks like
    const screenshotPath = "/tmp/post_login_debug.png";
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("Screenshot saved to:", screenshotPath);

    const loginSuccess =
      currentURL.includes("/allianceerp/") &&
      !currentURL.toLowerCase().includes("/login");

    // If still on login page, check for an error message
    if (!loginSuccess) {
      const errorMsg = await page.evaluate(() => {
        const el =
          document.querySelector(".error")       ||
          document.querySelector(".alert")       ||
          document.querySelector("#errorMsg")    ||
          document.querySelector("[class*=error]");
        return el ? el.innerText.trim() : null;
      });
      if (errorMsg) console.log("Login error message on page:", errorMsg);

      const title = await page.title();
      console.log("Page title after submit:", title);
    }

    console.log("Login success:", loginSuccess);

    // Extract attendance data
    console.log("Extracting attendance table...");

    const attendanceData = await page.evaluate(() => {
      // Pick the table with the most rows
      const tables = Array.from(document.querySelectorAll("table"));
      const table  = tables.sort(
        (a, b) => b.querySelectorAll("tr").length - a.querySelectorAll("tr").length
      )[0];

      if (!table) return [];

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      return rows
        .map(row => {
          const cells = Array.from(row.querySelectorAll("td"));
          return {
            punch_date: cells[0]?.innerText?.trim() || null,
            punch_in:   cells[1]?.innerText?.trim() || null,
            punch_out:  cells[2]?.innerText?.trim() || null,
            attendance: cells[3]?.innerText?.trim() || null
          };
        })
        .filter(row => row.punch_date);
    });

    const cookies = await context.cookies();
    const jsession = cookies.find(c => c.name === "JSESSIONID");

    const result = {
      login_success:   loginSuccess,
      current_url:     currentURL,
      jsession:        jsession?.value ?? null,
      attendance_data: attendanceData
    };

    console.log("Final Result:");
    console.log(JSON.stringify(result, null, 2));

    // Send to n8n webhook
    if (WEBHOOK) {
      try {
        const response = await axios.post(WEBHOOK, result, {
          headers: { "Content-Type": "application/json" },
          timeout: 10000
        });
        console.log("Webhook sent successfully. Status:", response.status);
      } catch (err) {
        console.error("Webhook error:", err.response?.status ?? err.message);
      }
    } else {
      console.log("No N8N_WEBHOOK env variable set — skipping webhook.");
    }

  } catch (error) {
    console.error("Script error:", error);

    try {
      await page.screenshot({ path: "/tmp/error_debug.png", fullPage: true });
      console.log("Error screenshot saved to /tmp/error_debug.png");
    } catch (_) {}

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
