define([
    './shared/util.js',
    './core/jbig2.js',
    './core/jpg.js',
    './core/jpx.js'
], function (a, b, c, d) {
    'use strict';
    const pdfjsVersion = PDFJSDev.eval('BUNDLE_VERSION');
    const pdfjsBuild = PDFJSDev.eval('BUNDLE_BUILD');
    return {
        a.getVerbosityLevel,
        b.Jbig2mage,
        c.JpegImage,
        d.JpxImage,
        a.setVerbosityLevel
    };
});