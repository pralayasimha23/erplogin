const { chromium } = require('playwright');
const axios = require('axios');

(async () => {

const WEBHOOK = process.env.N8N_WEBHOOK;

const browser = await chromium.launch({
headless: true
});

const page = await browser.newPage();

await page.goto("https://erp.alliancein.com/allianceerp/security/Login");

await page.fill("#user", "EIN 4262");
await page.fill("#password", "Urbanrise@143");

await page.click("#buttonOK");

await page.waitForTimeout(5000);

const url = page.url();

const cookies = await page.context().cookies();

let jsession = cookies.find(c => c.name === "JSESSIONID");

const result = {
login_success: url.includes("/allianceerp"),
current_url: url,
jsession: jsession ? jsession.value : null
};

console.log(result);

if (WEBHOOK) {
await axios.post(WEBHOOK, result);
}

await browser.close();

})();
