define([
    '../external/quickjs/quickjs-eval.js',
    './pdf.sandbox.external.js'
], function (ModuleLoader, a) {
    'use strict';
    const pdfjsVersion = PDFJSDev.eval('BUNDLE_VERSION');
    const pdfjsBuild = PDFJSDev.eval('BUNDLE_BUILD');
    const TESTING = typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING');
    class SandboxSupport extends a.SandboxSupportBase {
        exportValueToSandbox(val) {
            return JSON.stringify(val);
        }
        importValueFromSandbox(val) {
            return val;
        }
        createErrorForSandbox(errorMessage) {
            return new Error(errorMessage);
        }
    }
    class Sandbox {
        constructor(win, module) {
            this.support = new SandboxSupport(win, this);
            module.externalCall = this.support.createSandboxExternals();
            this._module = module;
            this._alertOnError = 0;
        }
        create(data) {
            if (TESTING) {
                this._module.ccall('nukeSandbox', null, []);
            }
            const sandboxData = JSON.stringify(data);
            const code = [
                PDFJSDev.eval('PDF_SCRIPTING_JS_SOURCE'),
                `pdfjsScripting.initSandbox({ data: ${ sandboxData } })`
            ];
            if (!TESTING) {
                code.push('delete dump;');
            } else {
                code.unshift(`globalThis.sendResultForTesting = callExternalFunction.bind(null, "send");`);
            }
            let success = false;
            try {
                success = !!this._module.ccall('init', 'number', [
                    'string',
                    'number'
                ], [
                    code.join('\n'),
                    this._alertOnError
                ]);
            } catch (error) {
                console.error(error);
            }
            if (success) {
                this.support.commFun = this._module.cwrap('commFun', null, [
                    'string',
                    'string'
                ]);
            } else {
                this.nukeSandbox();
                throw new Error('Cannot start sandbox');
            }
        }
        dispatchEvent(event) {
            this.support.callSandboxFunction('dispatchEvent', event);
        }
        dumpMemoryUse() {
            if (this._module) {
                this._module.ccall('dumpMemoryUse', null, []);
            }
        }
        nukeSandbox() {
            if (this._module !== null) {
                this.support.destroy();
                this.support = null;
                this._module.ccall('nukeSandbox', null, []);
                this._module = null;
            }
        }
        evalForTesting(code, key) {
            if (TESTING) {
                this._module.ccall('evalInSandbox', null, [
                    'string',
                    'int'
                ], [
                    `try {
             sendResultForTesting([{ id: "${ key }", result: ${ code } }]);
          } catch (error) {
             sendResultForTesting([{ id: "${ key }", result: error.message }]);
          }`,
                    this._alertOnError
                ]);
            }
        }
    }
    function QuickJSSandbox() {
        return ModuleLoader().then(module => {
            return new Sandbox(window, module);
        });
    }
    return { QuickJSSandbox };
});