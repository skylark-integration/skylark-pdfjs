define([
    '../shared/util.js',
    './primitives.js'
], function (a, b) {
    'use strict';
    function getLookupTableFactory(initializer) {
        let lookup;
        return function () {
            if (initializer) {
                lookup = Object.create(null);
                initializer(lookup);
                initializer = null;
            }
            return lookup;
        };
    }
    function getArrayLookupTableFactory(initializer) {
        let lookup;
        return function () {
            if (initializer) {
                let arr = initializer();
                initializer = null;
                lookup = Object.create(null);
                for (let i = 0, ii = arr.length; i < ii; i += 2) {
                    lookup[arr[i]] = arr[i + 1];
                }
                arr = null;
            }
            return lookup;
        };
    }
    class MissingDataException extends a.BaseException {
        constructor(begin, end) {
            super(`Missing data [${ begin }, ${ end })`);
            this.begin = begin;
            this.end = end;
        }
    }
    class XRefEntryException extends a.BaseException {
    }
    class XRefParseException extends a.BaseException {
    }
    function getInheritableProperty({dict, key, getArray = false, stopWhenFound = true}) {
        const LOOP_LIMIT = 100;
        let loopCount = 0;
        let values;
        while (dict) {
            const value = getArray ? dict.getArray(key) : dict.get(key);
            if (value !== undefined) {
                if (stopWhenFound) {
                    return value;
                }
                if (!values) {
                    values = [];
                }
                values.push(value);
            }
            if (++loopCount > LOOP_LIMIT) {
                a.warn(`getInheritableProperty: maximum loop count exceeded for "${ key }"`);
                break;
            }
            dict = dict.get('Parent');
        }
        return values;
    }
    const ROMAN_NUMBER_MAP = [
        '',
        'C',
        'CC',
        'CCC',
        'CD',
        'D',
        'DC',
        'DCC',
        'DCCC',
        'CM',
        '',
        'X',
        'XX',
        'XXX',
        'XL',
        'L',
        'LX',
        'LXX',
        'LXXX',
        'XC',
        '',
        'I',
        'II',
        'III',
        'IV',
        'V',
        'VI',
        'VII',
        'VIII',
        'IX'
    ];
    function toRomanNumerals(number, lowerCase = false) {
        a.assert(Number.isInteger(number) && number > 0, 'The number should be a positive integer.');
        const romanBuf = [];
        let pos;
        while (number >= 1000) {
            number -= 1000;
            romanBuf.push('M');
        }
        pos = number / 100 | 0;
        number %= 100;
        romanBuf.push(ROMAN_NUMBER_MAP[pos]);
        pos = number / 10 | 0;
        number %= 10;
        romanBuf.push(ROMAN_NUMBER_MAP[10 + pos]);
        romanBuf.push(ROMAN_NUMBER_MAP[20 + number]);
        const romanStr = romanBuf.join('');
        return lowerCase ? romanStr.toLowerCase() : romanStr;
    }
    function log2(x) {
        if (x <= 0) {
            return 0;
        }
        return Math.ceil(Math.log2(x));
    }
    function readInt8(data, offset) {
        return data[offset] << 24 >> 24;
    }
    function readUint16(data, offset) {
        return data[offset] << 8 | data[offset + 1];
    }
    function readUint32(data, offset) {
        return (data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]) >>> 0;
    }
    function isWhiteSpace(ch) {
        return ch === 32 || ch === 9 || ch === 13 || ch === 10;
    }
    function parseXFAPath(path) {
        const positionPattern = /(.+)\[([0-9]+)\]$/;
        return path.split('.').map(component => {
            const m = component.match(positionPattern);
            if (m) {
                return {
                    name: m[1],
                    pos: parseInt(m[2], 10)
                };
            }
            return {
                name: component,
                pos: 0
            };
        });
    }
    function escapePDFName(str) {
        const buffer = [];
        let start = 0;
        for (let i = 0, ii = str.length; i < ii; i++) {
            const char = str.charCodeAt(i);
            if (char < 33 || char > 126 || char === 35 || char === 40 || char === 41 || char === 60 || char === 62 || char === 91 || char === 93 || char === 123 || char === 125 || char === 47 || char === 37) {
                if (start < i) {
                    buffer.push(str.substring(start, i));
                }
                buffer.push(`#${ char.toString(16) }`);
                start = i + 1;
            }
        }
        if (buffer.length === 0) {
            return str;
        }
        if (start < str.length) {
            buffer.push(str.substring(start, str.length));
        }
        return buffer.join('');
    }
    function _collectJS(entry, xref, list, parents) {
        if (!entry) {
            return;
        }
        let parent = null;
        if (b.isRef(entry)) {
            if (parents.has(entry)) {
                return;
            }
            parent = entry;
            parents.put(parent);
            entry = xref.fetch(entry);
        }
        if (Array.isArray(entry)) {
            for (const element of entry) {
                _collectJS(element, xref, list, parents);
            }
        } else if (entry instanceof b.Dict) {
            if (b.isName(entry.get('S'), 'JavaScript') && entry.has('JS')) {
                const js = entry.get('JS');
                let code;
                if (b.isStream(js)) {
                    code = a.bytesToString(js.getBytes());
                } else {
                    code = js;
                }
                code = a.stringToPDFString(code);
                if (code) {
                    list.push(code);
                }
            }
            _collectJS(entry.getRaw('Next'), xref, list, parents);
        }
        if (parent) {
            parents.remove(parent);
        }
    }
    function collectActions(xref, dict, eventType) {
        const actions = Object.create(null);
        if (dict.has('AA')) {
            const additionalActions = dict.get('AA');
            for (const key of additionalActions.getKeys()) {
                const action = eventType[key];
                if (!action) {
                    continue;
                }
                const actionDict = additionalActions.getRaw(key);
                const parents = new b.RefSet();
                const list = [];
                _collectJS(actionDict, xref, list, parents);
                if (list.length > 0) {
                    actions[action] = list;
                }
            }
        }
        if (dict.has('A')) {
            const actionDict = dict.get('A');
            const parents = new b.RefSet();
            const list = [];
            _collectJS(actionDict, xref, list, parents);
            if (list.length > 0) {
                actions.Action = list;
            }
        }
        return a.objectSize(actions) > 0 ? actions : null;
    }
    return {
        collectActions,
        escapePDFName,
        getArrayLookupTableFactory,
        getInheritableProperty,
        getLookupTableFactory,
        isWhiteSpace,
        log2,
        MissingDataException,
        parseXFAPath,
        readInt8,
        readUint16,
        readUint32,
        toRomanNumerals,
        XRefEntryException,
        XRefParseException
    };
});