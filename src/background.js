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
    const tabId = tab ? tab.id : chrome.tabs.TAB_ID_NONE;

    const openInNewTab = () => {
      const viewerId = 'vc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      chrome.storage.local.set({ [viewerId]: content }, () => {
        chrome.tabs.create({ url: 'src/viewer.html?id=' + viewerId });
      });
    };

    const tryDevTools = () => {
        if (tabId === chrome.tabs.TAB_ID_NONE) {
            openInNewTab();
            return;
        }
        
        chrome.runtime.sendMessage({ 
            action: 'viewSnippetFromContextMenu', 
            content: content,
            tabId: tabId 
        }, (response) => {
            if (chrome.runtime.lastError || !response || !response.received) {
                // DevTools didn't pick it up
                openInNewTab();
            }
        });
    };

    if (tabId !== chrome.tabs.TAB_ID_NONE) {
      // Try sending to content script first
      chrome.tabs.sendMessage(tabId, { 
        action: 'viewSnippet', 
        content: content 
      })
      .then(() => {
          // Content script handled it
      })
      .catch(() => {
        // Content script failed (e.g. restricted page). Try DevTools.
        tryDevTools();
      });
    } else {
      // No valid tab ID, try DevTools or New Tab
      tryDevTools();
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
