define(['../shared/is_node.js'], function (a) {
    'use strict';
    const compatibilityParams = Object.create(null);
    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
        (function checkFontFace() {
            if (a.isNodeJS) {
                compatibilityParams.disableFontFace = true;
            }
        }());
    }
    const apiCompatibilityParams = Object.freeze(compatibilityParams);
    return { apiCompatibilityParams };
});