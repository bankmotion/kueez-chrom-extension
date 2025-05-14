import type { DataType } from "./types/DataType";

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

  chrome.storage.local.set({
    data: {
      type: "StartScraping",
      text: "Scraping CMS page...",
      color: "blue",
      value: 0,
      data: [],
    },
  });

  const paginationSelect = document.querySelector(
    'select[name="DataTables_Table_0_length"]'
  ) as HTMLSelectElement;

  if (!paginationSelect) {
    chrome.storage.local.set({
      data: {
        type: "Error",
        text: "This page is invalid. Please check the link.",
        color: "red",
        value: 0,
        data: [],
      },
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
    chrome.storage.local.set({
      data: {
        type: "ScrapingArticle",
        text: `Scraping article ${index + 1} of ${data.length}`,
        color: "blue",
        value: ((index + 1) / data.length) * 100,
      },
    });
  }

  console.log(data);

  chrome.storage.local.set({
    data: {
      type: "EndScrapingCMS",
      text: "Finished CMS page scraping. Please start scraping ad creatives.",
      color: "green",
      value: 0,
      data: data,
    },
  });
}

async function scrapeAdCreative() {
  const CMSWebhookURL =
    // "https://cassielv.app.n8n.cloud/webhook-test/kueez-data";
    "https://cassielv.app.n8n.cloud/webhook/kueez-data";
  const ReportWebhookURL =
    // "https://cassielv.app.n8n.cloud/webhook-test/report-data";
    "https://cassielv.app.n8n.cloud/webhook/report-data";

  const BackendURL = "https://ca26-46-101-168-26.ngrok-free.app";

  async function delay(sec: number) {
    return new Promise((resolve) => setTimeout(resolve, sec * 1000));
  }

  async function sendToBackend(data: DataType[]) {
    // return [];
    console.log("send to backend");
    try {
      const batchSize = 10;
      const currentTimestamp = new Date().getTime();

      const filteredData = data.filter(
        (item) => !!item.amazonURL && item.isActive
      );

      const result: {
        id: number;
        pageCount: number;
      }[] = [];

      let progress = 0;

      for (let i = 0; i < filteredData.length; i += batchSize) {
        const amazonURLs = filteredData.slice(i, i + batchSize).map((item) => ({
          amazonURL: item.amazonURL,
          id: item.id,
        }));

        const res = await fetch(`${BackendURL}/api/scrape`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amazonURLs, currentTimestamp }),
        });
        console.log("sent to backend");

        const subResult = await res.json();
        console.log("subResult", subResult);
        result.push(...subResult);

        progress += batchSize;

        chrome.storage.local.set({
          data: {
            type: "ScrapingAdCreativeProgress",
            text: `Scraping ad creative ${progress} of ${filteredData.length}`,
            color: "blue",
            value: (progress / filteredData.length) * 100,
          },
        });
      }

      return result;
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
      await fetch(CMSWebhookURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      await fetch(ReportWebhookURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(adCreatives),
      });
    } catch (error) {
      console.error(`Failed to send webhook, ${error}`);
    }
  }

  // get data from local storage
  const data: DataType[] = (await chrome.storage.local.get("data")).data.data;

  if (!data || data.length === 0) {
    chrome.storage.local.set({
      data: {
        type: "Error",
        text: "No data found. You need to scrape articles first.",
        color: "red",
        value: 0,
        data: [],
      },
    });
    return;
  }

  chrome.storage.local.set({
    data: {
      type: "ScrapeAdCreative",
      text: "Scraping ad creatives...",
      color: "blue",
      value: 0,
    },
  });

  // navigate to ad creatives page
  const adCreativesLink = document.querySelector(
    'a[href="https://admin.kueez.net/content/ad-creatives"]'
  ) as HTMLAnchorElement;

  if (!adCreativesLink) {
    chrome.storage.local.set({
      data: {
        type: "Error",
        text: "This page is invalid. Please check the link.",
        color: "red",
        value: 0,
        data: [],
      },
    });
    return;
  }

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

  await delay(0.5);

  const checkbox = document.querySelector(
    'input[type="checkbox"][value="287"]'
  ) as HTMLInputElement;

  if (checkbox && !checkbox.checked) {
    checkbox.click();
  }

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

      console.log(data);

      chrome.storage.local.set({
        data: {
          type: "ScrapeAdCreative",
          text: "Finished scraping ad creatives",
          color: "green",
          value: 100,
          data: data,
        },
      });

      await delay(3);

      const result = await sendToBackend(data);
      console.log("result", result);
      // const result: any[] = [];
      chrome.storage.local.set({
        data: {
          type: "ScrapeAdCreative",
          text: "Amazon scraping on backend finished",
          color: "green",
          value: 100,
          data: data,
        },
      });

      if (result) {
        for (const item of data) {
          const res = result.find((re) => re.id === item.id);
          item.pageCount = res?.pageCount || 0;
        }
      }

      await sendWebhook(data, adCreatives);

      chrome.storage.local.set({
        data: {
          type: "FinishSendingWebhook",
          text: "Finished sending webhook. Please check the Reports files",
          color: "green",
          value: 100,
          data: data,
        },
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

let count = 0;
let currentType = "";

setInterval(() => {
  chrome.storage.local.get("data", (result) => {
    const progress = document.querySelector(
      "#adProgressBar"
    ) as HTMLProgressElement;

    const notify = document.querySelector("#notify") as HTMLDivElement;

    if (!progress || !notify) return;

    if (result.data.type !== currentType) {
      count = 0;
      currentType = result.data.type;
    }
    count++;

    if (
      count > 10 &&
      (currentType === "FinishSendingWebhook" ||
        currentType === "EndScrapingCMS")
    ) {
      progress.style.display = "none";
      notify.textContent = "";
      return;
    }

    const res = result.data;
    console.log(res);

    if (res.text) {
      if (notify) {
        notify.innerHTML = res.text;

        if (res.color) {
          notify.style.color = res.color;
        }
      }
    }

    if (res.value) {
      progress.style.display = "block";
      progress.value = res.value;
    } else {
      progress.style.display = "none";
    }
  });
}, 300);
