define([
    '../shared/util.js',
    '../shared/xml_parser.js'
], function (a, b) {
    'use strict';
    class Metadata {
        constructor(data) {
            a.assert(typeof data === 'string', 'Metadata: input is not a string');
            data = this._repair(data);
            const parser = new b.SimpleXMLParser({ lowerCaseName: true });
            const xmlDocument = parser.parseFromString(data);
            this._metadataMap = new Map();
            if (xmlDocument) {
                this._parse(xmlDocument);
            }
            this._data = data;
        }
        _repair(data) {
            return data.replace(/^[^<]+/, '').replace(/>\\376\\377([^<]+)/g, function (all, codes) {
                const bytes = codes.replace(/\\([0-3])([0-7])([0-7])/g, function (code, d1, d2, d3) {
                    return String.fromCharCode(d1 * 64 + d2 * 8 + d3 * 1);
                }).replace(/&(amp|apos|gt|lt|quot);/g, function (str, name) {
                    switch (name) {
                    case 'amp':
                        return '&';
                    case 'apos':
                        return "'";
                    case 'gt':
                        return '>';
                    case 'lt':
                        return '<';
                    case 'quot':
                        return '"';
                    }
                    throw new Error(`_repair: ${ name } isn't defined.`);
                });
                let chars = '';
                for (let i = 0, ii = bytes.length; i < ii; i += 2) {
                    const code = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1);
                    if (code >= 32 && code < 127 && code !== 60 && code !== 62 && code !== 38) {
                        chars += String.fromCharCode(code);
                    } else {
                        chars += '&#x' + (65536 + code).toString(16).substring(1) + ';';
                    }
                }
                return '>' + chars;
            });
        }
        _getSequence(entry) {
            const name = entry.nodeName;
            if (name !== 'rdf:bag' && name !== 'rdf:seq' && name !== 'rdf:alt') {
                return null;
            }
            return entry.childNodes.filter(node => node.nodeName === 'rdf:li');
        }
        _getCreators(entry) {
            if (entry.nodeName !== 'dc:creator') {
                return false;
            }
            if (!entry.hasChildNodes()) {
                return true;
            }
            const seqNode = entry.childNodes[0];
            const authors = this._getSequence(seqNode) || [];
            this._metadataMap.set(entry.nodeName, authors.map(node => node.textContent.trim()));
            return true;
        }
        _parse(xmlDocument) {
            let rdf = xmlDocument.documentElement;
            if (rdf.nodeName !== 'rdf:rdf') {
                rdf = rdf.firstChild;
                while (rdf && rdf.nodeName !== 'rdf:rdf') {
                    rdf = rdf.nextSibling;
                }
            }
            if (!rdf || rdf.nodeName !== 'rdf:rdf' || !rdf.hasChildNodes()) {
                return;
            }
            for (const desc of rdf.childNodes) {
                if (desc.nodeName !== 'rdf:description') {
                    continue;
                }
                for (const entry of desc.childNodes) {
                    const name = entry.nodeName;
                    if (name === '#text') {
                        continue;
                    }
                    if (this._getCreators(entry)) {
                        continue;
                    }
                    this._metadataMap.set(name, entry.textContent.trim());
                }
            }
        }
        getRaw() {
            return this._data;
        }
        get(name) {
            return this._metadataMap.get(name) || null;
        }
        getAll() {
            return a.objectFromEntries(this._metadataMap);
        }
        has(name) {
            return this._metadataMap.has(name);
        }
    }
    return { Metadata };
});