import { delay } from "./utils/utils";

async function scrape() {
  const paginationSelect = document.querySelector(
    'select[name="DataTables_Table_0_length"]'
  ) as HTMLSelectElement;

  if (paginationSelect) {
    paginationSelect.value = "500";
    paginationSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  await delay(3);
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
