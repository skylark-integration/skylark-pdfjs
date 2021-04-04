define(function () {
    'use strict';
    class NotSupportedError extends Error {
        constructor(name) {
            super(`${ name } isn't supported in PDF.js`);
            this.name = 'NotSupportedError';
        }
    }
    return { NotSupportedError };
});