define([
    '../shared/util.js',
    './chunked_stream.js',
    './core_utils.js',
    './document.js',
    './stream.js'
], function (a, b, c, d, e) {
    'use strict';
    class BasePdfManager {
        constructor() {
            if (this.constructor === BasePdfManager) {
                a.unreachable('Cannot initialize BasePdfManager.');
            }
        }
        get docId() {
            return this._docId;
        }
        get password() {
            return this._password;
        }
        get docBaseUrl() {
            let docBaseUrl = null;
            if (this._docBaseUrl) {
                const absoluteUrl = a.createValidAbsoluteUrl(this._docBaseUrl);
                if (absoluteUrl) {
                    docBaseUrl = absoluteUrl.href;
                } else {
                    a.warn(`Invalid absolute docBaseUrl: "${ this._docBaseUrl }".`);
                }
            }
            return a.shadow(this, 'docBaseUrl', docBaseUrl);
        }
        onLoadedStream() {
            a.unreachable('Abstract method `onLoadedStream` called');
        }
        ensureDoc(prop, args) {
            return this.ensure(this.pdfDocument, prop, args);
        }
        ensureXRef(prop, args) {
            return this.ensure(this.pdfDocument.xref, prop, args);
        }
        ensureCatalog(prop, args) {
            return this.ensure(this.pdfDocument.catalog, prop, args);
        }
        getPage(pageIndex) {
            return this.pdfDocument.getPage(pageIndex);
        }
        fontFallback(id, handler) {
            return this.pdfDocument.fontFallback(id, handler);
        }
        cleanup(manuallyTriggered = false) {
            return this.pdfDocument.cleanup(manuallyTriggered);
        }
        async ensure(obj, prop, args) {
            a.unreachable('Abstract method `ensure` called');
        }
        requestRange(begin, end) {
            a.unreachable('Abstract method `requestRange` called');
        }
        requestLoadedStream() {
            a.unreachable('Abstract method `requestLoadedStream` called');
        }
        sendProgressiveData(chunk) {
            a.unreachable('Abstract method `sendProgressiveData` called');
        }
        updatePassword(password) {
            this._password = password;
        }
        terminate(reason) {
            a.unreachable('Abstract method `terminate` called');
        }
    }
    class LocalPdfManager extends BasePdfManager {
        constructor(docId, data, password, evaluatorOptions, docBaseUrl) {
            super();
            this._docId = docId;
            this._password = password;
            this._docBaseUrl = docBaseUrl;
            this.evaluatorOptions = evaluatorOptions;
            const stream = new e.Stream(data);
            this.pdfDocument = new d.PDFDocument(this, stream);
            this._loadedStreamPromise = Promise.resolve(stream);
        }
        async ensure(obj, prop, args) {
            const value = obj[prop];
            if (typeof value === 'function') {
                return value.apply(obj, args);
            }
            return value;
        }
        requestRange(begin, end) {
            return Promise.resolve();
        }
        requestLoadedStream() {
        }
        onLoadedStream() {
            return this._loadedStreamPromise;
        }
        terminate(reason) {
        }
    }
    class NetworkPdfManager extends BasePdfManager {
        constructor(docId, pdfNetworkStream, args, evaluatorOptions, docBaseUrl) {
            super();
            this._docId = docId;
            this._password = args.password;
            this._docBaseUrl = docBaseUrl;
            this.msgHandler = args.msgHandler;
            this.evaluatorOptions = evaluatorOptions;
            this.streamManager = new b.ChunkedStreamManager(pdfNetworkStream, {
                msgHandler: args.msgHandler,
                length: args.length,
                disableAutoFetch: args.disableAutoFetch,
                rangeChunkSize: args.rangeChunkSize
            });
            this.pdfDocument = new d.PDFDocument(this, this.streamManager.getStream());
        }
        async ensure(obj, prop, args) {
            try {
                const value = obj[prop];
                if (typeof value === 'function') {
                    return value.apply(obj, args);
                }
                return value;
            } catch (ex) {
                if (!(ex instanceof c.MissingDataException)) {
                    throw ex;
                }
                await this.requestRange(ex.begin, ex.end);
                return this.ensure(obj, prop, args);
            }
        }
        requestRange(begin, end) {
            return this.streamManager.requestRange(begin, end);
        }
        requestLoadedStream() {
            this.streamManager.requestAllChunks();
        }
        sendProgressiveData(chunk) {
            this.streamManager.onReceiveData({ chunk });
        }
        onLoadedStream() {
            return this.streamManager.onLoadedStream();
        }
        terminate(reason) {
            this.streamManager.abort(reason);
        }
    }
    return {
        LocalPdfManager,
        NetworkPdfManager
    };
});