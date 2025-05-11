import { MessageType } from "./enum";

chrome.runtime.onMessage.addListener((message: any) => {
  console.log(message);
  if (message.type === MessageType.ScrapingArticle) {
    const progressContainer = document.querySelector(
      "#progressContainer"
    ) as HTMLDivElement;
    const progressBar = document.querySelector(
      "#progressBar"
    ) as HTMLProgressElement;
    const progressLabel = document.querySelector(
      "#progressLabel"
    ) as HTMLLabelElement;

    if (progressContainer && progressBar && progressLabel) {
      progressContainer.style.display = "block";
      progressBar.value = message.value;
      progressLabel.textContent = "Scraping article";
    }
  }

  if (message.type === MessageType.StartScraping) {
    const reportBtn = document.querySelector(
      "#generateBtn"
    ) as HTMLButtonElement;
    console.log(reportBtn);
    if (reportBtn) {
      if (message.value == "startProgress") {
        reportBtn.disabled = true;
      }
    }
  }
});
