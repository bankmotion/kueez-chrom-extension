import type { DataType } from "./types/DataType";
// import { delay } from "./utils/utils";

async function scrape() {
  async function delay(sec: number) {
    return new Promise((resolve) => setTimeout(resolve, sec * 1000));
  }

  function collectDataOnCMS() {
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
        amazonBasicURL: "",
        amazonValidation: "",
        seoTitle: "",
        description: "",
        description2: "",
        title,
        author,
        postDate,
        lastEdited,
        contentType,
        isEditorial,
        wordCount,
        pageCount: 0,
        isActive: false,
      });
    });

    return data;
  }

  async function fetchArticlePage(url: string) {
    try {
      const res = await fetch(url);
      const html = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const amazonBtn = doc.querySelector(
        "a.btn-ecom.main-font"
      ) as HTMLAnchorElement;

      const seoTitle = doc.querySelector(
        "h2.item-title.gallery-item-title a"
      ) as HTMLAnchorElement;

      const description = doc.querySelector(
        "div.gallery-item-description-1"
      ) as HTMLDivElement;

      const description2 = doc.querySelector(
        "div.gallery-item-description-2"
      ) as HTMLDivElement;

      return {
        amazonURL: amazonBtn?.href || "",
        seoTitle: seoTitle?.textContent || "",
        description:
          description?.textContent?.replace(/\s+/g, " ").trim() || "",
        description2:
          description2?.textContent?.replace(/\s+/g, " ").trim() || "",
      };
    } catch (error) {
      console.error(`Failed to fetch Amazon URL for URL, ${url}, ${error}`);
      return {
        amazonURL: "",
        seoTitle: "",
        description: "",
        description2: "",
      };
    }
  }

  console.log("start scrape");

  chrome.storage.local.set({ data: [] }, () => {
    console.log("Data initialized");
  });

  chrome.runtime.sendMessage({
    type: "StartScraping",
    value: "startProgress",
  });

  const paginationSelect = document.querySelector(
    'select[name="DataTables_Table_0_length"]'
  ) as HTMLSelectElement;

  if (!paginationSelect) {
    chrome.runtime.sendMessage({
      type: "ScrapingAdCreative",
      value: "This page is invalid. Please check the link.",
    });
    return;
  }

  paginationSelect.value = "500";
  paginationSelect.dispatchEvent(new Event("change", { bubbles: true }));

  await delay(3);
  const previousPageSelect = document.querySelector(
    "li#DataTables_Table_0_previous a"
  );
  if (previousPageSelect) {
    previousPageSelect.dispatchEvent(new Event("click", { bubbles: true }));
  }

  await delay(3);
  const firstPageData = collectDataOnCMS();

  const nextPageSelect = document.querySelector("li#DataTables_Table_0_next a");
  if (nextPageSelect) {
    nextPageSelect.dispatchEvent(new Event("click", { bubbles: true }));
  }

  await delay(3);
  const secondPageData = collectDataOnCMS();

  const data = [...firstPageData, ...secondPageData];

  console.log(`data.length`, data.length, data);

  for (let index = 0; index < data.length; index++) {
    const item = data[index];

    const { amazonURL, seoTitle, description, description2 } =
      await fetchArticlePage(item.articleURL);
    item.amazonURL = amazonURL;
    item.seoTitle = seoTitle;
    item.description = description;
    item.description2 = description2 + " " + amazonURL;
    item.amazonBasicURL = amazonURL.split("&")![0] || "";
    item.amazonValidation =
      amazonURL.includes("ascsubtag") && amazonURL.includes("&tag=brg_c_6-20")
        ? "Good"
        : "Issue, Please fix";
    // if (index > 100) break; // need to remove when lanuching

    // update progress
    chrome.runtime.sendMessage({
      type: "ScrapingArticle",
      value: ((index + 1) / data.length) * 100,
    });
  }

  console.log(data);

  chrome.storage.local.set({ data: data }, () => {
    if (chrome.runtime.lastError) {
      console.error("Storage Set Error:", chrome.runtime.lastError.message);
    } else {
      console.log("Data saved successfully");
    }
  });

  // await sendWebhook(data);
  chrome.runtime.sendMessage({
    type: "End",
  });
}

