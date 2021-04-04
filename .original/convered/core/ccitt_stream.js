define([
    './primitives.js',
    './ccitt.js',
    './stream.js'
], function (a, b, c) {
    'use strict';
    var CCITTFaxStream = function CCITTFaxStreamClosure() {
        function CCITTFaxStream(str, maybeLength, params) {
            this.str = str;
            this.dict = str.dict;
            if (!a.isDict(params)) {
                params = a.Dict.empty;
            }
            const source = {
                next() {
                    return str.getByte();
                }
            };
            this.ccittFaxDecoder = new b.CCITTFaxDecoder(source, {
                K: params.get('K'),
                EndOfLine: params.get('EndOfLine'),
                EncodedByteAlign: params.get('EncodedByteAlign'),
                Columns: params.get('Columns'),
                Rows: params.get('Rows'),
                EndOfBlock: params.get('EndOfBlock'),
                BlackIs1: params.get('BlackIs1')
            });
            c.DecodeStream.call(this, maybeLength);
        }
        CCITTFaxStream.prototype = Object.create(c.DecodeStream.prototype);
        CCITTFaxStream.prototype.readBlock = function () {
            while (!this.eof) {
                const c = this.ccittFaxDecoder.readNextChar();
                if (c === -1) {
                    this.eof = true;
                    return;
                }
                this.ensureBuffer(this.bufferLength + 1);
                this.buffer[this.bufferLength++] = c;
            }
        };
        return CCITTFaxStream;
    }();
    return { CCITTFaxStream };
});