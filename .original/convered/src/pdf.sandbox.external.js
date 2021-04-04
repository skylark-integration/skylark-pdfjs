class SandboxSupportBase {
    constructor(win) {
        this.win = win;
        this.timeoutIds = new Map();
        this.commFun = null;
    }
    destroy() {
        this.commFunc = null;
        this.timeoutIds.forEach(([_, id]) => this.win.clearTimeout(id));
        this.timeoutIds = null;
    }
    exportValueToSandbox(val) {
        throw new Error('Not implemented');
    }
    importValueFromSandbox(val) {
        throw new Error('Not implemented');
    }
    createErrorForSandbox(errorMessage) {
        throw new Error('Not implemented');
    }
    callSandboxFunction(name, args) {
        try {
            args = this.exportValueToSandbox(args);
            this.commFun(name, args);
        } catch (e) {
            this.win.console.error(e);
        }
    }
    createSandboxExternals() {
        const externals = {
            setTimeout: (callbackId, nMilliseconds) => {
                if (typeof callbackId !== 'number' || typeof nMilliseconds !== 'number') {
                    return;
                }
                const id = this.win.setTimeout(() => {
                    this.timeoutIds.delete(callbackId);
                    this.callSandboxFunction('timeoutCb', {
                        callbackId,
                        interval: false
                    });
                }, nMilliseconds);
                this.timeoutIds.set(callbackId, id);
            },
            clearTimeout: id => {
                this.win.clearTimeout(this.timeoutIds.get(id));
                this.timeoutIds.delete(id);
            },
            setInterval: (callbackId, nMilliseconds) => {
                if (typeof callbackId !== 'number' || typeof nMilliseconds !== 'number') {
                    return;
                }
                const id = this.win.setInterval(() => {
                    this.callSandboxFunction('timeoutCb', {
                        callbackId,
                        interval: true
                    });
                }, nMilliseconds);
                this.timeoutIds.set(callbackId, id);
            },
            clearInterval: id => {
                this.win.clearInterval(this.timeoutIds.get(id));
                this.timeoutIds.delete(id);
            },
            alert: cMsg => {
                if (typeof cMsg !== 'string') {
                    return;
                }
                this.win.alert(cMsg);
            },
            prompt: (cQuestion, cDefault) => {
                if (typeof cQuestion !== 'string' || typeof cDefault !== 'string') {
                    return null;
                }
                return this.win.prompt(cQuestion, cDefault);
            },
            parseURL: cUrl => {
                const url = new this.win.URL(cUrl);
                const props = [
                    'hash',
                    'host',
                    'hostname',
                    'href',
                    'origin',
                    'password',
                    'pathname',
                    'port',
                    'protocol',
                    'search',
                    'searchParams',
                    'username'
                ];
                return Object.fromEntries(props.map(name => [
                    name,
                    url[name].toString()
                ]));
            },
            send: data => {
                if (!data) {
                    return;
                }
                const event = new this.win.CustomEvent('updatefromsandbox', { detail: this.importValueFromSandbox(data) });
                this.win.dispatchEvent(event);
            }
        };
        Object.setPrototypeOf(externals, null);
        return (name, args) => {
            try {
                const result = externals[name](...args);
                return this.exportValueToSandbox(result);
            } catch (error) {
                throw this.createErrorForSandbox(error ? error.toString() : '');
            }
        };
    }
}
if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('MOZCENTRAL')) {
    exports.SandboxSupportBase = SandboxSupportBase;
} else {
    var EXPORTED_SYMBOLS = ['SandboxSupportBase'];
}