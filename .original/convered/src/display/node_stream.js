define([
    '../shared/util.js',
    './network_utils.js'
], function (a, b) {
    'use strict';
    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('MOZCENTRAL')) {
        throw new Error('Module "./node_stream.js" shall not be used with MOZCENTRAL builds.');
    }
    const fs = __non_webpack_require__('fs');
    const http = __non_webpack_require__('http');
    const https = __non_webpack_require__('https');
    const url = __non_webpack_require__('url');
    const fileUriRegex = /^file:\/\/\/[a-zA-Z]:\//;
    function parseUrl(sourceUrl) {
        const parsedUrl = url.parse(sourceUrl);
        if (parsedUrl.protocol === 'file:' || parsedUrl.host) {
            return parsedUrl;
        }
        if (/^[a-z]:[/\\]/i.test(sourceUrl)) {
            return url.parse(`file:///${ sourceUrl }`);
        }
        if (!parsedUrl.host) {
            parsedUrl.protocol = 'file:';
        }
        return parsedUrl;
    }
    class PDFNodeStream {
        constructor(source) {
            this.source = source;
            this.url = parseUrl(source.url);
            this.isHttp = this.url.protocol === 'http:' || this.url.protocol === 'https:';
            this.isFsUrl = this.url.protocol === 'file:';
            this.httpHeaders = this.isHttp && source.httpHeaders || {};
            this._fullRequestReader = null;
            this._rangeRequestReaders = [];
        }
        get _progressiveDataLength() {
            return this._fullRequestReader ? this._fullRequestReader._loaded : 0;
        }
        getFullReader() {
            a.assert(!this._fullRequestReader, 'PDFNodeStream.getFullReader can only be called once.');
            this._fullRequestReader = this.isFsUrl ? new PDFNodeStreamFsFullReader(this) : new PDFNodeStreamFullReader(this);
            return this._fullRequestReader;
        }
        getRangeReader(start, end) {
            if (end <= this._progressiveDataLength) {
                return null;
            }
            const rangeReader = this.isFsUrl ? new PDFNodeStreamFsRangeReader(this, start, end) : new PDFNodeStreamRangeReader(this, start, end);
            this._rangeRequestReaders.push(rangeReader);
            return rangeReader;
        }
        cancelAllRequests(reason) {
            if (this._fullRequestReader) {
                this._fullRequestReader.cancel(reason);
            }
            const readers = this._rangeRequestReaders.slice(0);
            readers.forEach(function (reader) {
                reader.cancel(reason);
            });
        }
    }
    class BaseFullReader {
        constructor(stream) {
            this._url = stream.url;
            this._done = false;
            this._storedError = null;
            this.onProgress = null;
            const source = stream.source;
            this._contentLength = source.length;
            this._loaded = 0;
            this._filename = null;
            this._disableRange = source.disableRange || false;
            this._rangeChunkSize = source.rangeChunkSize;
            if (!this._rangeChunkSize && !this._disableRange) {
                this._disableRange = true;
            }
            this._isStreamingSupported = !source.disableStream;
            this._isRangeSupported = !source.disableRange;
            this._readableStream = null;
            this._readCapability = a.createPromiseCapability();
            this._headersCapability = a.createPromiseCapability();
        }
        get headersReady() {
            return this._headersCapability.promise;
        }
        get filename() {
            return this._filename;
        }
        get contentLength() {
            return this._contentLength;
        }
        get isRangeSupported() {
            return this._isRangeSupported;
        }
        get isStreamingSupported() {
            return this._isStreamingSupported;
        }
        async read() {
            await this._readCapability.promise;
            if (this._done) {
                return {
                    value: undefined,
                    done: true
                };
            }
            if (this._storedError) {
                throw this._storedError;
            }
            const chunk = this._readableStream.read();
            if (chunk === null) {
                this._readCapability = a.createPromiseCapability();
                return this.read();
            }
            this._loaded += chunk.length;
            if (this.onProgress) {
                this.onProgress({
                    loaded: this._loaded,
                    total: this._contentLength
                });
            }
            const buffer = new Uint8Array(chunk).buffer;
            return {
                value: buffer,
                done: false
            };
        }
        cancel(reason) {
            if (!this._readableStream) {
                this._error(reason);
                return;
            }
            this._readableStream.destroy(reason);
        }
        _error(reason) {
            this._storedError = reason;
            this._readCapability.resolve();
        }
        _setReadableStream(readableStream) {
            this._readableStream = readableStream;
            readableStream.on('readable', () => {
                this._readCapability.resolve();
            });
            readableStream.on('end', () => {
                readableStream.destroy();
                this._done = true;
                this._readCapability.resolve();
            });
            readableStream.on('error', reason => {
                this._error(reason);
            });
            if (!this._isStreamingSupported && this._isRangeSupported) {
                this._error(new a.AbortException('streaming is disabled'));
            }
            if (this._storedError) {
                this._readableStream.destroy(this._storedError);
            }
        }
    }
    class BaseRangeReader {
        constructor(stream) {
            this._url = stream.url;
            this._done = false;
            this._storedError = null;
            this.onProgress = null;
            this._loaded = 0;
            this._readableStream = null;
            this._readCapability = a.createPromiseCapability();
            const source = stream.source;
            this._isStreamingSupported = !source.disableStream;
        }
        get isStreamingSupported() {
            return this._isStreamingSupported;
        }
        async read() {
            await this._readCapability.promise;
            if (this._done) {
                return {
                    value: undefined,
                    done: true
                };
            }
            if (this._storedError) {
                throw this._storedError;
            }
            const chunk = this._readableStream.read();
            if (chunk === null) {
                this._readCapability = a.createPromiseCapability();
                return this.read();
            }
            this._loaded += chunk.length;
            if (this.onProgress) {
                this.onProgress({ loaded: this._loaded });
            }
            const buffer = new Uint8Array(chunk).buffer;
            return {
                value: buffer,
                done: false
            };
        }
        cancel(reason) {
            if (!this._readableStream) {
                this._error(reason);
                return;
            }
            this._readableStream.destroy(reason);
        }
        _error(reason) {
            this._storedError = reason;
            this._readCapability.resolve();
        }
        _setReadableStream(readableStream) {
            this._readableStream = readableStream;
            readableStream.on('readable', () => {
                this._readCapability.resolve();
            });
            readableStream.on('end', () => {
                readableStream.destroy();
                this._done = true;
                this._readCapability.resolve();
            });
            readableStream.on('error', reason => {
                this._error(reason);
            });
            if (this._storedError) {
                this._readableStream.destroy(this._storedError);
            }
        }
    }
    function createRequestOptions(parsedUrl, headers) {
        return {
            protocol: parsedUrl.protocol,
            auth: parsedUrl.auth,
            host: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.path,
            method: 'GET',
            headers
        };
    }
    class PDFNodeStreamFullReader extends BaseFullReader {
        constructor(stream) {
            super(stream);
            const handleResponse = response => {
                if (response.statusCode === 404) {
                    const error = new a.MissingPDFException(`Missing PDF "${ this._url }".`);
                    this._storedError = error;
                    this._headersCapability.reject(error);
                    return;
                }
                this._headersCapability.resolve();
                this._setReadableStream(response);
                const getResponseHeader = name => {
                    return this._readableStream.headers[name.toLowerCase()];
                };
                const {allowRangeRequests, suggestedLength} = b.validateRangeRequestCapabilities({
                    getResponseHeader,
                    isHttp: stream.isHttp,
                    rangeChunkSize: this._rangeChunkSize,
                    disableRange: this._disableRange
                });
                this._isRangeSupported = allowRangeRequests;
                this._contentLength = suggestedLength || this._contentLength;
                this._filename = b.extractFilenameFromHeader(getResponseHeader);
            };
            this._request = null;
            if (this._url.protocol === 'http:') {
                this._request = http.request(createRequestOptions(this._url, stream.httpHeaders), handleResponse);
            } else {
                this._request = https.request(createRequestOptions(this._url, stream.httpHeaders), handleResponse);
            }
            this._request.on('error', reason => {
                this._storedError = reason;
                this._headersCapability.reject(reason);
            });
            this._request.end();
        }
    }
    class PDFNodeStreamRangeReader extends BaseRangeReader {
        constructor(stream, start, end) {
            super(stream);
            this._httpHeaders = {};
            for (const property in stream.httpHeaders) {
                const value = stream.httpHeaders[property];
                if (typeof value === 'undefined') {
                    continue;
                }
                this._httpHeaders[property] = value;
            }
            this._httpHeaders.Range = `bytes=${ start }-${ end - 1 }`;
            const handleResponse = response => {
                if (response.statusCode === 404) {
                    const error = new a.MissingPDFException(`Missing PDF "${ this._url }".`);
                    this._storedError = error;
                    return;
                }
                this._setReadableStream(response);
            };
            this._request = null;
            if (this._url.protocol === 'http:') {
                this._request = http.request(createRequestOptions(this._url, this._httpHeaders), handleResponse);
            } else {
                this._request = https.request(createRequestOptions(this._url, this._httpHeaders), handleResponse);
            }
            this._request.on('error', reason => {
                this._storedError = reason;
            });
            this._request.end();
        }
    }
    class PDFNodeStreamFsFullReader extends BaseFullReader {
        constructor(stream) {
            super(stream);
            let path = decodeURIComponent(this._url.path);
            if (fileUriRegex.test(this._url.href)) {
                path = path.replace(/^\//, '');
            }
            fs.lstat(path, (error, stat) => {
                if (error) {
                    if (error.code === 'ENOENT') {
                        error = new a.MissingPDFException(`Missing PDF "${ path }".`);
                    }
                    this._storedError = error;
                    this._headersCapability.reject(error);
                    return;
                }
                this._contentLength = stat.size;
                this._setReadableStream(fs.createReadStream(path));
                this._headersCapability.resolve();
            });
        }
    }
    class PDFNodeStreamFsRangeReader extends BaseRangeReader {
        constructor(stream, start, end) {
            super(stream);
            let path = decodeURIComponent(this._url.path);
            if (fileUriRegex.test(this._url.href)) {
                path = path.replace(/^\//, '');
            }
            this._setReadableStream(fs.createReadStream(path, {
                start,
                end: end - 1
            }));
        }
    }
    return { PDFNodeStream };
});