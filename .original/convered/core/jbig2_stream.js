define([
    './primitives.js',
    './stream.js',
    './jbig2.js',
    '../shared/util.js'
], function (a, b, c, d) {
    'use strict';
    const Jbig2Stream = function Jbig2StreamClosure() {
        function Jbig2Stream(stream, maybeLength, dict, params) {
            this.stream = stream;
            this.maybeLength = maybeLength;
            this.dict = dict;
            this.params = params;
            b.DecodeStream.call(this, maybeLength);
        }
        Jbig2Stream.prototype = Object.create(b.DecodeStream.prototype);
        Object.defineProperty(Jbig2Stream.prototype, 'bytes', {
            get() {
                return d.shadow(this, 'bytes', this.stream.getBytes(this.maybeLength));
            },
            configurable: true
        });
        Jbig2Stream.prototype.ensureBuffer = function (requested) {
        };
        Jbig2Stream.prototype.readBlock = function () {
            if (this.eof) {
                return;
            }
            const jbig2Image = new c.Jbig2Image();
            const chunks = [];
            if (a.isDict(this.params)) {
                const globalsStream = this.params.get('JBIG2Globals');
                if (a.isStream(globalsStream)) {
                    const globals = globalsStream.getBytes();
                    chunks.push({
                        data: globals,
                        start: 0,
                        end: globals.length
                    });
                }
            }
            chunks.push({
                data: this.bytes,
                start: 0,
                end: this.bytes.length
            });
            const data = jbig2Image.parseChunks(chunks);
            const dataLength = data.length;
            for (let i = 0; i < dataLength; i++) {
                data[i] ^= 255;
            }
            this.buffer = data;
            this.bufferLength = dataLength;
            this.eof = true;
        };
        return Jbig2Stream;
    }();
    return { Jbig2Stream };
});