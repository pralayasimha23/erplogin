const { chromium } = require('playwright');
const axios = require('axios');

(async () => {
  const WEBHOOK = process.env.N8N_WEBHOOK;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Opening login page...");

    await page.goto("https://erp.alliancein.com/allianceerp/security/Login", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.fill("#user", "EIN 4262");
    await page.fill("#password", "Urbanrise@143");

    await page.click("#buttonOK");

    console.log("Logging in...");

    await page.waitForLoadState("networkidle", { timeout: 30000 });

    const currentURL = page.url();
    console.log("Current URL:", currentURL);

    const loginSuccess = currentURL.includes("/allianceerp/") &&
                         !currentURL.includes("/Login");

    // Wait for dashboard widgets to appear
    await page.waitForTimeout(5000);

    console.log("Extracting attendance table...");

    const attendanceData = await page.evaluate(() => {
      const table = document.querySelector("table");
      if (!table) return [];

      const rows = Array.from(table.querySelectorAll("tbody tr"));

      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll("td"));
        return {
          punch_date:  cells[0]?.innerText?.trim() ?? null,
          punch_in:    cells[1]?.innerText?.trim() ?? null,
          punch_out:   cells[2]?.innerText?.trim() ?? null,
          attendance:  cells[3]?.innerText?.trim() ?? null
        };
      }).filter(row => row.punch_date); // skip completely empty rows
    });

    const cookies = await page.context().cookies();
    const jsession = cookies.find(c => c.name === "JSESSIONID");

    const result = {
      login_success:   loginSuccess,
      current_url:     currentURL,
      jsession:        jsession ? jsession.value : null,
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
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
