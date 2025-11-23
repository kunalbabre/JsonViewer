chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }).catch(() => {
      // Ignore error if content script is not ready or page is not supported
    });
  }
});
