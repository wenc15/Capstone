// js/whitelist.js
// 11.19 created by Claire (Qinquan) Wang
// Responsibility:
//  - Manage the "whitelist" UI (checkbox group inside #whitelistGroup).
//  - Keep track of selected apps (multi-select).
//  - Provide helper functions for backend payloads and notes.

let currentWhitelistApps = ['chrome'];  // default selection

/**
 * Read all checked whitelist values from the checkbox group container.
 * @param {HTMLElement | null} groupEl
 */
function syncFromDom(groupEl) {
  if (!groupEl) {
    currentWhitelistApps = ['chrome'];
    return;
  }

  // Find all checked checkboxes with name="whitelistApp"
  const checked = groupEl.querySelectorAll(
    'input[name="whitelistApp"]:checked'
  );
  const values = Array.from(checked).map((input) => input.value);

  // If nothing is selected, fall back to "chrome" as a safe default
  currentWhitelistApps = values.length > 0 ? values : ['chrome'];
  console.log('[Whitelist] current apps:', currentWhitelistApps);
}

/**
 * Map multiple whitelist values to OS process names and deduplicate.
 * @param {string[]} appValues
 * @returns {string[]} allowedProcesses
 */
function mapWhitelistToProcesses(appValues) {
  const result = [];

  appValues.forEach((appValue) => {
    switch (appValue) {
      case 'chrome':
        result.push('chrome.exe');
        break;
      case 'code':
        result.push('Code.exe', 'code.exe');
        break;
      case 'edge':
        result.push('msedge.exe');
        break;
      case 'word':
        result.push('WINWORD.EXE');
        break;
      case 'ppt':
        result.push('POWERPNT.EXE');
        break;
      default:
        break;
    }
  });

  // Remove duplicates
  return Array.from(new Set(result));
}

/**
 * Initialize the whitelist checkbox group:
 *  - Perform an initial sync from DOM.
 *  - Attach a change listener so internal state updates when user toggles checkboxes.
 * @param {HTMLElement | null} groupEl
 */
export function initWhitelist(groupEl) {
  if (!groupEl) {
    console.warn('[Whitelist] initWhitelist called with null element');
    currentWhitelistApps = ['chrome'];
    return;
  }

  // Initial sync
  syncFromDom(groupEl);

  // Event delegation: listen for changes on any checkbox inside the group
  groupEl.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== 'whitelistApp') return;

    syncFromDom(groupEl);
  });
}

/**
 * Helper for timer/backend: list of allowedProcesses.
 * @returns {string[]}
 */
export function getAllowedProcesses() {
  return mapWhitelistToProcesses(currentWhitelistApps);
}

/**
 * Helper for storage/stats: a note string like "chrome, code, edge".
 * @returns {string}
 */
export function getWhitelistNote() {
  return currentWhitelistApps && currentWhitelistApps.length
    ? currentWhitelistApps.join(', ')
    : '';
}
