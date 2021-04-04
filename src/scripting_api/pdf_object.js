define(function () {
    'use strict';
    class PDFObject {
        constructor(data) {
            this._expandos = Object.create(null);
            this._send = data.send || null;
            this._id = data.id || null;
        }
    }
    return { PDFObject };
});