const { chromium } = require('playwright');
const axios = require('axios');

(async () => {
  const WEBHOOK = process.env.N8N_WEBHOOK;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Opening login page...");

    await page.goto("https://erp.alliancein.com/allianceerp/security/Login");

    await page.fill("#user", "EIN 4262");
    await page.fill("#password", "Urbanrise@143");

    await page.click("#buttonOK");

    console.log("Logging in...");

    await page.waitForLoadState("networkidle");

    const currentURL = page.url();
    console.log("Current URL:", currentURL);

    const loginSuccess = currentURL.includes("/allianceerp/");

    // Wait for SmartClient grid to fully render
    await page.waitForTimeout(5000);

    console.log("Extracting attendance data...");

    const attendanceData = await page.evaluate(() => {
      const results = [];

      // SmartClient renders data inside <nobr> tags within <td class="OBGridCell*">
      // The main data table has id containing "isc_" and class "listTable"
      const dataTables = Array.from(document.querySelectorAll("table.listTable"));

      for (const table of dataTables) {
        const rows = Array.from(table.querySelectorAll("tbody tr"));

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td"));
          if (cells.length < 3) continue;

          // Text is inside <nobr> inside <div> inside <td>
          const getText = (td) => {
            const nobr = td.querySelector("nobr");
            if (nobr) return nobr.innerText.trim();
            const div = td.querySelector("div");
            if (div) return div.innerText.trim();
            return td.innerText.trim();
          };

          const punch_date = getText(cells[0]);
          const punch_in   = getText(cells[1]);
          const punch_out  = getText(cells[2]);
          const punch_day  = cells[3] ? getText(cells[3]) : null;

          if (punch_date && punch_date.match(/\d{2}-\d{2}-\d{4}/)) {
            results.push({ punch_date, punch_in, punch_out, punch_day });
          }
        }
      }

      return results;
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

    if (WEBHOOK) {
      try {
        await axios.post(WEBHOOK, result, {
          headers: { "Content-Type": "application/json" }
        });
        console.log("Webhook sent successfully");
      } catch (err) {
        console.log("Webhook error:", err.response?.status);
      }
    }

  } catch (error) {
    console.error("Script error:", error);
  } finally {
    await browser.close();
  }
})();
