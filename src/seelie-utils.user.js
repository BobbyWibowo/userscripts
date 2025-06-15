// ==UserScript==
// @name         Seelie.me Utils
// @namespace    https://github.com/BobbyWibowo
// @version      1.0.0
// @description  Utilities for Seelie.me.
// @author       Bobby Wibowo
// @license      MIT
// @match        *://*.seelie.me/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=seelie.me
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const _LOG_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });

  const log = (message, ...args) => {
    const prefix = `[${_LOG_TIME_FORMAT.format(Date.now())}]: `;
    if (typeof message === 'string') {
      return console.log(prefix + message, ...args);
    } else {
      return console.log(prefix, message, ...args);
    }
  };

  /** CONFIG **/

  const ENV = {
    MODE: GM_getValue('MODE', 'PROD')
  };

  let logDebug = () => {};
  if (ENV.MODE !== 'PROD') {
    log('MODE =', ENV.MODE);
    logDebug = log;
  }

  /** UTILS **/

  const waitPageLoaded = () => {
    return new Promise(resolve => {
      if (document.readyState === 'complete' ||
        document.readyState === 'loaded' ||
        document.readyState === 'interactive') {
        resolve();
      } else {
        document.addEventListener('DOMContentLoaded', resolve);
      }
    });
  };

  const doInputFocus = element => {
    if (element.type !== 'number' && element.type !== 'text') {
      return false;
    }

    // Skip name input for custom characters.
    if (element.id === 'name') {
      return false;
    }

    // Select-all input value.
    element.select();
  };

  waitPageLoaded().then(() => {
    logDebug('Page loaded, attaching focusin event listener\u2026');
    document.body.addEventListener('focusin', event => {
      if (event.target.tagName === 'INPUT') {
        doInputFocus(event.target);
      }
    });
  });
})();
