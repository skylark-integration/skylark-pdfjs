define([
    '../shared/util.js',
    './primitives.js',
    './pdf_manager.js',
    './writer.js',
    '../shared/is_node.js',
    '../shared/message_handler.js',
    './worker_stream.js',
    './core_utils.js'
], function (a, b, c, d, e, f, g, h) {
    'use strict';
    class WorkerTask {
        constructor(name) {
            this.name = name;
            this.terminated = false;
            this._capability = a.createPromiseCapability();
        }
        get finished() {
            return this._capability.promise;
        }
        finish() {
            this._capability.resolve();
        }
        terminate() {
            this.terminated = true;
        }
        ensureNotTerminated() {
            if (this.terminated) {
                throw new Error('Worker task was terminated');
            }
        }
    }
    class WorkerMessageHandler {
        static setup(handler, port) {
            var testMessageProcessed = false;
            handler.on('test', function wphSetupTest(data) {
                if (testMessageProcessed) {
                    return;
                }
                testMessageProcessed = true;
                if (!(data instanceof Uint8Array)) {
                    handler.send('test', null);
                    return;
                }
                const supportTransfers = data[0] === 255;
                handler.postMessageTransfers = supportTransfers;
                handler.send('test', { supportTransfers });
            });
            handler.on('configure', function wphConfigure(data) {
                a.setVerbosityLevel(data.verbosity);
            });
            handler.on('GetDocRequest', function wphSetupDoc(data) {
                return WorkerMessageHandler.createDocumentHandler(data, port);
            });
        }
        static createDocumentHandler(docParams, port) {
            var pdfManager;
            var terminated = false;
            var cancelXHRs = null;
            var WorkerTasks = [];
            const verbosity = a.getVerbosityLevel();
            const apiVersion = docParams.apiVersion;
            const workerVersion = typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('TESTING') ? PDFJSDev.eval('BUNDLE_VERSION') : null;
            if (apiVersion !== workerVersion) {
                throw new Error(`The API version "${ apiVersion }" does not match ` + `the Worker version "${ workerVersion }".`);
            }
            if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
                const enumerableProperties = [];
                for (const property in []) {
                    enumerableProperties.push(property);
                }
                if (enumerableProperties.length) {
                    throw new Error('The `Array.prototype` contains unexpected enumerable properties: ' + enumerableProperties.join(', ') + '; thus breaking e.g. `for...in` iteration of `Array`s.');
                }
                if ((typeof PDFJSDev === 'undefined' || PDFJSDev.test('SKIP_BABEL')) && typeof ReadableStream === 'undefined') {
                    throw new Error('The browser/environment lacks native support for critical ' + 'functionality used by the PDF.js library (e.g. `ReadableStream`); ' + 'please use an `es5`-build instead.');
                }
            }
            var docId = docParams.docId;
            var docBaseUrl = docParams.docBaseUrl;
            var workerHandlerName = docParams.docId + '_worker';
            var handler = new f.MessageHandler(workerHandlerName, docId, port);
            handler.postMessageTransfers = docParams.postMessageTransfers;
            function ensureNotTerminated() {
                if (terminated) {
                    throw new Error('Worker was terminated');
                }
            }
            function startWorkerTask(task) {
                WorkerTasks.push(task);
            }
            function finishWorkerTask(task) {
                task.finish();
                var i = WorkerTasks.indexOf(task);
                WorkerTasks.splice(i, 1);
            }
            async function loadDocument(recoveryMode) {
                await pdfManager.ensureDoc('checkHeader');
                await pdfManager.ensureDoc('parseStartXRef');
                await pdfManager.ensureDoc('parse', [recoveryMode]);
                if (!recoveryMode) {
                    await pdfManager.ensureDoc('checkFirstPage');
                }
                const [numPages, fingerprint] = await Promise.all([
                    pdfManager.ensureDoc('numPages'),
                    pdfManager.ensureDoc('fingerprint')
                ]);
                return {
                    numPages,
                    fingerprint
                };
            }
            function getPdfManager(data, evaluatorOptions) {
                var pdfManagerCapability = a.createPromiseCapability();
                let newPdfManager;
                var source = data.source;
                if (source.data) {
                    try {
                        newPdfManager = new c.LocalPdfManager(docId, source.data, source.password, evaluatorOptions, docBaseUrl);
                        pdfManagerCapability.resolve(newPdfManager);
                    } catch (ex) {
                        pdfManagerCapability.reject(ex);
                    }
                    return pdfManagerCapability.promise;
                }
                var pdfStream, cachedChunks = [];
                try {
                    pdfStream = new g.PDFWorkerStream(handler);
                } catch (ex) {
                    pdfManagerCapability.reject(ex);
                    return pdfManagerCapability.promise;
                }
                var fullRequest = pdfStream.getFullReader();
                fullRequest.headersReady.then(function () {
                    if (!fullRequest.isRangeSupported) {
                        return;
                    }
                    var disableAutoFetch = source.disableAutoFetch || fullRequest.isStreamingSupported;
                    newPdfManager = new c.NetworkPdfManager(docId, pdfStream, {
                        msgHandler: handler,
                        password: source.password,
                        length: fullRequest.contentLength,
                        disableAutoFetch,
                        rangeChunkSize: source.rangeChunkSize
                    }, evaluatorOptions, docBaseUrl);
                    for (let i = 0; i < cachedChunks.length; i++) {
                        newPdfManager.sendProgressiveData(cachedChunks[i]);
                    }
                    cachedChunks = [];
                    pdfManagerCapability.resolve(newPdfManager);
                    cancelXHRs = null;
                }).catch(function (reason) {
                    pdfManagerCapability.reject(reason);
                    cancelXHRs = null;
                });
                var loaded = 0;
                var flushChunks = function () {
                    var pdfFile = a.arraysToBytes(cachedChunks);
                    if (source.length && pdfFile.length !== source.length) {
                        a.warn('reported HTTP length is different from actual');
                    }
                    try {
                        newPdfManager = new c.LocalPdfManager(docId, pdfFile, source.password, evaluatorOptions, docBaseUrl);
                        pdfManagerCapability.resolve(newPdfManager);
                    } catch (ex) {
                        pdfManagerCapability.reject(ex);
                    }
                    cachedChunks = [];
                };
                var readPromise = new Promise(function (resolve, reject) {
                    var readChunk = function ({value, done}) {
                        try {
                            ensureNotTerminated();
                            if (done) {
                                if (!newPdfManager) {
                                    flushChunks();
                                }
                                cancelXHRs = null;
                                return;
                            }
                            loaded += a.arrayByteLength(value);
                            if (!fullRequest.isStreamingSupported) {
                                handler.send('DocProgress', {
                                    loaded,
                                    total: Math.max(loaded, fullRequest.contentLength || 0)
                                });
                            }
                            if (newPdfManager) {
                                newPdfManager.sendProgressiveData(value);
                            } else {
                                cachedChunks.push(value);
                            }
                            fullRequest.read().then(readChunk, reject);
                        } catch (e) {
                            reject(e);
                        }
                    };
                    fullRequest.read().then(readChunk, reject);
                });
                readPromise.catch(function (e) {
                    pdfManagerCapability.reject(e);
                    cancelXHRs = null;
                });
                cancelXHRs = function (reason) {
                    pdfStream.cancelAllRequests(reason);
                };
                return pdfManagerCapability.promise;
            }
            function setupDoc(data) {
                function onSuccess(doc) {
                    ensureNotTerminated();
                    handler.send('GetDoc', { pdfInfo: doc });
                }
                function onFailure(ex) {
                    ensureNotTerminated();
                    if (ex instanceof a.PasswordException) {
                        var task = new WorkerTask(`PasswordException: response ${ ex.code }`);
                        startWorkerTask(task);
                        handler.sendWithPromise('PasswordRequest', ex).then(function ({password}) {
                            finishWorkerTask(task);
                            pdfManager.updatePassword(password);
                            pdfManagerReady();
                        }).catch(function () {
                            finishWorkerTask(task);
                            handler.send('DocException', ex);
                        });
                    } else if (ex instanceof a.InvalidPDFException || ex instanceof a.MissingPDFException || ex instanceof a.UnexpectedResponseException || ex instanceof a.UnknownErrorException) {
                        handler.send('DocException', ex);
                    } else {
                        handler.send('DocException', new a.UnknownErrorException(ex.message, ex.toString()));
                    }
                }
                function pdfManagerReady() {
                    ensureNotTerminated();
                    loadDocument(false).then(onSuccess, function (reason) {
                        ensureNotTerminated();
                        if (!(reason instanceof h.XRefParseException)) {
                            onFailure(reason);
                            return;
                        }
                        pdfManager.requestLoadedStream();
                        pdfManager.onLoadedStream().then(function () {
                            ensureNotTerminated();
                            loadDocument(true).then(onSuccess, onFailure);
                        });
                    });
                }
                ensureNotTerminated();
                var evaluatorOptions = {
                    maxImageSize: data.maxImageSize,
                    disableFontFace: data.disableFontFace,
                    ignoreErrors: data.ignoreErrors,
                    isEvalSupported: data.isEvalSupported,
                    fontExtraProperties: data.fontExtraProperties
                };
                getPdfManager(data, evaluatorOptions).then(function (newPdfManager) {
                    if (terminated) {
                        newPdfManager.terminate(new a.AbortException('Worker was terminated.'));
                        throw new Error('Worker was terminated');
                    }
                    pdfManager = newPdfManager;
                    pdfManager.onLoadedStream().then(function (stream) {
                        handler.send('DataLoaded', { length: stream.bytes.byteLength });
                    });
                }).then(pdfManagerReady, onFailure);
            }
            handler.on('GetPage', function wphSetupGetPage(data) {
                return pdfManager.getPage(data.pageIndex).then(function (page) {
                    return Promise.all([
                        pdfManager.ensure(page, 'rotate'),
                        pdfManager.ensure(page, 'ref'),
                        pdfManager.ensure(page, 'userUnit'),
                        pdfManager.ensure(page, 'view')
                    ]).then(function ([rotate, ref, userUnit, view]) {
                        return {
                            rotate,
                            ref,
                            userUnit,
                            view
                        };
                    });
                });
            });
            handler.on('GetPageIndex', function wphSetupGetPageIndex({ref}) {
                const pageRef = b.Ref.get(ref.num, ref.gen);
                return pdfManager.ensureCatalog('getPageIndex', [pageRef]);
            });
            handler.on('GetDestinations', function wphSetupGetDestinations(data) {
                return pdfManager.ensureCatalog('destinations');
            });
            handler.on('GetDestination', function wphSetupGetDestination(data) {
                return pdfManager.ensureCatalog('getDestination', [data.id]);
            });
            handler.on('GetPageLabels', function wphSetupGetPageLabels(data) {
                return pdfManager.ensureCatalog('pageLabels');
            });
            handler.on('GetPageLayout', function wphSetupGetPageLayout(data) {
                return pdfManager.ensureCatalog('pageLayout');
            });
            handler.on('GetPageMode', function wphSetupGetPageMode(data) {
                return pdfManager.ensureCatalog('pageMode');
            });
            handler.on('GetViewerPreferences', function (data) {
                return pdfManager.ensureCatalog('viewerPreferences');
            });
            handler.on('GetOpenAction', function (data) {
                return pdfManager.ensureCatalog('openAction');
            });
            handler.on('GetAttachments', function wphSetupGetAttachments(data) {
                return pdfManager.ensureCatalog('attachments');
            });
            handler.on('GetJavaScript', function wphSetupGetJavaScript(data) {
                return pdfManager.ensureCatalog('javaScript');
            });
            handler.on('GetDocJSActions', function wphSetupGetDocJSActions(data) {
                return pdfManager.ensureCatalog('jsActions');
            });
            handler.on('GetPageJSActions', function ({pageIndex}) {
                return pdfManager.getPage(pageIndex).then(function (page) {
                    return page.jsActions;
                });
            });
            handler.on('GetOutline', function wphSetupGetOutline(data) {
                return pdfManager.ensureCatalog('documentOutline');
            });
            handler.on('GetOptionalContentConfig', function (data) {
                return pdfManager.ensureCatalog('optionalContentConfig');
            });
            handler.on('GetPermissions', function (data) {
                return pdfManager.ensureCatalog('permissions');
            });
            handler.on('GetMetadata', function wphSetupGetMetadata(data) {
                return Promise.all([
                    pdfManager.ensureDoc('documentInfo'),
                    pdfManager.ensureCatalog('metadata')
                ]);
            });
            handler.on('GetMarkInfo', function wphSetupGetMarkInfo(data) {
                return pdfManager.ensureCatalog('markInfo');
            });
            handler.on('GetData', function wphSetupGetData(data) {
                pdfManager.requestLoadedStream();
                return pdfManager.onLoadedStream().then(function (stream) {
                    return stream.bytes;
                });
            });
            handler.on('GetStats', function wphSetupGetStats(data) {
                return pdfManager.ensureXRef('stats');
            });
            handler.on('GetAnnotations', function ({pageIndex, intent}) {
                return pdfManager.getPage(pageIndex).then(function (page) {
                    return page.getAnnotationsData(intent);
                });
            });
            handler.on('GetFieldObjects', function (data) {
                return pdfManager.ensureDoc('fieldObjects');
            });
            handler.on('HasJSActions', function (data) {
                return pdfManager.ensureDoc('hasJSActions');
            });
            handler.on('GetCalculationOrderIds', function (data) {
                return pdfManager.ensureDoc('calculationOrderIds');
            });
            handler.on('SaveDocument', function ({numPages, annotationStorage, filename}) {
                pdfManager.requestLoadedStream();
                const promises = [
                    pdfManager.onLoadedStream(),
                    pdfManager.ensureCatalog('acroForm'),
                    pdfManager.ensureDoc('xref'),
                    pdfManager.ensureDoc('startXRef')
                ];
                for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
                    promises.push(pdfManager.getPage(pageIndex).then(function (page) {
                        const task = new WorkerTask(`Save: page ${ pageIndex }`);
                        startWorkerTask(task);
                        return page.save(handler, task, annotationStorage).finally(function () {
                            finishWorkerTask(task);
                        });
                    }));
                }
                return Promise.all(promises).then(function ([stream, acroForm, xref, startXRef, ...refs]) {
                    let newRefs = [];
                    for (const ref of refs) {
                        newRefs = ref.filter(x => x !== null).reduce((a, b) => a.concat(b), newRefs);
                    }
                    if (newRefs.length === 0) {
                        return stream.bytes;
                    }
                    const xfa = acroForm instanceof b.Dict && acroForm.get('XFA') || [];
                    let xfaDatasets = null;
                    if (Array.isArray(xfa)) {
                        for (let i = 0, ii = xfa.length; i < ii; i += 2) {
                            if (xfa[i] === 'datasets') {
                                xfaDatasets = xfa[i + 1];
                            }
                        }
                    } else {
                        a.warn('Unsupported XFA type.');
                    }
                    let newXrefInfo = Object.create(null);
                    if (xref.trailer) {
                        const infoObj = Object.create(null);
                        const xrefInfo = xref.trailer.get('Info') || null;
                        if (xrefInfo instanceof b.Dict) {
                            xrefInfo.forEach((key, value) => {
                                if (a.isString(key) && a.isString(value)) {
                                    infoObj[key] = a.stringToPDFString(value);
                                }
                            });
                        }
                        newXrefInfo = {
                            rootRef: xref.trailer.getRaw('Root') || null,
                            encrypt: xref.trailer.getRaw('Encrypt') || null,
                            newRef: xref.getNewRef(),
                            infoRef: xref.trailer.getRaw('Info') || null,
                            a.info: infoObj,
                            fileIds: xref.trailer.getRaw('ID') || null,
                            startXRef,
                            filename
                        };
                    }
                    xref.resetNewRef();
                    return d.incrementalUpdate({
                        originalData: stream.bytes,
                        xrefInfo: newXrefInfo,
                        newRefs,
                        xref,
                        datasetsRef: xfaDatasets
                    });
                });
            });
            handler.on('GetOperatorList', function wphSetupRenderPage(data, sink) {
                var pageIndex = data.pageIndex;
                pdfManager.getPage(pageIndex).then(function (page) {
                    var task = new WorkerTask(`GetOperatorList: page ${ pageIndex }`);
                    startWorkerTask(task);
                    const start = verbosity >= a.VerbosityLevel.INFOS ? Date.now() : 0;
                    page.getOperatorList({
                        handler,
                        sink,
                        task,
                        intent: data.intent,
                        renderInteractiveForms: data.renderInteractiveForms,
                        annotationStorage: data.annotationStorage
                    }).then(function (operatorListInfo) {
                        finishWorkerTask(task);
                        if (start) {
                            a.info(`page=${ pageIndex + 1 } - getOperatorList: time=` + `${ Date.now() - start }ms, len=${ operatorListInfo.length }`);
                        }
                        sink.close();
                    }, function (reason) {
                        finishWorkerTask(task);
                        if (task.terminated) {
                            return;
                        }
                        handler.send('UnsupportedFeature', { featureId: a.UNSUPPORTED_FEATURES.errorOperatorList });
                        sink.error(reason);
                    });
                });
            });
            handler.on('GetTextContent', function wphExtractText(data, sink) {
                var pageIndex = data.pageIndex;
                sink.onPull = function (desiredSize) {
                };
                sink.onCancel = function (reason) {
                };
                pdfManager.getPage(pageIndex).then(function (page) {
                    var task = new WorkerTask('GetTextContent: page ' + pageIndex);
                    startWorkerTask(task);
                    const start = verbosity >= a.VerbosityLevel.INFOS ? Date.now() : 0;
                    page.extractTextContent({
                        handler,
                        task,
                        sink,
                        normalizeWhitespace: data.normalizeWhitespace,
                        combineTextItems: data.combineTextItems
                    }).then(function () {
                        finishWorkerTask(task);
                        if (start) {
                            a.info(`page=${ pageIndex + 1 } - getTextContent: time=` + `${ Date.now() - start }ms`);
                        }
                        sink.close();
                    }, function (reason) {
                        finishWorkerTask(task);
                        if (task.terminated) {
                            return;
                        }
                        sink.error(reason);
                    });
                });
            });
            handler.on('FontFallback', function (data) {
                return pdfManager.fontFallback(data.id, handler);
            });
            handler.on('Cleanup', function wphCleanup(data) {
                return pdfManager.cleanup(true);
            });
            handler.on('Terminate', function wphTerminate(data) {
                terminated = true;
                const waitOn = [];
                if (pdfManager) {
                    pdfManager.terminate(new a.AbortException('Worker was terminated.'));
                    const cleanupPromise = pdfManager.cleanup();
                    waitOn.push(cleanupPromise);
                    pdfManager = null;
                } else {
                    b.clearPrimitiveCaches();
                }
                if (cancelXHRs) {
                    cancelXHRs(new a.AbortException('Worker was terminated.'));
                }
                WorkerTasks.forEach(function (task) {
                    waitOn.push(task.finished);
                    task.terminate();
                });
                return Promise.all(waitOn).then(function () {
                    handler.destroy();
                    handler = null;
                });
            });
            handler.on('Ready', function wphReady(data) {
                setupDoc(docParams);
                docParams = null;
            });
            return workerHandlerName;
        }
        static initializeFromPort(port) {
            var handler = new f.MessageHandler('worker', 'main', port);
            WorkerMessageHandler.setup(handler, port);
            handler.send('ready', null);
        }
    }
    function isMessagePort(maybePort) {
        return typeof maybePort.postMessage === 'function' && 'onmessage' in maybePort;
    }
    if (typeof window === 'undefined' && !e.isNodeJS && typeof self !== 'undefined' && isMessagePort(self)) {
        WorkerMessageHandler.initializeFromPort(self);
    }
    return {
        WorkerMessageHandler,
        WorkerTask
    };
});