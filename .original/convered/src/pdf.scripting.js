define(['./scripting_api/initialization.js'], function (a) {
    'use strict';
    const pdfjsVersion = typeof PDFJSDev !== 'undefined' ? PDFJSDev.eval('BUNDLE_VERSION') : void 0;
    const pdfjsBuild = typeof PDFJSDev !== 'undefined' ? PDFJSDev.eval('BUNDLE_BUILD') : void 0;
    return { a.initSandbox };
});