async function scrapeAdCreative() {
  async function delay(sec: number) {
    return new Promise((resolve) => setTimeout(resolve, sec * 1000));
  }

  async function sendToBackend(data: DataType[]) {
    return [];
    try {
      const batchSize = 10;
      const currentTimestamp = new Date().getTime();

      const filteredData = data.filter(
        (item) => !!item.amazonURL && item.isActive
      );

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

  async function sendWebhook(
    data: DataType[],
    adCreatives: {
      id: number;
      post: string;
      creative: number;
    }[]
  ) {
    try {
      await fetch("https://pavelvulfin.app.n8n.cloud/webhook/kueez-data", {
        // await fetch("https://pavelvulfin.app.n8n.cloud/webhook-test/kueez-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      // await fetch("https://pavelvulfin.app.n8n.cloud/webhook/report-data", {
      await fetch(
        "https://pavelvulfin.app.n8n.cloud/webhook-test/report-data",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(adCreatives),
        }
      );
    } catch (error) {
      console.error(`Failed to send webhook, ${error}`);
    }
  }

  chrome.runtime.sendMessage({
    type: "ScrapeAdCreative",
    value: "",
  });

  // get data from local storage
  const data: DataType[] = (await chrome.storage.local.get("data")).data;

  if (!data || data.length === 0) {
    chrome.runtime.sendMessage({
      type: "ScrapeAdCreative",
      value: "No data found. You need to scrape articles first.",
    });
    return;
  }

  // navigate to ad creatives page
  const adCreativesLink = document.querySelector(
    'a[href="https://admin.kueez.net/content/ad-creatives"]'
  ) as HTMLAnchorElement;

  if (!adCreativesLink) {
    chrome.runtime.sendMessage({
      type: "ScrapeAdCreative",
      value: "This page is invalid. Please check the link.",
    });
    return;
  }

  // Click the dropdown to open it
  // const dropdownToggle = document.querySelector(
  //   ".multiselect.dropdown-toggle"
  // ) as HTMLButtonElement;
  // dropdownToggle?.click();

  await delay(0.5);

  const valuesToSelect = ["post", "creative"];

  valuesToSelect.forEach((value) => {
    const checkbox = document.querySelector(
      `input[type="checkbox"][value="${value}"]`
    ) as HTMLInputElement;
    console.log(checkbox);
    if (checkbox && !checkbox.checked) {
      checkbox.click();
    }
  });

  // dropdownToggle?.click();
  await delay(0.5);

  // discover bestdeals
  const dropdownButton = document.querySelector(
    "button.multiselect.dropdown-toggle"
  ) as HTMLButtonElement;

  if (
    dropdownButton &&
    !dropdownButton.parentElement?.classList.contains("open")
  ) {
    // dropdownButton.click();
  }

  await delay(0.5);

  const checkbox = document.querySelector(
    'input[type="checkbox"][value="287"]'
  ) as HTMLInputElement;

  if (checkbox && !checkbox.checked) {
    checkbox.click();
  }
  // dropdownButton.click();

  const exportBtn = document.querySelector(
    ".pull-right > button"
  ) as HTMLButtonElement;
  if (exportBtn) {
    exportBtn.click();
  }

  await delay(0.5);
  const adCreatives: {
    id: number;
    post: string;
    creative: number;
  }[] = [];

  async function waitForTable() {
    const interval = setInterval(async () => {
      const table = document.querySelector(
        "table.table.table-bordered.table-striped.table-hover"
      );
      console.log(table);
      if (!table) return;

      const rows = table.querySelectorAll("tbody tr");

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 2) {
          adCreatives.push({
            id: parseInt(cells[1].textContent?.trim() || "0"),
            post: cells[2].textContent?.trim() || "",
            creative: parseInt(cells[5].textContent?.trim() || "0"),
          });
        }
      });

      clearInterval(interval); // Stop checking after success
      console.log("✅ Extracted Second Column Values:", adCreatives);
      data.forEach((item) => {
        item.isActive = adCreatives.some(
          (adCreative) => adCreative.id === item.id
        );
      });

      chrome.storage.local.set({ data: [] }, () => {
        console.log("Data saved");
      });

      console.log(data);

      chrome.runtime.sendMessage({
        type: "ScrapeAdCreative",
        value: "Finished scraping",
      });

      await delay(3);

      chrome.runtime.sendMessage({
        type: "ScrapeAdCreative",
        value: "Amazon scraping on backend...",
      });
      const result = await sendToBackend(data);
      // const result: any[] = [];
      chrome.runtime.sendMessage({
        type: "ScrapeAdCreative",
        value: "Amazon scraping on backend finished",
      });

      if (result) {
        for (const item of data) {
          const res = result.find((re) => re.id === item.id);
          item.pageCount = res?.pageCount || 0;
        }
      }

      await sendWebhook(data, adCreatives);

      chrome.runtime.sendMessage({
        type: "ScrapeAdCreative",
        value: "Finished sending webhook",
      });
    }, 1000);
  }

  waitForTable();
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

document
  .getElementById("adCreativeBtn")
  ?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeAdCreative,
      });
    }
  });

