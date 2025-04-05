// ==UserScript==
// @name         Dragon Tea Decipher
// @namespace    https://github.com/BobbyWibowo
// @match        *://dragontea.ink/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=dragontea.ink
// @run-at       document-end
// @grant        GM_getValue
// @version      1.0.6
// @author       Bobby Wibowo
// @license      MIT
// @description  7/2/2024, 8:37:14 PM
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const _logTime = () => {
    return new Date().toLocaleTimeString([], {
      hourCycle: 'h12',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
      .replaceAll('.', ':')
      .replace(',', '.')
      .toLocaleUpperCase();
  };

  const log = (message, ...args) => {
    const prefix = `[${_logTime()}]: `;
    if (typeof message === 'string') {
      return console.log(prefix + message, ...args);
    } else {
      return console.log(prefix, message, ...args);
    }
  };

  /** CONFIG **/

  const SELECTORS_ARTICLE = '.chapter-type-text .reading-content .text-left, .wp-manga-genre-novels .description-summary .summary__content';

  const ENV = {
    MODE: GM_getValue('MODE', 'PROD')
  };

  let logDebug = () => {};
  if (ENV.MODE !== 'PROD') {
    log('MODE =', ENV.MODE);
    logDebug = log;
  }

  /** UTILS **/

  class FunctionQueue {
    constructor () {
      this.queue = [];
      this.running = false;
    }

    async go () {
      if (this.queue.length) {
        this.running = true;
        const _func = this.queue.shift();
        await _func[0](..._func[1]);
        this.go();
      } else {
        this.running = false;
      }
    }

    add (func, ...args) {
      this.queue.push([func, [...args]]);

      if (!this.running) {
        this.go();
      }
    }

    clear () {
      this.queue.length = 0;
    }
  };

  const observerFactory = option => {
    let options;
    if (typeof option === 'function') {
      options = {
        callback: option,
        node: document.getElementsByTagName('body')[0],
        option: { childList: true, subtree: true }
      };
    } else {
      options = $.extend({
        callback: () => {},
        node: document.getElementsByTagName('body')[0],
        option: { childList: true, subtree: true }
      }, option);
    }
    const MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;

    const observer = new MutationObserver((mutations, observer) => {
      options.callback.call(this, mutations, observer);
    });

    observer.observe(options.node, options.option);
    return observer;
  };

  const traverseElement = (element, func) => {
    // Preserve <script> and <style> elements.
    if (['SCRIPT', 'STYLE'].includes(element.tagName)) {
      return false;
    }

    let child = element.lastChild;
    while (child) {
      if (child.nodeType === 1) {
        traverseElement(child, func);
      } else if (child.nodeType === 3) {
        func(child);
      }
      child = child.previousSibling;
    }
    return true;
  };

  const enAtbash = string => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const tebahpla = 'ZYXWVUTSRQPONMLKJIHGFEDCBA';
    const alphabetLower = 'abcdefghijklmnopqrstuvwxyz';
    const tebahplaLower = 'zyxwvutsrqponmlkjihgfedcba';

    let decodedString = '';
    for (let i = 0; i < string.length; i++) {
      const codedLetter = string.charAt(i);

      if (/[^a-zA-Z]/.test(string[i])) {
        decodedString += string[i];
      } else if (string[i] === string[i].toUpperCase()) {
        const letterIndex = alphabet.indexOf(codedLetter);
        const tebalphaLetter = tebahpla.charAt(letterIndex);
        decodedString += tebalphaLetter;
      } else {
        const letterIndex = alphabetLower.indexOf(codedLetter);
        const tebalphaLetter = tebahplaLower.charAt(letterIndex);
        decodedString += tebalphaLetter;
      }
    }
    return decodedString;
  };

  const doArticle = element => {
    if (element.dataset.cipherUndone) {
      return false;
    }

    // Mark as processed.
    element.dataset.cipherUndone = true;

    let _children = 0;

    traverseElement(element, child => {
      child.data = enAtbash(child.data);
      _children++;
    });

    if (_children > 0) {
      logDebug(`Called enAtbash() on ${_children} child node(s).`);
    }

    return true;
  };

  const triggerQueue = new FunctionQueue();

  observerFactory((...args) => {
    triggerQueue.add((mutations, observer) => {
      for (let i = 0, len = mutations.length; i < len; i++) {
        const mutation = mutations[i];

        // Whether to change nodes.
        if (mutation.type !== 'childList') {
          continue;
        }

        let _article = 0;

        if (mutation.target.matches(SELECTORS_ARTICLE)) {
          if (doArticle(mutation.target)) {
            _article++;
          }
        } else {
          const articles = mutation.target.querySelectorAll(SELECTORS_ARTICLE);
          for (const article of articles) {
            if (doArticle(article)) {
              _article++;
            }
          }
        }

        if (_article > 0) {
          log(`Deciphered ${_article} article(s).`);
        }
      }
    }, ...args);
  });

  log('Mutation Observer initiated.');
})();
