define(function () {
    'use strict';
    class IPDFStream {
        getFullReader() {
            return null;
        }
        getRangeReader(begin, end) {
            return null;
        }
        cancelAllRequests(reason) {
        }
    }
    class IPDFStreamReader {
        constructor() {
            this.onProgress = null;
        }
        get headersReady() {
            return Promise.resolve();
        }
        get filename() {
            return null;
        }
        get contentLength() {
            return 0;
        }
        get isRangeSupported() {
            return false;
        }
        get isStreamingSupported() {
            return false;
        }
        async read() {
        }
        cancel(reason) {
        }
    }
    class IPDFStreamRangeReader {
        constructor() {
            this.onProgress = null;
        }
        get isStreamingSupported() {
            return false;
        }
        async read() {
        }
        cancel(reason) {
        }
    }
    return {
        IPDFStream,
        IPDFStreamRangeReader,
        IPDFStreamReader
    };
});