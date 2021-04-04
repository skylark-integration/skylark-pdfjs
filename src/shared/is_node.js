define(function () {
    'use strict';
    const isNodeJS = typeof process === 'object' && process + '' === '[object process]' && !process.versions.nw && !(process.versions.electron && process.type && process.type !== 'browser');
    return { isNodeJS };
});