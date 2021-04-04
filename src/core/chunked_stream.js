define([
    '../shared/util.js',
    './core_utils.js'
], function (a, b) {
    'use strict';
    class ChunkedStream {
        constructor(length, chunkSize, manager) {
            this.bytes = new Uint8Array(length);
            this.start = 0;
            this.pos = 0;
            this.end = length;
            this.chunkSize = chunkSize;
            this._loadedChunks = new Set();
            this.numChunks = Math.ceil(length / chunkSize);
            this.manager = manager;
            this.progressiveDataLength = 0;
            this.lastSuccessfulEnsureByteChunk = -1;
        }
        getMissingChunks() {
            const chunks = [];
            for (let chunk = 0, n = this.numChunks; chunk < n; ++chunk) {
                if (!this._loadedChunks.has(chunk)) {
                    chunks.push(chunk);
                }
            }
            return chunks;
        }
        getBaseStreams() {
            return [this];
        }
        get numChunksLoaded() {
            return this._loadedChunks.size;
        }
        allChunksLoaded() {
            return this.numChunksLoaded === this.numChunks;
        }
        onReceiveData(begin, chunk) {
            const chunkSize = this.chunkSize;
            if (begin % chunkSize !== 0) {
                throw new Error(`Bad begin offset: ${ begin }`);
            }
            const end = begin + chunk.byteLength;
            if (end % chunkSize !== 0 && end !== this.bytes.length) {
                throw new Error(`Bad end offset: ${ end }`);
            }
            this.bytes.set(new Uint8Array(chunk), begin);
            const beginChunk = Math.floor(begin / chunkSize);
            const endChunk = Math.floor((end - 1) / chunkSize) + 1;
            for (let curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
                this._loadedChunks.add(curChunk);
            }
        }
        onReceiveProgressiveData(data) {
            let position = this.progressiveDataLength;
            const beginChunk = Math.floor(position / this.chunkSize);
            this.bytes.set(new Uint8Array(data), position);
            position += data.byteLength;
            this.progressiveDataLength = position;
            const endChunk = position >= this.end ? this.numChunks : Math.floor(position / this.chunkSize);
            for (let curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
                this._loadedChunks.add(curChunk);
            }
        }
        ensureByte(pos) {
            if (pos < this.progressiveDataLength) {
                return;
            }
            const chunk = Math.floor(pos / this.chunkSize);
            if (chunk === this.lastSuccessfulEnsureByteChunk) {
                return;
            }
            if (!this._loadedChunks.has(chunk)) {
                throw new b.MissingDataException(pos, pos + 1);
            }
            this.lastSuccessfulEnsureByteChunk = chunk;
        }
        ensureRange(begin, end) {
            if (begin >= end) {
                return;
            }
            if (end <= this.progressiveDataLength) {
                return;
            }
            const chunkSize = this.chunkSize;
            const beginChunk = Math.floor(begin / chunkSize);
            const endChunk = Math.floor((end - 1) / chunkSize) + 1;
            for (let chunk = beginChunk; chunk < endChunk; ++chunk) {
                if (!this._loadedChunks.has(chunk)) {
                    throw new b.MissingDataException(begin, end);
                }
            }
        }
        nextEmptyChunk(beginChunk) {
            const numChunks = this.numChunks;
            for (let i = 0; i < numChunks; ++i) {
                const chunk = (beginChunk + i) % numChunks;
                if (!this._loadedChunks.has(chunk)) {
                    return chunk;
                }
            }
            return null;
        }
        hasChunk(chunk) {
            return this._loadedChunks.has(chunk);
        }
        get length() {
            return this.end - this.start;
        }
        get isEmpty() {
            return this.length === 0;
        }
        getByte() {
            const pos = this.pos;
            if (pos >= this.end) {
                return -1;
            }
            if (pos >= this.progressiveDataLength) {
                this.ensureByte(pos);
            }
            return this.bytes[this.pos++];
        }
        getUint16() {
            const b0 = this.getByte();
            const b1 = this.getByte();
            if (b0 === -1 || b1 === -1) {
                return -1;
            }
            return (b0 << 8) + b1;
        }
        getInt32() {
            const b0 = this.getByte();
            const b1 = this.getByte();
            const b2 = this.getByte();
            const b3 = this.getByte();
            return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
        }
        getBytes(length, forceClamped = false) {
            const bytes = this.bytes;
            const pos = this.pos;
            const strEnd = this.end;
            if (!length) {
                if (strEnd > this.progressiveDataLength) {
                    this.ensureRange(pos, strEnd);
                }
                const subarray = bytes.subarray(pos, strEnd);
                return forceClamped ? new Uint8ClampedArray(subarray) : subarray;
            }
            let end = pos + length;
            if (end > strEnd) {
                end = strEnd;
            }
            if (end > this.progressiveDataLength) {
                this.ensureRange(pos, end);
            }
            this.pos = end;
            const subarray = bytes.subarray(pos, end);
            return forceClamped ? new Uint8ClampedArray(subarray) : subarray;
        }
        peekByte() {
            const peekedByte = this.getByte();
            if (peekedByte !== -1) {
                this.pos--;
            }
            return peekedByte;
        }
        peekBytes(length, forceClamped = false) {
            const bytes = this.getBytes(length, forceClamped);
            this.pos -= bytes.length;
            return bytes;
        }
        getByteRange(begin, end) {
            if (begin < 0) {
                begin = 0;
            }
            if (end > this.end) {
                end = this.end;
            }
            if (end > this.progressiveDataLength) {
                this.ensureRange(begin, end);
            }
            return this.bytes.subarray(begin, end);
        }
        skip(n) {
            if (!n) {
                n = 1;
            }
            this.pos += n;
        }
        reset() {
            this.pos = this.start;
        }
        moveStart() {
            this.start = this.pos;
        }
        makeSubStream(start, length, dict) {
            if (length) {
                if (start + length > this.progressiveDataLength) {
                    this.ensureRange(start, start + length);
                }
            } else {
                if (start >= this.progressiveDataLength) {
                    this.ensureByte(start);
                }
            }
            function ChunkedStreamSubstream() {
            }
            ChunkedStreamSubstream.prototype = Object.create(this);
            ChunkedStreamSubstream.prototype.getMissingChunks = function () {
                const chunkSize = this.chunkSize;
                const beginChunk = Math.floor(this.start / chunkSize);
                const endChunk = Math.floor((this.end - 1) / chunkSize) + 1;
                const missingChunks = [];
                for (let chunk = beginChunk; chunk < endChunk; ++chunk) {
                    if (!this._loadedChunks.has(chunk)) {
                        missingChunks.push(chunk);
                    }
                }
                return missingChunks;
            };
            ChunkedStreamSubstream.prototype.allChunksLoaded = function () {
                if (this.numChunksLoaded === this.numChunks) {
                    return true;
                }
                return this.getMissingChunks().length === 0;
            };
            const subStream = new ChunkedStreamSubstream();
            subStream.pos = subStream.start = start;
            subStream.end = start + length || this.end;
            subStream.dict = dict;
            return subStream;
        }
    }
    class ChunkedStreamManager {
        constructor(pdfNetworkStream, args) {
            this.length = args.length;
            this.chunkSize = args.rangeChunkSize;
            this.stream = new ChunkedStream(this.length, this.chunkSize, this);
            this.pdfNetworkStream = pdfNetworkStream;
            this.disableAutoFetch = args.disableAutoFetch;
            this.msgHandler = args.msgHandler;
            this.currRequestId = 0;
            this._chunksNeededByRequest = new Map();
            this._requestsByChunk = new Map();
            this._promisesByRequest = new Map();
            this.progressiveDataLength = 0;
            this.aborted = false;
            this._loadedStreamCapability = a.createPromiseCapability();
        }
        onLoadedStream() {
            return this._loadedStreamCapability.promise;
        }
        sendRequest(begin, end) {
            const rangeReader = this.pdfNetworkStream.getRangeReader(begin, end);
            if (!rangeReader.isStreamingSupported) {
                rangeReader.onProgress = this.onProgress.bind(this);
            }
            let chunks = [], loaded = 0;
            const promise = new Promise((resolve, reject) => {
                const readChunk = chunk => {
                    try {
                        if (!chunk.done) {
                            const data = chunk.value;
                            chunks.push(data);
                            loaded += a.arrayByteLength(data);
                            if (rangeReader.isStreamingSupported) {
                                this.onProgress({ loaded });
                            }
                            rangeReader.read().then(readChunk, reject);
                            return;
                        }
                        const chunkData = a.arraysToBytes(chunks);
                        chunks = null;
                        resolve(chunkData);
                    } catch (e) {
                        reject(e);
                    }
                };
                rangeReader.read().then(readChunk, reject);
            });
            promise.then(data => {
                if (this.aborted) {
                    return;
                }
                this.onReceiveData({
                    chunk: data,
                    begin
                });
            });
        }
        requestAllChunks() {
            const missingChunks = this.stream.getMissingChunks();
            this._requestChunks(missingChunks);
            return this._loadedStreamCapability.promise;
        }
        _requestChunks(chunks) {
            const requestId = this.currRequestId++;
            const chunksNeeded = new Set();
            this._chunksNeededByRequest.set(requestId, chunksNeeded);
            for (const chunk of chunks) {
                if (!this.stream.hasChunk(chunk)) {
                    chunksNeeded.add(chunk);
                }
            }
            if (chunksNeeded.size === 0) {
                return Promise.resolve();
            }
            const capability = a.createPromiseCapability();
            this._promisesByRequest.set(requestId, capability);
            const chunksToRequest = [];
            for (const chunk of chunksNeeded) {
                let requestIds = this._requestsByChunk.get(chunk);
                if (!requestIds) {
                    requestIds = [];
                    this._requestsByChunk.set(chunk, requestIds);
                    chunksToRequest.push(chunk);
                }
                requestIds.push(requestId);
            }
            if (chunksToRequest.length > 0) {
                const groupedChunksToRequest = this.groupChunks(chunksToRequest);
                for (const groupedChunk of groupedChunksToRequest) {
                    const begin = groupedChunk.beginChunk * this.chunkSize;
                    const end = Math.min(groupedChunk.endChunk * this.chunkSize, this.length);
                    this.sendRequest(begin, end);
                }
            }
            return capability.promise.catch(reason => {
                if (this.aborted) {
                    return;
                }
                throw reason;
            });
        }
        getStream() {
            return this.stream;
        }
        requestRange(begin, end) {
            end = Math.min(end, this.length);
            const beginChunk = this.getBeginChunk(begin);
            const endChunk = this.getEndChunk(end);
            const chunks = [];
            for (let chunk = beginChunk; chunk < endChunk; ++chunk) {
                chunks.push(chunk);
            }
            return this._requestChunks(chunks);
        }
        requestRanges(ranges = []) {
            const chunksToRequest = [];
            for (const range of ranges) {
                const beginChunk = this.getBeginChunk(range.begin);
                const endChunk = this.getEndChunk(range.end);
                for (let chunk = beginChunk; chunk < endChunk; ++chunk) {
                    if (!chunksToRequest.includes(chunk)) {
                        chunksToRequest.push(chunk);
                    }
                }
            }
            chunksToRequest.sort(function (a, b) {
                return a - b;
            });
            return this._requestChunks(chunksToRequest);
        }
        groupChunks(chunks) {
            const groupedChunks = [];
            let beginChunk = -1;
            let prevChunk = -1;
            for (let i = 0, ii = chunks.length; i < ii; ++i) {
                const chunk = chunks[i];
                if (beginChunk < 0) {
                    beginChunk = chunk;
                }
                if (prevChunk >= 0 && prevChunk + 1 !== chunk) {
                    groupedChunks.push({
                        beginChunk,
                        endChunk: prevChunk + 1
                    });
                    beginChunk = chunk;
                }
                if (i + 1 === chunks.length) {
                    groupedChunks.push({
                        beginChunk,
                        endChunk: chunk + 1
                    });
                }
                prevChunk = chunk;
            }
            return groupedChunks;
        }
        onProgress(args) {
            this.msgHandler.send('DocProgress', {
                loaded: this.stream.numChunksLoaded * this.chunkSize + args.loaded,
                total: this.length
            });
        }
        onReceiveData(args) {
            const chunk = args.chunk;
            const isProgressive = args.begin === undefined;
            const begin = isProgressive ? this.progressiveDataLength : args.begin;
            const end = begin + chunk.byteLength;
            const beginChunk = Math.floor(begin / this.chunkSize);
            const endChunk = end < this.length ? Math.floor(end / this.chunkSize) : Math.ceil(end / this.chunkSize);
            if (isProgressive) {
                this.stream.onReceiveProgressiveData(chunk);
                this.progressiveDataLength = end;
            } else {
                this.stream.onReceiveData(begin, chunk);
            }
            if (this.stream.allChunksLoaded()) {
                this._loadedStreamCapability.resolve(this.stream);
            }
            const loadedRequests = [];
            for (let curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
                const requestIds = this._requestsByChunk.get(curChunk);
                if (!requestIds) {
                    continue;
                }
                this._requestsByChunk.delete(curChunk);
                for (const requestId of requestIds) {
                    const chunksNeeded = this._chunksNeededByRequest.get(requestId);
                    if (chunksNeeded.has(curChunk)) {
                        chunksNeeded.delete(curChunk);
                    }
                    if (chunksNeeded.size > 0) {
                        continue;
                    }
                    loadedRequests.push(requestId);
                }
            }
            if (!this.disableAutoFetch && this._requestsByChunk.size === 0) {
                let nextEmptyChunk;
                if (this.stream.numChunksLoaded === 1) {
                    const lastChunk = this.stream.numChunks - 1;
                    if (!this.stream.hasChunk(lastChunk)) {
                        nextEmptyChunk = lastChunk;
                    }
                } else {
                    nextEmptyChunk = this.stream.nextEmptyChunk(endChunk);
                }
                if (Number.isInteger(nextEmptyChunk)) {
                    this._requestChunks([nextEmptyChunk]);
                }
            }
            for (const requestId of loadedRequests) {
                const capability = this._promisesByRequest.get(requestId);
                this._promisesByRequest.delete(requestId);
                capability.resolve();
            }
            this.msgHandler.send('DocProgress', {
                loaded: this.stream.numChunksLoaded * this.chunkSize,
                total: this.length
            });
        }
        onError(err) {
            this._loadedStreamCapability.reject(err);
        }
        getBeginChunk(begin) {
            return Math.floor(begin / this.chunkSize);
        }
        getEndChunk(end) {
            return Math.floor((end - 1) / this.chunkSize) + 1;
        }
        abort(reason) {
            this.aborted = true;
            if (this.pdfNetworkStream) {
                this.pdfNetworkStream.cancelAllRequests(reason);
            }
            for (const capability of this._promisesByRequest.values()) {
                capability.reject(reason);
            }
        }
    }
    return {
        ChunkedStream,
        ChunkedStreamManager
    };
});