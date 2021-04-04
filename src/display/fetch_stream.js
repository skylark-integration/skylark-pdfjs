define([
    '../shared/util.js',
    './network_utils.js'
], function (a, b) {
    'use strict';
    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('MOZCENTRAL')) {
        throw new Error('Module "./fetch_stream.js" shall not be used with MOZCENTRAL builds.');
    }
    function createFetchOptions(headers, withCredentials, abortController) {
        return {
            method: 'GET',
            headers,
            signal: abortController && abortController.signal,
            mode: 'cors',
            credentials: withCredentials ? 'include' : 'same-origin',
            redirect: 'follow'
        };
    }
    function createHeaders(httpHeaders) {
        const headers = new Headers();
        for (const property in httpHeaders) {
            const value = httpHeaders[property];
            if (typeof value === 'undefined') {
                continue;
            }
            headers.append(property, value);
        }
        return headers;
    }
    class PDFFetchStream {
        constructor(source) {
            this.source = source;
            this.isHttp = /^https?:/i.test(source.url);
            this.httpHeaders = this.isHttp && source.httpHeaders || {};
            this._fullRequestReader = null;
            this._rangeRequestReaders = [];
        }
        get _progressiveDataLength() {
            return this._fullRequestReader ? this._fullRequestReader._loaded : 0;
        }
        getFullReader() {
            a.assert(!this._fullRequestReader, 'PDFFetchStream.getFullReader can only be called once.');
            this._fullRequestReader = new PDFFetchStreamReader(this);
            return this._fullRequestReader;
        }
        getRangeReader(begin, end) {
            if (end <= this._progressiveDataLength) {
                return null;
            }
            const reader = new PDFFetchStreamRangeReader(this, begin, end);
            this._rangeRequestReaders.push(reader);
            return reader;
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
    class PDFFetchStreamReader {
        constructor(stream) {
            this._stream = stream;
            this._reader = null;
            this._loaded = 0;
            this._filename = null;
            const source = stream.source;
            this._withCredentials = source.withCredentials || false;
            this._contentLength = source.length;
            this._headersCapability = a.createPromiseCapability();
            this._disableRange = source.disableRange || false;
            this._rangeChunkSize = source.rangeChunkSize;
            if (!this._rangeChunkSize && !this._disableRange) {
                this._disableRange = true;
            }
            if (typeof AbortController !== 'undefined') {
                this._abortController = new AbortController();
            }
            this._isStreamingSupported = !source.disableStream;
            this._isRangeSupported = !source.disableRange;
            this._headers = createHeaders(this._stream.httpHeaders);
            const url = source.url;
            fetch(url, createFetchOptions(this._headers, this._withCredentials, this._abortController)).then(response => {
                if (!b.validateResponseStatus(response.status)) {
                    throw b.createResponseStatusError(response.status, url);
                }
                this._reader = response.body.getReader();
                this._headersCapability.resolve();
                const getResponseHeader = name => {
                    return response.headers.get(name);
                };
                const {allowRangeRequests, suggestedLength} = b.validateRangeRequestCapabilities({
                    getResponseHeader,
                    isHttp: this._stream.isHttp,
                    rangeChunkSize: this._rangeChunkSize,
                    disableRange: this._disableRange
                });
                this._isRangeSupported = allowRangeRequests;
                this._contentLength = suggestedLength || this._contentLength;
                this._filename = b.extractFilenameFromHeader(getResponseHeader);
                if (!this._isStreamingSupported && this._isRangeSupported) {
                    this.cancel(new a.AbortException('Streaming is disabled.'));
                }
            }).catch(this._headersCapability.reject);
            this.onProgress = null;
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
            await this._headersCapability.promise;
            const {value, done} = await this._reader.read();
            if (done) {
                return {
                    value,
                    done
                };
            }
            this._loaded += value.byteLength;
            if (this.onProgress) {
                this.onProgress({
                    loaded: this._loaded,
                    total: this._contentLength
                });
            }
            const buffer = new Uint8Array(value).buffer;
            return {
                value: buffer,
                done: false
            };
        }
        cancel(reason) {
            if (this._reader) {
                this._reader.cancel(reason);
            }
            if (this._abortController) {
                this._abortController.abort();
            }
        }
    }
    class PDFFetchStreamRangeReader {
        constructor(stream, begin, end) {
            this._stream = stream;
            this._reader = null;
            this._loaded = 0;
            const source = stream.source;
            this._withCredentials = source.withCredentials || false;
            this._readCapability = a.createPromiseCapability();
            this._isStreamingSupported = !source.disableStream;
            if (typeof AbortController !== 'undefined') {
                this._abortController = new AbortController();
            }
            this._headers = createHeaders(this._stream.httpHeaders);
            this._headers.append('Range', `bytes=${ begin }-${ end - 1 }`);
            const url = source.url;
            fetch(url, createFetchOptions(this._headers, this._withCredentials, this._abortController)).then(response => {
                if (!b.validateResponseStatus(response.status)) {
                    throw b.createResponseStatusError(response.status, url);
                }
                this._readCapability.resolve();
                this._reader = response.body.getReader();
            }).catch(reason => {
                if (reason && reason.name === 'AbortError') {
                    return;
                }
                throw reason;
            });
            this.onProgress = null;
        }
        get isStreamingSupported() {
            return this._isStreamingSupported;
        }
        async read() {
            await this._readCapability.promise;
            const {value, done} = await this._reader.read();
            if (done) {
                return {
                    value,
                    done
                };
            }
            this._loaded += value.byteLength;
            if (this.onProgress) {
                this.onProgress({ loaded: this._loaded });
            }
            const buffer = new Uint8Array(value).buffer;
            return {
                value: buffer,
                done: false
            };
        }
        cancel(reason) {
            if (this._reader) {
                this._reader.cancel(reason);
            }
            if (this._abortController) {
                this._abortController.abort();
            }
        }
    }
    return { PDFFetchStream };
});