chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "view-json-snippet",
    title: "View JSON Snippet",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "view-json-snippet" && tab.id) {
    chrome.tabs.sendMessage(tab.id, { 
      action: 'viewSnippet', 
      content: info.selectionText 
    }).catch(() => {
      // Ignore error
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }).catch(() => {
      // Ignore error if content script is not ready or page is not supported
    });
  }
});
