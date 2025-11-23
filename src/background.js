chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "view-json-snippet",
    title: "View JSON Snippet",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "view-json-snippet") {
    const content = info.selectionText;

    const openInNewTab = () => {
      chrome.storage.local.set({ 'viewerContent': content }, () => {
        chrome.tabs.create({ url: 'src/viewer.html' });
      });
    };

    if (tab && tab.id && tab.id !== chrome.tabs.TAB_ID_NONE) {
      // Try sending to content script first
      chrome.tabs.sendMessage(tab.id, { 
        action: 'viewSnippet', 
        content: content 
      })
      .catch(() => {
        // If content script is not available (e.g. restricted page, devtools, or error),
        // fallback to opening in a new tab
        openInNewTab();
      });
    } else {
      // No valid tab ID, open in new tab
      openInNewTab();
    }
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }).catch(() => {
      // Ignore error if content script is not ready or page is not supported
    });
  }
});
