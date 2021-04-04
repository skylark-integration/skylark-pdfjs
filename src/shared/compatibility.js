define(['./is_node.js'], function (a) {
    'use strict';
    if ((typeof PDFJSDev === 'undefined' || !PDFJSDev.test('SKIP_BABEL')) && (typeof globalThis === 'undefined' || !globalThis._pdfjsCompatibilityChecked)) {
        if (typeof globalThis === 'undefined' || globalThis.Math !== Math) {
            globalThis = require('core-js/es/global-this');
        }
        globalThis._pdfjsCompatibilityChecked = true;
        (function checkNodeBtoa() {
            if (globalThis.btoa || !a.isNodeJS) {
                return;
            }
            globalThis.btoa = function (chars) {
                return Buffer.from(chars, 'binary').toString('base64');
            };
        }());
        (function checkNodeAtob() {
            if (globalThis.atob || !a.isNodeJS) {
                return;
            }
            globalThis.atob = function (input) {
                return Buffer.from(input, 'base64').toString('binary');
            };
        }());
        (function checkObjectFromEntries() {
            if (Object.fromEntries) {
                return;
            }
            require('core-js/es/object/from-entries.js');
        }());
        (function checkPromise() {
            if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('IMAGE_DECODERS')) {
                return;
            }
            if (globalThis.Promise.allSettled) {
                return;
            }
            globalThis.Promise = require('core-js/es/promise/index.js');
        }());
        (function checkURL() {
            if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION')) {
                return;
            } else if (!PDFJSDev.test('GENERIC')) {
                return;
            } else if (PDFJSDev.test('IMAGE_DECODERS')) {
                return;
            }
            globalThis.URL = require('core-js/web/url.js');
        }());
        (function checkReadableStream() {
            if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('IMAGE_DECODERS')) {
                return;
            }
            let isReadableStreamSupported = false;
            if (typeof ReadableStream !== 'undefined') {
                try {
                    new ReadableStream({
                        start(controller) {
                            controller.close();
                        }
                    });
                    isReadableStreamSupported = true;
                } catch (e) {
                }
            }
            if (isReadableStreamSupported) {
                return;
            }
            globalThis.ReadableStream = require('web-streams-polyfill/dist/ponyfill.js').ReadableStream;
        }());
        (function checkStringPadStart() {
            if (String.prototype.padStart) {
                return;
            }
            require('core-js/es/string/pad-start.js');
        }());
        (function checkStringPadEnd() {
            if (String.prototype.padEnd) {
                return;
            }
            require('core-js/es/string/pad-end.js');
        }());
        (function checkObjectValues() {
            if (Object.values) {
                return;
            }
            Object.values = require('core-js/es/object/values.js');
        }());
        (function checkObjectEntries() {
            if (Object.entries) {
                return;
            }
            Object.entries = require('core-js/es/object/entries.js');
        }());
    }
});