chrome.runtime.onMessage.addListener((message: any) => {
  const progressContainer = document.querySelector(
    "#progressContainer"
  ) as HTMLDivElement;
  const progressBar = document.querySelector(
    "#progressBar"
  ) as HTMLProgressElement;
  const progressLabel = document.querySelector(
    "#progressLabel"
  ) as HTMLLabelElement;
  const notify = document.querySelector("#notify") as HTMLDivElement;
  const adCreativeBtn = document.querySelector(
    "#adCreativeBtn"
  ) as HTMLButtonElement;

  if (message.type === "StartScraping") {
    const reportBtn = document.querySelector(
      "#generateBtn"
    ) as HTMLButtonElement;
    if (reportBtn) {
      if (message.value == "startProgress") {
        reportBtn.disabled = true;
      }
    }
    progressContainer.style.display = "block";
    progressLabel.textContent = "Scraping CMS...";
    progressBar.style.display = "none";
  }

  if (message.type === "ScrapingArticle") {
    if (progressContainer && progressBar && progressLabel) {
      progressContainer.style.display = "block";
      progressBar.value = message.value;
      progressBar.style.display = "block";
      progressLabel.textContent = "Scraping article...";
    }
  }

  if (message.type === "AmazonScrapingOnBackend") {
    progressContainer.style.display = "block";
    progressLabel.textContent = "Scraping amazon...";
    progressBar.style.display = "none";
  }

  if (message.type === "End") {
    progressContainer.style.display = "block";
    progressLabel.textContent = "Finished scraping";
    progressBar.style.display = "none";
  }

  if (message.type === "ScrapeAdCreative") {
    notify.textContent = message.value;

    if (message.value === "") {
      adCreativeBtn.disabled = true;
    } else if (message.value === "Finished sending webhook") {
      adCreativeBtn.disabled = false;
    }
  }
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const generateBtn = document.querySelector(
    "#generateBtn"
  ) as HTMLButtonElement;
  const adCreativeBtn = document.querySelector(
    "#adCreativeBtn"
  ) as HTMLButtonElement;

  const tab = tabs[0];
  if (!tab || !tab.url) return;

  if (tab.url.includes("cms.kueez.net")) {
    // Enable generate (scrape) if on CMS
    generateBtn.disabled = false;
    adCreativeBtn.disabled = true;
  } else if (tab.url.includes("admin.kueez.net")) {
    // Enable ad creative scraping for other pages
    generateBtn.disabled = true;
    adCreativeBtn.disabled = false;
  } else {
    generateBtn.disabled = true;
    adCreativeBtn.disabled = true;
  }
});
