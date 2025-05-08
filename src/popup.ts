document.getElementById('generateBtn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        alert("Injected!"); // Placeholder for scrape logic
      }
    });
  }
});
