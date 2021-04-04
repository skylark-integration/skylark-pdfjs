define([
    './stream.js',
    './jpx.js',
    '../shared/util.js'
], function (a, b, c) {
    'use strict';
    const JpxStream = function JpxStreamClosure() {
        function JpxStream(stream, maybeLength, dict, params) {
            this.stream = stream;
            this.maybeLength = maybeLength;
            this.dict = dict;
            this.params = params;
            a.DecodeStream.call(this, maybeLength);
        }
        JpxStream.prototype = Object.create(a.DecodeStream.prototype);
        Object.defineProperty(JpxStream.prototype, 'bytes', {
            get: function JpxStream_bytes() {
                return c.shadow(this, 'bytes', this.stream.getBytes(this.maybeLength));
            },
            configurable: true
        });
        JpxStream.prototype.ensureBuffer = function (requested) {
        };
        JpxStream.prototype.readBlock = function () {
            if (this.eof) {
                return;
            }
            const jpxImage = new b.JpxImage();
            jpxImage.parse(this.bytes);
            const width = jpxImage.width;
            const height = jpxImage.height;
            const componentsCount = jpxImage.componentsCount;
            const tileCount = jpxImage.tiles.length;
            if (tileCount === 1) {
                this.buffer = jpxImage.tiles[0].items;
            } else {
                const data = new Uint8ClampedArray(width * height * componentsCount);
                for (let k = 0; k < tileCount; k++) {
                    const tileComponents = jpxImage.tiles[k];
                    const tileWidth = tileComponents.width;
                    const tileHeight = tileComponents.height;
                    const tileLeft = tileComponents.left;
                    const tileTop = tileComponents.top;
                    const src = tileComponents.items;
                    let srcPosition = 0;
                    let dataPosition = (width * tileTop + tileLeft) * componentsCount;
                    const imgRowSize = width * componentsCount;
                    const tileRowSize = tileWidth * componentsCount;
                    for (let j = 0; j < tileHeight; j++) {
                        const rowBytes = src.subarray(srcPosition, srcPosition + tileRowSize);
                        data.set(rowBytes, dataPosition);
                        srcPosition += tileRowSize;
                        dataPosition += imgRowSize;
                    }
                }
                this.buffer = data;
            }
            this.bufferLength = this.buffer.length;
            this.eof = true;
        };
        return JpxStream;
    }();
    return { JpxStream };
});