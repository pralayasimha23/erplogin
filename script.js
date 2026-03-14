const { chromium } = require('playwright');
const axios = require('axios');

(async () => {

const WEBHOOK = process.env.N8N_WEBHOOK;

const browser = await chromium.launch({
headless: true
});

const page = await browser.newPage();

try {

```
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
      punch_date: cells[0]?.innerText.trim(),
      punch_in: cells[1]?.innerText.trim(),
      punch_out: cells[2]?.innerText.trim(),
      attendance: cells[3]?.innerText.trim()
    };

  });

});

const cookies = await page.context().cookies();

const jsession = cookies.find(c => c.name === "JSESSIONID");

const result = {
  login_success: loginSuccess,
  current_url: currentURL,
  jsession: jsession ? jsession.value : null,
  attendance_data: attendanceData
};

console.log("Final Result:");
console.log(result);

// Send to n8n webhook
if (WEBHOOK) {

  try {

    await axios.post(WEBHOOK, result, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    console.log("Webhook sent successfully");

  } catch (err) {

    console.log("Webhook error:", err.response?.status);

  }

}
```

} catch (error) {

```
console.error("Script error:", error);
```

} finally {

```
await browser.close();
```

}

})();
