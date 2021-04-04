define(['./pdf_object.js'], function (a) {
    'use strict';
    class Console extends a.PDFObject {
        clear() {
            this._send({ id: 'clear' });
        }
        hide() {
        }
        println(msg) {
            if (typeof msg === 'string') {
                this._send({
                    command: 'println',
                    value: 'PDF.js Console:: ' + msg
                });
            }
        }
        show() {
        }
    }
    return { Console };
});