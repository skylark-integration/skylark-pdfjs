define([
    '../shared/util.js',
    './display_utils.js',
    './font_loader.js',
    './node_utils.js',
    './annotation_storage.js',
    './api_compatibility.js',
    './canvas.js',
    './worker_options.js',
    '../shared/is_node.js',
    '../shared/message_handler.js',
    './metadata.js',
    './optional_content_config.js',
    './transport_stream.js',
    './webgl.js'
], function (a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
    'use strict';
    const DEFAULT_RANGE_CHUNK_SIZE = 65536;
    const RENDERING_CANCELLED_TIMEOUT = 100;
    const DefaultCanvasFactory = (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) && i.isNodeJS ? d.NodeCanvasFactory : b.DOMCanvasFactory;
    const DefaultCMapReaderFactory = (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) && i.isNodeJS ? d.NodeCMapReaderFactory : b.DOMCMapReaderFactory;
    let createPDFNetworkStream;
    function setPDFNetworkStreamFactory(pdfNetworkStreamFactory) {
        createPDFNetworkStream = pdfNetworkStreamFactory;
    }
    function getDocument(src) {
        const task = new PDFDocumentLoadingTask();
        let source;
        if (typeof src === 'string') {
            source = { url: src };
        } else if (a.isArrayBuffer(src)) {
            source = { data: src };
        } else if (src instanceof PDFDataRangeTransport) {
            source = { range: src };
        } else {
            if (typeof src !== 'object') {
                throw new Error('Invalid parameter in getDocument, ' + 'need either Uint8Array, string or a parameter object');
            }
            if (!src.url && !src.data && !src.range) {
                throw new Error('Invalid parameter object: need either .data, .range or .url');
            }
            source = src;
        }
        const params = Object.create(null);
        let rangeTransport = null, worker = null;
        for (const key in source) {
            if (key === 'url' && typeof window !== 'undefined') {
                params[key] = new URL(source[key], window.location).href;
                continue;
            } else if (key === 'range') {
                rangeTransport = source[key];
                continue;
            } else if (key === 'worker') {
                worker = source[key];
                continue;
            } else if (key === 'data' && !(source[key] instanceof Uint8Array)) {
                const pdfBytes = source[key];
                if (typeof pdfBytes === 'string') {
                    params[key] = a.stringToBytes(pdfBytes);
                } else if (typeof pdfBytes === 'object' && pdfBytes !== null && !isNaN(pdfBytes.length)) {
                    params[key] = new Uint8Array(pdfBytes);
                } else if (a.isArrayBuffer(pdfBytes)) {
                    params[key] = new Uint8Array(pdfBytes);
                } else {
                    throw new Error('Invalid PDF binary data: either typed array, ' + 'string or array-like object is expected in the ' + 'data property.');
                }
                continue;
            }
            params[key] = source[key];
        }
        params.rangeChunkSize = params.rangeChunkSize || DEFAULT_RANGE_CHUNK_SIZE;
        params.CMapReaderFactory = params.CMapReaderFactory || DefaultCMapReaderFactory;
        params.ignoreErrors = params.stopAtErrors !== true;
        params.fontExtraProperties = params.fontExtraProperties === true;
        params.pdfBug = params.pdfBug === true;
        if (!Number.isInteger(params.maxImageSize)) {
            params.maxImageSize = -1;
        }
        if (typeof params.isEvalSupported !== 'boolean') {
            params.isEvalSupported = true;
        }
        if (typeof params.disableFontFace !== 'boolean') {
            params.disableFontFace = f.apiCompatibilityParams.disableFontFace || false;
        }
        if (typeof params.ownerDocument === 'undefined') {
            params.ownerDocument = globalThis.document;
        }
        if (typeof params.disableRange !== 'boolean') {
            params.disableRange = false;
        }
        if (typeof params.disableStream !== 'boolean') {
            params.disableStream = false;
        }
        if (typeof params.disableAutoFetch !== 'boolean') {
            params.disableAutoFetch = false;
        }
        a.setVerbosityLevel(params.verbosity);
        if (!worker) {
            const workerParams = {
                verbosity: params.verbosity,
                port: h.GlobalWorkerOptions.workerPort
            };
            worker = workerParams.port ? PDFWorker.fromPort(workerParams) : new PDFWorker(workerParams);
            task._worker = worker;
        }
        const docId = task.docId;
        worker.promise.then(function () {
            if (task.destroyed) {
                throw new Error('Loading aborted');
            }
            const workerIdPromise = _fetchDocument(worker, params, rangeTransport, docId);
            const networkStreamPromise = new Promise(function (resolve) {
                let networkStream;
                if (rangeTransport) {
                    networkStream = new m.PDFDataTransportStream({
                        length: params.length,
                        initialData: params.initialData,
                        progressiveDone: params.progressiveDone,
                        disableRange: params.disableRange,
                        disableStream: params.disableStream
                    }, rangeTransport);
                } else if (!params.data) {
                    networkStream = createPDFNetworkStream({
                        url: params.url,
                        length: params.length,
                        httpHeaders: params.httpHeaders,
                        withCredentials: params.withCredentials,
                        rangeChunkSize: params.rangeChunkSize,
                        disableRange: params.disableRange,
                        disableStream: params.disableStream
                    });
                }
                resolve(networkStream);
            });
            return Promise.all([
                workerIdPromise,
                networkStreamPromise
            ]).then(function ([workerId, networkStream]) {
                if (task.destroyed) {
                    throw new Error('Loading aborted');
                }
                const messageHandler = new j.MessageHandler(docId, workerId, worker.port);
                messageHandler.postMessageTransfers = worker.postMessageTransfers;
                const transport = new WorkerTransport(messageHandler, task, networkStream, params);
                task._transport = transport;
                messageHandler.send('Ready', null);
            });
        }).catch(task._capability.reject);
        return task;
    }
    function _fetchDocument(worker, source, pdfDataRangeTransport, docId) {
        if (worker.destroyed) {
            return Promise.reject(new Error('Worker was destroyed'));
        }
        if (pdfDataRangeTransport) {
            source.length = pdfDataRangeTransport.length;
            source.initialData = pdfDataRangeTransport.initialData;
            source.progressiveDone = pdfDataRangeTransport.progressiveDone;
        }
        return worker.messageHandler.sendWithPromise('GetDocRequest', {
            docId,
            apiVersion: typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('TESTING') ? PDFJSDev.eval('BUNDLE_VERSION') : null,
            source: {
                data: source.data,
                url: source.url,
                password: source.password,
                disableAutoFetch: source.disableAutoFetch,
                rangeChunkSize: source.rangeChunkSize,
                length: source.length
            },
            maxImageSize: source.maxImageSize,
            disableFontFace: source.disableFontFace,
            postMessageTransfers: worker.postMessageTransfers,
            docBaseUrl: source.docBaseUrl,
            ignoreErrors: source.ignoreErrors,
            isEvalSupported: source.isEvalSupported,
            fontExtraProperties: source.fontExtraProperties
        }).then(function (workerId) {
            if (worker.destroyed) {
                throw new Error('Worker was destroyed');
            }
            return workerId;
        });
    }
    const PDFDocumentLoadingTask = function PDFDocumentLoadingTaskClosure() {
        let nextDocumentId = 0;
        class PDFDocumentLoadingTask {
            constructor() {
                this._capability = a.createPromiseCapability();
                this._transport = null;
                this._worker = null;
                this.docId = 'd' + nextDocumentId++;
                this.destroyed = false;
                this.onPassword = null;
                this.onProgress = null;
                this.onUnsupportedFeature = null;
            }
            get promise() {
                return this._capability.promise;
            }
            destroy() {
                this.destroyed = true;
                const transportDestroyed = !this._transport ? Promise.resolve() : this._transport.destroy();
                return transportDestroyed.then(() => {
                    this._transport = null;
                    if (this._worker) {
                        this._worker.destroy();
                        this._worker = null;
                    }
                });
            }
        }
        return PDFDocumentLoadingTask;
    }();
    class PDFDataRangeTransport {
        constructor(length, initialData, progressiveDone = false) {
            this.length = length;
            this.initialData = initialData;
            this.progressiveDone = progressiveDone;
            this._rangeListeners = [];
            this._progressListeners = [];
            this._progressiveReadListeners = [];
            this._progressiveDoneListeners = [];
            this._readyCapability = a.createPromiseCapability();
        }
        addRangeListener(listener) {
            this._rangeListeners.push(listener);
        }
        addProgressListener(listener) {
            this._progressListeners.push(listener);
        }
        addProgressiveReadListener(listener) {
            this._progressiveReadListeners.push(listener);
        }
        addProgressiveDoneListener(listener) {
            this._progressiveDoneListeners.push(listener);
        }
        onDataRange(begin, chunk) {
            for (const listener of this._rangeListeners) {
                listener(begin, chunk);
            }
        }
        onDataProgress(loaded, total) {
            this._readyCapability.promise.then(() => {
                for (const listener of this._progressListeners) {
                    listener(loaded, total);
                }
            });
        }
        onDataProgressiveRead(chunk) {
            this._readyCapability.promise.then(() => {
                for (const listener of this._progressiveReadListeners) {
                    listener(chunk);
                }
            });
        }
        onDataProgressiveDone() {
            this._readyCapability.promise.then(() => {
                for (const listener of this._progressiveDoneListeners) {
                    listener();
                }
            });
        }
        transportReady() {
            this._readyCapability.resolve();
        }
        requestDataRange(begin, end) {
            a.unreachable('Abstract method PDFDataRangeTransport.requestDataRange');
        }
        abort() {
        }
    }
    class PDFDocumentProxy {
        constructor(pdfInfo, transport) {
            this._pdfInfo = pdfInfo;
            this._transport = transport;
        }
        get annotationStorage() {
            return a.shadow(this, 'annotationStorage', new e.AnnotationStorage());
        }
        get numPages() {
            return this._pdfInfo.numPages;
        }
        get fingerprint() {
            return this._pdfInfo.fingerprint;
        }
        getPage(pageNumber) {
            return this._transport.getPage(pageNumber);
        }
        getPageIndex(ref) {
            return this._transport.getPageIndex(ref);
        }
        getDestinations() {
            return this._transport.getDestinations();
        }
        getDestination(id) {
            return this._transport.getDestination(id);
        }
        getPageLabels() {
            return this._transport.getPageLabels();
        }
        getPageLayout() {
            return this._transport.getPageLayout();
        }
        getPageMode() {
            return this._transport.getPageMode();
        }
        getViewerPreferences() {
            return this._transport.getViewerPreferences();
        }
        getOpenAction() {
            return this._transport.getOpenAction();
        }
        getAttachments() {
            return this._transport.getAttachments();
        }
        getJavaScript() {
            return this._transport.getJavaScript();
        }
        getJSActions() {
            return this._transport.getDocJSActions();
        }
        getOutline() {
            return this._transport.getOutline();
        }
        getOptionalContentConfig() {
            return this._transport.getOptionalContentConfig();
        }
        getPermissions() {
            return this._transport.getPermissions();
        }
        getMetadata() {
            return this._transport.getMetadata();
        }
        getMarkInfo() {
            return this._transport.getMarkInfo();
        }
        getData() {
            return this._transport.getData();
        }
        getDownloadInfo() {
            return this._transport.downloadInfoCapability.promise;
        }
        getStats() {
            return this._transport.getStats();
        }
        cleanup() {
            return this._transport.startCleanup();
        }
        destroy() {
            return this.loadingTask.destroy();
        }
        get loadingParams() {
            return this._transport.loadingParams;
        }
        get loadingTask() {
            return this._transport.loadingTask;
        }
        saveDocument(annotationStorage) {
            return this._transport.saveDocument(annotationStorage);
        }
        getFieldObjects() {
            return this._transport.getFieldObjects();
        }
        hasJSActions() {
            return this._transport.hasJSActions();
        }
        getCalculationOrderIds() {
            return this._transport.getCalculationOrderIds();
        }
    }
    class PDFPageProxy {
        constructor(pageIndex, pageInfo, transport, ownerDocument, pdfBug = false) {
            this._pageIndex = pageIndex;
            this._pageInfo = pageInfo;
            this._ownerDocument = ownerDocument;
            this._transport = transport;
            this._stats = pdfBug ? new b.StatTimer() : null;
            this._pdfBug = pdfBug;
            this.commonObjs = transport.commonObjs;
            this.objs = new PDFObjects();
            this.cleanupAfterRender = false;
            this.pendingCleanup = false;
            this._intentStates = new Map();
            this.destroyed = false;
        }
        get pageNumber() {
            return this._pageIndex + 1;
        }
        get rotate() {
            return this._pageInfo.rotate;
        }
        get ref() {
            return this._pageInfo.ref;
        }
        get userUnit() {
            return this._pageInfo.userUnit;
        }
        get view() {
            return this._pageInfo.view;
        }
        getViewport({scale, rotation = this.rotate, offsetX = 0, offsetY = 0, dontFlip = false} = {}) {
            return new b.PageViewport({
                viewBox: this.view,
                scale,
                rotation,
                offsetX,
                offsetY,
                dontFlip
            });
        }
        getAnnotations({
            intent = null
        } = {}) {
            if (!this.annotationsPromise || this.annotationsIntent !== intent) {
                this.annotationsPromise = this._transport.getAnnotations(this._pageIndex, intent);
                this.annotationsIntent = intent;
            }
            return this.annotationsPromise;
        }
        getJSActions() {
            return this._jsActionsPromise = this._jsActionsPromise || this._transport.getPageJSActions(this._pageIndex);
        }
        render({canvasContext, viewport, intent = 'display', enableWebGL = false, renderInteractiveForms = false, transform = null, imageLayer = null, canvasFactory = null, background = null, annotationStorage = null, optionalContentConfigPromise = null}) {
            if (this._stats) {
                this._stats.time('Overall');
            }
            const renderingIntent = intent === 'print' ? 'print' : 'display';
            this.pendingCleanup = false;
            if (!optionalContentConfigPromise) {
                optionalContentConfigPromise = this._transport.getOptionalContentConfig();
            }
            let intentState = this._intentStates.get(renderingIntent);
            if (!intentState) {
                intentState = Object.create(null);
                this._intentStates.set(renderingIntent, intentState);
            }
            if (intentState.streamReaderCancelTimeout) {
                clearTimeout(intentState.streamReaderCancelTimeout);
                intentState.streamReaderCancelTimeout = null;
            }
            const canvasFactoryInstance = canvasFactory || new DefaultCanvasFactory({ ownerDocument: this._ownerDocument });
            const webGLContext = new n.WebGLContext({ enable: enableWebGL });
            if (!intentState.displayReadyCapability) {
                intentState.displayReadyCapability = a.createPromiseCapability();
                intentState.operatorList = {
                    fnArray: [],
                    argsArray: [],
                    lastChunk: false
                };
                if (this._stats) {
                    this._stats.time('Page Request');
                }
                this._pumpOperatorList({
                    pageIndex: this._pageIndex,
                    intent: renderingIntent,
                    renderInteractiveForms: renderInteractiveForms === true,
                    annotationStorage: annotationStorage && annotationStorage.getAll() || null
                });
            }
            const complete = error => {
                const i = intentState.renderTasks.indexOf(internalRenderTask);
                if (i >= 0) {
                    intentState.renderTasks.splice(i, 1);
                }
                if (this.cleanupAfterRender || renderingIntent === 'print') {
                    this.pendingCleanup = true;
                }
                this._tryCleanup();
                if (error) {
                    internalRenderTask.capability.reject(error);
                    this._abortOperatorList({
                        intentState,
                        reason: error
                    });
                } else {
                    internalRenderTask.capability.resolve();
                }
                if (this._stats) {
                    this._stats.timeEnd('Rendering');
                    this._stats.timeEnd('Overall');
                }
            };
            const internalRenderTask = new InternalRenderTask({
                callback: complete,
                params: {
                    canvasContext,
                    viewport,
                    transform,
                    imageLayer,
                    background
                },
                objs: this.objs,
                commonObjs: this.commonObjs,
                operatorList: intentState.operatorList,
                pageIndex: this._pageIndex,
                canvasFactory: canvasFactoryInstance,
                webGLContext,
                useRequestAnimationFrame: renderingIntent !== 'print',
                pdfBug: this._pdfBug
            });
            if (!intentState.renderTasks) {
                intentState.renderTasks = [];
            }
            intentState.renderTasks.push(internalRenderTask);
            const renderTask = internalRenderTask.task;
            Promise.all([
                intentState.displayReadyCapability.promise,
                optionalContentConfigPromise
            ]).then(([transparency, optionalContentConfig]) => {
                if (this.pendingCleanup) {
                    complete();
                    return;
                }
                if (this._stats) {
                    this._stats.time('Rendering');
                }
                internalRenderTask.initializeGraphics({
                    transparency,
                    optionalContentConfig
                });
                internalRenderTask.operatorListChanged();
            }).catch(complete);
            return renderTask;
        }
        getOperatorList() {
            function operatorListChanged() {
                if (intentState.operatorList.lastChunk) {
                    intentState.opListReadCapability.resolve(intentState.operatorList);
                    const i = intentState.renderTasks.indexOf(opListTask);
                    if (i >= 0) {
                        intentState.renderTasks.splice(i, 1);
                    }
                }
            }
            const renderingIntent = 'oplist';
            let intentState = this._intentStates.get(renderingIntent);
            if (!intentState) {
                intentState = Object.create(null);
                this._intentStates.set(renderingIntent, intentState);
            }
            let opListTask;
            if (!intentState.opListReadCapability) {
                opListTask = Object.create(null);
                opListTask.operatorListChanged = operatorListChanged;
                intentState.opListReadCapability = a.createPromiseCapability();
                intentState.renderTasks = [];
                intentState.renderTasks.push(opListTask);
                intentState.operatorList = {
                    fnArray: [],
                    argsArray: [],
                    lastChunk: false
                };
                if (this._stats) {
                    this._stats.time('Page Request');
                }
                this._pumpOperatorList({
                    pageIndex: this._pageIndex,
                    intent: renderingIntent
                });
            }
            return intentState.opListReadCapability.promise;
        }
        streamTextContent({normalizeWhitespace = false, disableCombineTextItems = false} = {}) {
            const TEXT_CONTENT_CHUNK_SIZE = 100;
            return this._transport.messageHandler.sendWithStream('GetTextContent', {
                pageIndex: this._pageIndex,
                normalizeWhitespace: normalizeWhitespace === true,
                combineTextItems: disableCombineTextItems !== true
            }, {
                highWaterMark: TEXT_CONTENT_CHUNK_SIZE,
                size(textContent) {
                    return textContent.items.length;
                }
            });
        }
        getTextContent(params = {}) {
            const readableStream = this.streamTextContent(params);
            return new Promise(function (resolve, reject) {
                function pump() {
                    reader.read().then(function ({value, done}) {
                        if (done) {
                            resolve(textContent);
                            return;
                        }
                        Object.assign(textContent.styles, value.styles);
                        textContent.items.push(...value.items);
                        pump();
                    }, reject);
                }
                const reader = readableStream.getReader();
                const textContent = {
                    items: [],
                    styles: Object.create(null)
                };
                pump();
            });
        }
        _destroy() {
            this.destroyed = true;
            this._transport.pageCache[this._pageIndex] = null;
            const waitOn = [];
            for (const [intent, intentState] of this._intentStates) {
                this._abortOperatorList({
                    intentState,
                    reason: new Error('Page was destroyed.'),
                    force: true
                });
                if (intent === 'oplist') {
                    continue;
                }
                for (const internalRenderTask of intentState.renderTasks) {
                    waitOn.push(internalRenderTask.completed);
                    internalRenderTask.cancel();
                }
            }
            this.objs.clear();
            this.annotationsPromise = null;
            this._jsActionsPromise = null;
            this.pendingCleanup = false;
            return Promise.all(waitOn);
        }
        cleanup(resetStats = false) {
            this.pendingCleanup = true;
            return this._tryCleanup(resetStats);
        }
        _tryCleanup(resetStats = false) {
            if (!this.pendingCleanup) {
                return false;
            }
            for (const {renderTasks, operatorList} of this._intentStates.values()) {
                if (renderTasks.length !== 0 || !operatorList.lastChunk) {
                    return false;
                }
            }
            this._intentStates.clear();
            this.objs.clear();
            this.annotationsPromise = null;
            this._jsActionsPromise = null;
            if (resetStats && this._stats) {
                this._stats = new b.StatTimer();
            }
            this.pendingCleanup = false;
            return true;
        }
        _startRenderPage(transparency, intent) {
            const intentState = this._intentStates.get(intent);
            if (!intentState) {
                return;
            }
            if (this._stats) {
                this._stats.timeEnd('Page Request');
            }
            if (intentState.displayReadyCapability) {
                intentState.displayReadyCapability.resolve(transparency);
            }
        }
        _renderPageChunk(operatorListChunk, intentState) {
            for (let i = 0, ii = operatorListChunk.length; i < ii; i++) {
                intentState.operatorList.fnArray.push(operatorListChunk.fnArray[i]);
                intentState.operatorList.argsArray.push(operatorListChunk.argsArray[i]);
            }
            intentState.operatorList.lastChunk = operatorListChunk.lastChunk;
            for (let i = 0; i < intentState.renderTasks.length; i++) {
                intentState.renderTasks[i].operatorListChanged();
            }
            if (operatorListChunk.lastChunk) {
                this._tryCleanup();
            }
        }
        _pumpOperatorList(args) {
            a.assert(args.intent, 'PDFPageProxy._pumpOperatorList: Expected "intent" argument.');
            const readableStream = this._transport.messageHandler.sendWithStream('GetOperatorList', args);
            const reader = readableStream.getReader();
            const intentState = this._intentStates.get(args.intent);
            intentState.streamReader = reader;
            const pump = () => {
                reader.read().then(({value, done}) => {
                    if (done) {
                        intentState.streamReader = null;
                        return;
                    }
                    if (this._transport.destroyed) {
                        return;
                    }
                    this._renderPageChunk(value, intentState);
                    pump();
                }, reason => {
                    intentState.streamReader = null;
                    if (this._transport.destroyed) {
                        return;
                    }
                    if (intentState.operatorList) {
                        intentState.operatorList.lastChunk = true;
                        for (let i = 0; i < intentState.renderTasks.length; i++) {
                            intentState.renderTasks[i].operatorListChanged();
                        }
                        this._tryCleanup();
                    }
                    if (intentState.displayReadyCapability) {
                        intentState.displayReadyCapability.reject(reason);
                    } else if (intentState.opListReadCapability) {
                        intentState.opListReadCapability.reject(reason);
                    } else {
                        throw reason;
                    }
                });
            };
            pump();
        }
        _abortOperatorList({intentState, reason, force = false}) {
            a.assert(reason instanceof Error || typeof reason === 'object' && reason !== null, 'PDFPageProxy._abortOperatorList: Expected "reason" argument.');
            if (!intentState.streamReader) {
                return;
            }
            if (!force) {
                if (intentState.renderTasks.length !== 0) {
                    return;
                }
                if (reason instanceof b.RenderingCancelledException) {
                    intentState.streamReaderCancelTimeout = setTimeout(() => {
                        this._abortOperatorList({
                            intentState,
                            reason,
                            force: true
                        });
                        intentState.streamReaderCancelTimeout = null;
                    }, RENDERING_CANCELLED_TIMEOUT);
                    return;
                }
            }
            intentState.streamReader.cancel(new a.AbortException(reason && reason.message));
            intentState.streamReader = null;
            if (this._transport.destroyed) {
                return;
            }
            for (const [intent, curIntentState] of this._intentStates) {
                if (curIntentState === intentState) {
                    this._intentStates.delete(intent);
                    break;
                }
            }
            this.cleanup();
        }
        get stats() {
            return this._stats;
        }
    }
    class LoopbackPort {
        constructor(defer = true) {
            this._listeners = [];
            this._defer = defer;
            this._deferred = Promise.resolve(undefined);
        }
        postMessage(obj, transfers) {
            function cloneValue(value) {
                if (typeof value !== 'object' || value === null) {
                    return value;
                }
                if (cloned.has(value)) {
                    return cloned.get(value);
                }
                let buffer, result;
                if ((buffer = value.buffer) && a.isArrayBuffer(buffer)) {
                    if (transfers && transfers.includes(buffer)) {
                        result = new value.constructor(buffer, value.byteOffset, value.byteLength);
                    } else {
                        result = new value.constructor(value);
                    }
                    cloned.set(value, result);
                    return result;
                }
                result = Array.isArray(value) ? [] : {};
                cloned.set(value, result);
                for (const i in value) {
                    let desc, p = value;
                    while (!(desc = Object.getOwnPropertyDescriptor(p, i))) {
                        p = Object.getPrototypeOf(p);
                    }
                    if (typeof desc.value === 'undefined') {
                        continue;
                    }
                    if (typeof desc.value === 'function') {
                        if (value.hasOwnProperty && value.hasOwnProperty(i)) {
                            throw new Error(`LoopbackPort.postMessage - cannot clone: ${ value[i] }`);
                        }
                        continue;
                    }
                    result[i] = cloneValue(desc.value);
                }
                return result;
            }
            if (!this._defer) {
                this._listeners.forEach(listener => {
                    listener.call(this, { data: obj });
                });
                return;
            }
            const cloned = new WeakMap();
            const e = { data: cloneValue(obj) };
            this._deferred.then(() => {
                this._listeners.forEach(listener => {
                    listener.call(this, e);
                });
            });
        }
        addEventListener(name, listener) {
            this._listeners.push(listener);
        }
        removeEventListener(name, listener) {
            const i = this._listeners.indexOf(listener);
            this._listeners.splice(i, 1);
        }
        terminate() {
            this._listeners.length = 0;
        }
    }
    const PDFWorker = function PDFWorkerClosure() {
        const pdfWorkerPorts = new WeakMap();
        let isWorkerDisabled = false;
        let fallbackWorkerSrc;
        let nextFakeWorkerId = 0;
        let fakeWorkerCapability;
        if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('GENERIC')) {
            if (i.isNodeJS && typeof __non_webpack_require__ === 'function') {
                isWorkerDisabled = true;
                if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('LIB')) {
                    fallbackWorkerSrc = '../pdf.worker.js';
                } else {
                    fallbackWorkerSrc = './pdf.worker.js';
                }
            } else if (typeof document === 'object' && 'currentScript' in document) {
                const pdfjsFilePath = document.currentScript && document.currentScript.src;
                if (pdfjsFilePath) {
                    fallbackWorkerSrc = pdfjsFilePath.replace(/(\.(?:min\.)?js)(\?.*)?$/i, '.worker$1$2');
                }
            }
        }
        function getWorkerSrc() {
            if (h.GlobalWorkerOptions.workerSrc) {
                return h.GlobalWorkerOptions.workerSrc;
            }
            if (typeof fallbackWorkerSrc !== 'undefined') {
                if (!i.isNodeJS) {
                    b.deprecated('No "GlobalWorkerOptions.workerSrc" specified.');
                }
                return fallbackWorkerSrc;
            }
            throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
        }
        function getMainThreadWorkerMessageHandler() {
            let mainWorkerMessageHandler;
            try {
                mainWorkerMessageHandler = globalThis.pdfjsWorker && globalThis.pdfjsWorker.WorkerMessageHandler;
            } catch (ex) {
            }
            return mainWorkerMessageHandler || null;
        }
        function setupFakeWorkerGlobal() {
            if (fakeWorkerCapability) {
                return fakeWorkerCapability.promise;
            }
            fakeWorkerCapability = a.createPromiseCapability();
            const loader = async function () {
                const mainWorkerMessageHandler = getMainThreadWorkerMessageHandler();
                if (mainWorkerMessageHandler) {
                    return mainWorkerMessageHandler;
                }
                if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION')) {
                    return worker.WorkerMessageHandler;
                }
                if (PDFJSDev.test('GENERIC') && i.isNodeJS && typeof __non_webpack_require__ === 'function') {
                    const worker = eval('require')(getWorkerSrc());
                    return worker.WorkerMessageHandler;
                }
                await b.loadScript(getWorkerSrc());
                return window.pdfjsWorker.WorkerMessageHandler;
            };
            loader().then(fakeWorkerCapability.resolve, fakeWorkerCapability.reject);
            return fakeWorkerCapability.promise;
        }
        function createCDNWrapper(url) {
            return URL.createObjectURL(new Blob([wrapper]));
        }
        class PDFWorker {
            constructor({name = null, port = null, verbosity = a.getVerbosityLevel()} = {}) {
                if (port && pdfWorkerPorts.has(port)) {
                    throw new Error('Cannot use more than one PDFWorker per port');
                }
                this.name = name;
                this.destroyed = false;
                this.postMessageTransfers = true;
                this.verbosity = verbosity;
                this._readyCapability = a.createPromiseCapability();
                this._port = null;
                this._webWorker = null;
                this._messageHandler = null;
                if (port) {
                    pdfWorkerPorts.set(port, this);
                    this._initializeFromPort(port);
                    return;
                }
                this._initialize();
            }
            get promise() {
                return this._readyCapability.promise;
            }
            get port() {
                return this._port;
            }
            get messageHandler() {
                return this._messageHandler;
            }
            _initializeFromPort(port) {
                this._port = port;
                this._messageHandler = new j.MessageHandler('main', 'worker', port);
                this._messageHandler.on('ready', function () {
                });
                this._readyCapability.resolve();
            }
            _initialize() {
                if (typeof Worker !== 'undefined' && !isWorkerDisabled && !getMainThreadWorkerMessageHandler()) {
                    let workerSrc = getWorkerSrc();
                    try {
                        if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('GENERIC') && !a.isSameOrigin(window.location.href, workerSrc)) {
                            workerSrc = createCDNWrapper(new URL(workerSrc, window.location).href);
                        }
                        const worker = new Worker(workerSrc);
                        const messageHandler = new j.MessageHandler('main', 'worker', worker);
                        const terminateEarly = () => {
                            worker.removeEventListener('error', onWorkerError);
                            messageHandler.destroy();
                            worker.terminate();
                            if (this.destroyed) {
                                this._readyCapability.reject(new Error('Worker was destroyed'));
                            } else {
                                this._setupFakeWorker();
                            }
                        };
                        const onWorkerError = () => {
                            if (!this._webWorker) {
                                terminateEarly();
                            }
                        };
                        worker.addEventListener('error', onWorkerError);
                        messageHandler.on('test', data => {
                            worker.removeEventListener('error', onWorkerError);
                            if (this.destroyed) {
                                terminateEarly();
                                return;
                            }
                            if (data) {
                                this._messageHandler = messageHandler;
                                this._port = worker;
                                this._webWorker = worker;
                                if (!data.supportTransfers) {
                                    this.postMessageTransfers = false;
                                }
                                this._readyCapability.resolve();
                                messageHandler.send('configure', { verbosity: this.verbosity });
                            } else {
                                this._setupFakeWorker();
                                messageHandler.destroy();
                                worker.terminate();
                            }
                        });
                        messageHandler.on('ready', data => {
                            worker.removeEventListener('error', onWorkerError);
                            if (this.destroyed) {
                                terminateEarly();
                                return;
                            }
                            try {
                                sendTest();
                            } catch (e) {
                                this._setupFakeWorker();
                            }
                        });
                        const sendTest = () => {
                            const testObj = new Uint8Array([this.postMessageTransfers ? 255 : 0]);
                            try {
                                messageHandler.send('test', testObj, [testObj.buffer]);
                            } catch (ex) {
                                a.warn('Cannot use postMessage transfers.');
                                testObj[0] = 0;
                                messageHandler.send('test', testObj);
                            }
                        };
                        sendTest();
                        return;
                    } catch (e) {
                        a.info('The worker has been disabled.');
                    }
                }
                this._setupFakeWorker();
            }
            _setupFakeWorker() {
                if (!isWorkerDisabled) {
                    a.warn('Setting up fake worker.');
                    isWorkerDisabled = true;
                }
                setupFakeWorkerGlobal().then(WorkerMessageHandler => {
                    if (this.destroyed) {
                        this._readyCapability.reject(new Error('Worker was destroyed'));
                        return;
                    }
                    const port = new LoopbackPort();
                    this._port = port;
                    const id = 'fake' + nextFakeWorkerId++;
                    const workerHandler = new j.MessageHandler(id + '_worker', id, port);
                    WorkerMessageHandler.setup(workerHandler, port);
                    const messageHandler = new j.MessageHandler(id, id + '_worker', port);
                    this._messageHandler = messageHandler;
                    this._readyCapability.resolve();
                    messageHandler.send('configure', { verbosity: this.verbosity });
                }).catch(reason => {
                    this._readyCapability.reject(new Error(`Setting up fake worker failed: "${ reason.message }".`));
                });
            }
            destroy() {
                this.destroyed = true;
                if (this._webWorker) {
                    this._webWorker.terminate();
                    this._webWorker = null;
                }
                pdfWorkerPorts.delete(this._port);
                this._port = null;
                if (this._messageHandler) {
                    this._messageHandler.destroy();
                    this._messageHandler = null;
                }
            }
            static fromPort(params) {
                if (!params || !params.port) {
                    throw new Error('PDFWorker.fromPort - invalid method signature.');
                }
                if (pdfWorkerPorts.has(params.port)) {
                    return pdfWorkerPorts.get(params.port);
                }
                return new PDFWorker(params);
            }
            static getWorkerSrc() {
                return getWorkerSrc();
            }
        }
        return PDFWorker;
    }();
    class WorkerTransport {
        constructor(messageHandler, loadingTask, networkStream, params) {
            this.messageHandler = messageHandler;
            this.loadingTask = loadingTask;
            this.commonObjs = new PDFObjects();
            this.fontLoader = new c.FontLoader({
                docId: loadingTask.docId,
                onUnsupportedFeature: this._onUnsupportedFeature.bind(this),
                ownerDocument: params.ownerDocument
            });
            this._params = params;
            this.CMapReaderFactory = new params.CMapReaderFactory({
                baseUrl: params.cMapUrl,
                isCompressed: params.cMapPacked
            });
            this.destroyed = false;
            this.destroyCapability = null;
            this._passwordCapability = null;
            this._networkStream = networkStream;
            this._fullReader = null;
            this._lastProgress = null;
            this.pageCache = [];
            this.pagePromises = [];
            this.downloadInfoCapability = a.createPromiseCapability();
            this.setupMessageHandler();
        }
        get loadingTaskSettled() {
            return this.loadingTask._capability.settled;
        }
        destroy() {
            if (this.destroyCapability) {
                return this.destroyCapability.promise;
            }
            this.destroyed = true;
            this.destroyCapability = a.createPromiseCapability();
            if (this._passwordCapability) {
                this._passwordCapability.reject(new Error('Worker was destroyed during onPassword callback'));
            }
            const waitOn = [];
            this.pageCache.forEach(function (page) {
                if (page) {
                    waitOn.push(page._destroy());
                }
            });
            this.pageCache.length = 0;
            this.pagePromises.length = 0;
            const terminated = this.messageHandler.sendWithPromise('Terminate', null);
            waitOn.push(terminated);
            if (this.loadingTaskSettled) {
                const annotationStorageResetModified = this.loadingTask.promise.then(pdfDocument => {
                    if (pdfDocument.hasOwnProperty('annotationStorage')) {
                        pdfDocument.annotationStorage.resetModified();
                    }
                }).catch(() => {
                });
                waitOn.push(annotationStorageResetModified);
            }
            Promise.all(waitOn).then(() => {
                this.commonObjs.clear();
                this.fontLoader.clear();
                this._hasJSActionsPromise = null;
                if (this._networkStream) {
                    this._networkStream.cancelAllRequests(new a.AbortException('Worker was terminated.'));
                }
                if (this.messageHandler) {
                    this.messageHandler.destroy();
                    this.messageHandler = null;
                }
                this.destroyCapability.resolve();
            }, this.destroyCapability.reject);
            return this.destroyCapability.promise;
        }
        setupMessageHandler() {
            const {messageHandler, loadingTask} = this;
            messageHandler.on('GetReader', (data, sink) => {
                a.assert(this._networkStream, 'GetReader - no `IPDFStream` instance available.');
                this._fullReader = this._networkStream.getFullReader();
                this._fullReader.onProgress = evt => {
                    this._lastProgress = {
                        loaded: evt.loaded,
                        total: evt.total
                    };
                };
                sink.onPull = () => {
                    this._fullReader.read().then(function ({value, done}) {
                        if (done) {
                            sink.close();
                            return;
                        }
                        a.assert(a.isArrayBuffer(value), 'GetReader - expected an ArrayBuffer.');
                        sink.enqueue(new Uint8Array(value), 1, [value]);
                    }).catch(reason => {
                        sink.error(reason);
                    });
                };
                sink.onCancel = reason => {
                    this._fullReader.cancel(reason);
                    sink.ready.catch(readyReason => {
                        if (this.destroyed) {
                            return;
                        }
                        throw readyReason;
                    });
                };
            });
            messageHandler.on('ReaderHeadersReady', data => {
                const headersCapability = a.createPromiseCapability();
                const fullReader = this._fullReader;
                fullReader.headersReady.then(() => {
                    if (!fullReader.isStreamingSupported || !fullReader.isRangeSupported) {
                        if (this._lastProgress && loadingTask.onProgress) {
                            loadingTask.onProgress(this._lastProgress);
                        }
                        fullReader.onProgress = evt => {
                            if (loadingTask.onProgress) {
                                loadingTask.onProgress({
                                    loaded: evt.loaded,
                                    total: evt.total
                                });
                            }
                        };
                    }
                    headersCapability.resolve({
                        isStreamingSupported: fullReader.isStreamingSupported,
                        isRangeSupported: fullReader.isRangeSupported,
                        contentLength: fullReader.contentLength
                    });
                }, headersCapability.reject);
                return headersCapability.promise;
            });
            messageHandler.on('GetRangeReader', (data, sink) => {
                a.assert(this._networkStream, 'GetRangeReader - no `IPDFStream` instance available.');
                const rangeReader = this._networkStream.getRangeReader(data.begin, data.end);
                if (!rangeReader) {
                    sink.close();
                    return;
                }
                sink.onPull = () => {
                    rangeReader.read().then(function ({value, done}) {
                        if (done) {
                            sink.close();
                            return;
                        }
                        a.assert(a.isArrayBuffer(value), 'GetRangeReader - expected an ArrayBuffer.');
                        sink.enqueue(new Uint8Array(value), 1, [value]);
                    }).catch(reason => {
                        sink.error(reason);
                    });
                };
                sink.onCancel = reason => {
                    rangeReader.cancel(reason);
                    sink.ready.catch(readyReason => {
                        if (this.destroyed) {
                            return;
                        }
                        throw readyReason;
                    });
                };
            });
            messageHandler.on('GetDoc', ({pdfInfo}) => {
                this._numPages = pdfInfo.numPages;
                loadingTask._capability.resolve(new PDFDocumentProxy(pdfInfo, this));
            });
            messageHandler.on('DocException', function (ex) {
                let reason;
                switch (ex.name) {
                case 'PasswordException':
                    reason = new a.PasswordException(ex.message, ex.code);
                    break;
                case 'InvalidPDFException':
                    reason = new a.InvalidPDFException(ex.message);
                    break;
                case 'MissingPDFException':
                    reason = new a.MissingPDFException(ex.message);
                    break;
                case 'UnexpectedResponseException':
                    reason = new a.UnexpectedResponseException(ex.message, ex.status);
                    break;
                case 'UnknownErrorException':
                    reason = new a.UnknownErrorException(ex.message, ex.details);
                    break;
                }
                if (!(reason instanceof Error)) {
                    const msg = 'DocException - expected a valid Error.';
                    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
                        a.unreachable(msg);
                    } else {
                        a.warn(msg);
                    }
                }
                loadingTask._capability.reject(reason);
            });
            messageHandler.on('PasswordRequest', exception => {
                this._passwordCapability = a.createPromiseCapability();
                if (loadingTask.onPassword) {
                    const updatePassword = password => {
                        this._passwordCapability.resolve({ password });
                    };
                    try {
                        loadingTask.onPassword(updatePassword, exception.code);
                    } catch (ex) {
                        this._passwordCapability.reject(ex);
                    }
                } else {
                    this._passwordCapability.reject(new a.PasswordException(exception.message, exception.code));
                }
                return this._passwordCapability.promise;
            });
            messageHandler.on('DataLoaded', data => {
                if (loadingTask.onProgress) {
                    loadingTask.onProgress({
                        loaded: data.length,
                        total: data.length
                    });
                }
                this.downloadInfoCapability.resolve(data);
            });
            messageHandler.on('StartRenderPage', data => {
                if (this.destroyed) {
                    return;
                }
                const page = this.pageCache[data.pageIndex];
                page._startRenderPage(data.transparency, data.intent);
            });
            messageHandler.on('commonobj', data => {
                if (this.destroyed) {
                    return;
                }
                const [id, type, exportedData] = data;
                if (this.commonObjs.has(id)) {
                    return;
                }
                switch (type) {
                case 'Font':
                    const params = this._params;
                    if ('error' in exportedData) {
                        const exportedError = exportedData.error;
                        a.warn(`Error during font loading: ${ exportedError }`);
                        this.commonObjs.resolve(id, exportedError);
                        break;
                    }
                    let fontRegistry = null;
                    if (params.pdfBug && globalThis.FontInspector && globalThis.FontInspector.enabled) {
                        fontRegistry = {
                            registerFont(font, url) {
                                globalThis.FontInspector.fontAdded(font, url);
                            }
                        };
                    }
                    const font = new c.FontFaceObject(exportedData, {
                        isEvalSupported: params.isEvalSupported,
                        disableFontFace: params.disableFontFace,
                        ignoreErrors: params.ignoreErrors,
                        onUnsupportedFeature: this._onUnsupportedFeature.bind(this),
                        fontRegistry
                    });
                    this.fontLoader.bind(font).catch(reason => {
                        return messageHandler.sendWithPromise('FontFallback', { id });
                    }).finally(() => {
                        if (!params.fontExtraProperties && font.data) {
                            font.data = null;
                        }
                        this.commonObjs.resolve(id, font);
                    });
                    break;
                case 'FontPath':
                case 'Image':
                    this.commonObjs.resolve(id, exportedData);
                    break;
                default:
                    throw new Error(`Got unknown common object type ${ type }`);
                }
            });
            messageHandler.on('obj', data => {
                if (this.destroyed) {
                    return undefined;
                }
                const [id, pageIndex, type, imageData] = data;
                const pageProxy = this.pageCache[pageIndex];
                if (pageProxy.objs.has(id)) {
                    return undefined;
                }
                switch (type) {
                case 'Image':
                    pageProxy.objs.resolve(id, imageData);
                    const MAX_IMAGE_SIZE_TO_STORE = 8000000;
                    if (imageData && imageData.data && imageData.data.length > MAX_IMAGE_SIZE_TO_STORE) {
                        pageProxy.cleanupAfterRender = true;
                    }
                    break;
                default:
                    throw new Error(`Got unknown object type ${ type }`);
                }
                return undefined;
            });
            messageHandler.on('DocProgress', data => {
                if (this.destroyed) {
                    return;
                }
                if (loadingTask.onProgress) {
                    loadingTask.onProgress({
                        loaded: data.loaded,
                        total: data.total
                    });
                }
            });
            messageHandler.on('UnsupportedFeature', this._onUnsupportedFeature.bind(this));
            messageHandler.on('FetchBuiltInCMap', (data, sink) => {
                if (this.destroyed) {
                    sink.error(new Error('Worker was destroyed'));
                    return;
                }
                let fetched = false;
                sink.onPull = () => {
                    if (fetched) {
                        sink.close();
                        return;
                    }
                    fetched = true;
                    this.CMapReaderFactory.fetch(data).then(function (builtInCMap) {
                        sink.enqueue(builtInCMap, 1, [builtInCMap.cMapData.buffer]);
                    }).catch(function (reason) {
                        sink.error(reason);
                    });
                };
            });
        }
        _onUnsupportedFeature({featureId}) {
            if (this.destroyed) {
                return;
            }
            if (this.loadingTask.onUnsupportedFeature) {
                this.loadingTask.onUnsupportedFeature(featureId);
            }
        }
        getData() {
            return this.messageHandler.sendWithPromise('GetData', null);
        }
        getPage(pageNumber) {
            if (!Number.isInteger(pageNumber) || pageNumber <= 0 || pageNumber > this._numPages) {
                return Promise.reject(new Error('Invalid page request'));
            }
            const pageIndex = pageNumber - 1;
            if (pageIndex in this.pagePromises) {
                return this.pagePromises[pageIndex];
            }
            const promise = this.messageHandler.sendWithPromise('GetPage', { pageIndex }).then(pageInfo => {
                if (this.destroyed) {
                    throw new Error('Transport destroyed');
                }
                const page = new PDFPageProxy(pageIndex, pageInfo, this, this._params.ownerDocument, this._params.pdfBug);
                this.pageCache[pageIndex] = page;
                return page;
            });
            this.pagePromises[pageIndex] = promise;
            return promise;
        }
        getPageIndex(ref) {
            return this.messageHandler.sendWithPromise('GetPageIndex', { ref }).catch(function (reason) {
                return Promise.reject(new Error(reason));
            });
        }
        getAnnotations(pageIndex, intent) {
            return this.messageHandler.sendWithPromise('GetAnnotations', {
                pageIndex,
                intent
            });
        }
        saveDocument(annotationStorage) {
            return this.messageHandler.sendWithPromise('SaveDocument', {
                numPages: this._numPages,
                annotationStorage: annotationStorage && annotationStorage.getAll() || null,
                filename: this._fullReader ? this._fullReader.filename : null
            }).finally(() => {
                if (annotationStorage) {
                    annotationStorage.resetModified();
                }
            });
        }
        getFieldObjects() {
            return this.messageHandler.sendWithPromise('GetFieldObjects', null);
        }
        hasJSActions() {
            return this._hasJSActionsPromise = this._hasJSActionsPromise || this.messageHandler.sendWithPromise('HasJSActions', null);
        }
        getCalculationOrderIds() {
            return this.messageHandler.sendWithPromise('GetCalculationOrderIds', null);
        }
        getDestinations() {
            return this.messageHandler.sendWithPromise('GetDestinations', null);
        }
        getDestination(id) {
            if (typeof id !== 'string') {
                return Promise.reject(new Error('Invalid destination request.'));
            }
            return this.messageHandler.sendWithPromise('GetDestination', { id });
        }
        getPageLabels() {
            return this.messageHandler.sendWithPromise('GetPageLabels', null);
        }
        getPageLayout() {
            return this.messageHandler.sendWithPromise('GetPageLayout', null);
        }
        getPageMode() {
            return this.messageHandler.sendWithPromise('GetPageMode', null);
        }
        getViewerPreferences() {
            return this.messageHandler.sendWithPromise('GetViewerPreferences', null);
        }
        getOpenAction() {
            return this.messageHandler.sendWithPromise('GetOpenAction', null);
        }
        getAttachments() {
            return this.messageHandler.sendWithPromise('GetAttachments', null);
        }
        getJavaScript() {
            return this.messageHandler.sendWithPromise('GetJavaScript', null);
        }
        getDocJSActions() {
            return this.messageHandler.sendWithPromise('GetDocJSActions', null);
        }
        getPageJSActions(pageIndex) {
            return this.messageHandler.sendWithPromise('GetPageJSActions', { pageIndex });
        }
        getOutline() {
            return this.messageHandler.sendWithPromise('GetOutline', null);
        }
        getOptionalContentConfig() {
            return this.messageHandler.sendWithPromise('GetOptionalContentConfig', null).then(results => {
                return new l.OptionalContentConfig(results);
            });
        }
        getPermissions() {
            return this.messageHandler.sendWithPromise('GetPermissions', null);
        }
        getMetadata() {
            return this.messageHandler.sendWithPromise('GetMetadata', null).then(results => {
                return {
                    a.info: results[0],
                    metadata: results[1] ? new k.Metadata(results[1]) : null,
                    contentDispositionFilename: this._fullReader ? this._fullReader.filename : null,
                    contentLength: this._fullReader ? this._fullReader.contentLength : null
                };
            });
        }
        getMarkInfo() {
            return this.messageHandler.sendWithPromise('GetMarkInfo', null);
        }
        getStats() {
            return this.messageHandler.sendWithPromise('GetStats', null);
        }
        startCleanup() {
            return this.messageHandler.sendWithPromise('Cleanup', null).then(() => {
                for (let i = 0, ii = this.pageCache.length; i < ii; i++) {
                    const page = this.pageCache[i];
                    if (page) {
                        const cleanupSuccessful = page.cleanup();
                        if (!cleanupSuccessful) {
                            throw new Error(`startCleanup: Page ${ i + 1 } is currently rendering.`);
                        }
                    }
                }
                this.commonObjs.clear();
                this.fontLoader.clear();
                this._hasJSActionsPromise = null;
            });
        }
        get loadingParams() {
            const params = this._params;
            return a.shadow(this, 'loadingParams', {
                disableAutoFetch: params.disableAutoFetch,
                disableFontFace: params.disableFontFace
            });
        }
    }
    class PDFObjects {
        constructor() {
            this._objs = Object.create(null);
        }
        _ensureObj(objId) {
            if (this._objs[objId]) {
                return this._objs[objId];
            }
            return this._objs[objId] = {
                capability: a.createPromiseCapability(),
                data: null,
                resolved: false
            };
        }
        get(objId, callback = null) {
            if (callback) {
                this._ensureObj(objId).capability.promise.then(callback);
                return null;
            }
            const obj = this._objs[objId];
            if (!obj || !obj.resolved) {
                throw new Error(`Requesting object that isn't resolved yet ${ objId }.`);
            }
            return obj.data;
        }
        has(objId) {
            const obj = this._objs[objId];
            return obj && obj.resolved || false;
        }
        resolve(objId, data) {
            const obj = this._ensureObj(objId);
            obj.resolved = true;
            obj.data = data;
            obj.capability.resolve(data);
        }
        clear() {
            this._objs = Object.create(null);
        }
    }
    class RenderTask {
        constructor(internalRenderTask) {
            this._internalRenderTask = internalRenderTask;
            this.onContinue = null;
        }
        get promise() {
            return this._internalRenderTask.capability.promise;
        }
        cancel() {
            this._internalRenderTask.cancel();
        }
    }
    const InternalRenderTask = function InternalRenderTaskClosure() {
        const canvasInRendering = new WeakSet();
        class InternalRenderTask {
            constructor({callback, params, objs, commonObjs, operatorList, pageIndex, canvasFactory, webGLContext, useRequestAnimationFrame = false, pdfBug = false}) {
                this.callback = callback;
                this.params = params;
                this.objs = objs;
                this.commonObjs = commonObjs;
                this.operatorListIdx = null;
                this.operatorList = operatorList;
                this._pageIndex = pageIndex;
                this.canvasFactory = canvasFactory;
                this.webGLContext = webGLContext;
                this._pdfBug = pdfBug;
                this.running = false;
                this.graphicsReadyCallback = null;
                this.graphicsReady = false;
                this._useRequestAnimationFrame = useRequestAnimationFrame === true && typeof window !== 'undefined';
                this.cancelled = false;
                this.capability = a.createPromiseCapability();
                this.task = new RenderTask(this);
                this._continueBound = this._continue.bind(this);
                this._scheduleNextBound = this._scheduleNext.bind(this);
                this._nextBound = this._next.bind(this);
                this._canvas = params.canvasContext.canvas;
            }
            get completed() {
                return this.capability.promise.catch(function () {
                });
            }
            initializeGraphics({transparency = false, optionalContentConfig}) {
                if (this.cancelled) {
                    return;
                }
                if (this._canvas) {
                    if (canvasInRendering.has(this._canvas)) {
                        throw new Error('Cannot use the same canvas during multiple render() operations. ' + 'Use different canvas or ensure previous operations were ' + 'cancelled or completed.');
                    }
                    canvasInRendering.add(this._canvas);
                }
                if (this._pdfBug && globalThis.StepperManager && globalThis.StepperManager.enabled) {
                    this.stepper = globalThis.StepperManager.create(this._pageIndex);
                    this.stepper.init(this.operatorList);
                    this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
                }
                const {canvasContext, viewport, transform, imageLayer, background} = this.params;
                this.gfx = new g.CanvasGraphics(canvasContext, this.commonObjs, this.objs, this.canvasFactory, this.webGLContext, imageLayer, optionalContentConfig);
                this.gfx.beginDrawing({
                    transform,
                    viewport,
                    transparency,
                    background
                });
                this.operatorListIdx = 0;
                this.graphicsReady = true;
                if (this.graphicsReadyCallback) {
                    this.graphicsReadyCallback();
                }
            }
            cancel(error = null) {
                this.running = false;
                this.cancelled = true;
                if (this.gfx) {
                    this.gfx.endDrawing();
                }
                if (this._canvas) {
                    canvasInRendering.delete(this._canvas);
                }
                this.callback(error || new b.RenderingCancelledException(`Rendering cancelled, page ${ this._pageIndex + 1 }`, 'canvas'));
            }
            operatorListChanged() {
                if (!this.graphicsReady) {
                    if (!this.graphicsReadyCallback) {
                        this.graphicsReadyCallback = this._continueBound;
                    }
                    return;
                }
                if (this.stepper) {
                    this.stepper.updateOperatorList(this.operatorList);
                }
                if (this.running) {
                    return;
                }
                this._continue();
            }
            _continue() {
                this.running = true;
                if (this.cancelled) {
                    return;
                }
                if (this.task.onContinue) {
                    this.task.onContinue(this._scheduleNextBound);
                } else {
                    this._scheduleNext();
                }
            }
            _scheduleNext() {
                if (this._useRequestAnimationFrame) {
                    window.requestAnimationFrame(() => {
                        this._nextBound().catch(this.cancel.bind(this));
                    });
                } else {
                    Promise.resolve().then(this._nextBound).catch(this.cancel.bind(this));
                }
            }
            async _next() {
                if (this.cancelled) {
                    return;
                }
                this.operatorListIdx = this.gfx.executeOperatorList(this.operatorList, this.operatorListIdx, this._continueBound, this.stepper);
                if (this.operatorListIdx === this.operatorList.argsArray.length) {
                    this.running = false;
                    if (this.operatorList.lastChunk) {
                        this.gfx.endDrawing();
                        if (this._canvas) {
                            canvasInRendering.delete(this._canvas);
                        }
                        this.callback();
                    }
                }
            }
        }
        return InternalRenderTask;
    }();
    const version = typeof PDFJSDev !== 'undefined' ? PDFJSDev.eval('BUNDLE_VERSION') : null;
    const build = typeof PDFJSDev !== 'undefined' ? PDFJSDev.eval('BUNDLE_BUILD') : null;
    return {
        build,
        DefaultCanvasFactory,
        DefaultCMapReaderFactory,
        getDocument,
        LoopbackPort,
        PDFDataRangeTransport,
        PDFDocumentProxy,
        PDFPageProxy,
        PDFWorker,
        setPDFNetworkStreamFactory,
        version
    };
});