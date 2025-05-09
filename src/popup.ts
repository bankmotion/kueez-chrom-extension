import type { DataType } from "./types/DataType";
// import { delay } from "./utils/utils";

async function scrape() {
  async function delay(sec: number) {
    return new Promise((resolve) => setTimeout(resolve, sec * 1000));
  }

  async function collectData() {
    const rows = document.querySelectorAll<HTMLTableRowElement>(
      "table#DataTables_Table_0 > tbody > tr"
    );
    const data: DataType[] = [];

    rows.forEach((row) => {
      const cells = row.querySelectorAll<HTMLTableCellElement>("td");

      const id = parseInt(cells[0].textContent?.trim() || "0");
      const imgTag = cells[1].querySelector("img");
      const image = imgTag?.getAttribute("data-original") || imgTag?.src || "";
      const title = cells[2].textContent?.trim() || "";
      const author = cells[7].textContent?.trim() || "";
      const postDate = cells[5].getAttribute("data-title") || "";
      const lastEdited = cells[6].getAttribute("data-title") || "";

      const contentTypeBlock = cells[8]?.innerHTML || "";
      const contentTypeMatch = contentTypeBlock.match(
        /Content Type:<\/strong>\s*(.*?)<\/div>/
      );
      const isEditorialMatch = contentTypeBlock.match(
        /Is Editorial:<\/strong>\s*(.*?)<\/div>/
      );
      const wordCountMatch = contentTypeBlock.match(
        /Words Count:<\/strong>\s*(.*?)<\/div>/
      );

      const contentType = contentTypeMatch?.[1]?.trim() || "";
      const isEditorial = isEditorialMatch?.[1]?.trim() || "";
      const wordCount = wordCountMatch?.[1]?.trim() || "";

      const articleURLBtn = row.querySelector(
        'a.btn-danger[target="_blank"]'
      ) as HTMLAnchorElement;
      const articleURL = articleURLBtn?.href || "";

      data.push({
        id,
        articleURL,
        image,
        amazonURL: "",
        title,
        author,
        postDate,
        lastEdited,
        contentType,
        isEditorial,
        wordCount,
        pageCount: 0,
      });
    });

    return data;
  }

  async function fetchAmazonURL(url: string) {
    try {
      const res = await fetch(url);
      const html = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const amazonBtn = doc.querySelector(
        "a.btn-ecom.main-font"
      ) as HTMLAnchorElement;
      return amazonBtn?.href || "";
    } catch (error) {
      console.error(`Failed to fetch Amazon URL for URL, ${url}, ${error}`);
      return "";
    }
  }

  async function sendToBackend(data: DataType[]) {
    try {
      const batchSize = 10;
      const currentTimestamp = new Date().getTime();

      const filteredData = data.filter((item) => !!item.amazonURL);

      for (let i = 0; i < filteredData.length; i += batchSize) {
        const amazonURLs = filteredData.slice(i, i + batchSize).map((item) => ({
          amazonURL: item.amazonURL,
          id: item.id,
        }));
        const isFinal = i + batchSize >= filteredData.length;

        const res = await fetch("http://localhost:3000/api/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amazonURLs, isFinal, currentTimestamp }),
        });
        console.log("sent to backend");

        if (isFinal) {
          const result = await res.json();
          return result as {
            id: number;
            pageCount: number;
          }[];
        }
      }
    } catch (error) {
      console.error(`Failed to send to backend, ${error}`);
    }
  }

  async function sendWebhook(data: DataType[]) {
    try {
      await fetch("https://pavelvulfin.app.n8n.cloud/webhook-test/kueez-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error(`Failed to send webhook, ${error}`);
    }
  }

  const paginationSelect = document.querySelector(
    'select[name="DataTables_Table_0_length"]'
  ) as HTMLSelectElement;

  if (paginationSelect) {
    paginationSelect.value = "500";
    paginationSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  await delay(3);
  let data = await collectData();
  console.log(data.length);

  let index = 0;
  for (const item of data) {
    item.amazonURL = await fetchAmazonURL(item.articleURL);
    index++;
    if (index > 5) break; // need to remove when lanuching
  }

  const result = await sendToBackend(data);

  if (result) {
    for (const item of data) {
      const res = result.find((re) => re.id === item.id);
      item.pageCount = res?.pageCount || 0;
    }
  }
  console.log(data);

  await delay(1);
  await sendWebhook(data);
}

document.getElementById("generateBtn")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrape,
    });
  }
});
