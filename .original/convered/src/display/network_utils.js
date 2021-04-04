define([
    '../shared/util.js',
    './content_disposition.js'
], function (a, b) {
    'use strict';
    function validateRangeRequestCapabilities({getResponseHeader, isHttp, rangeChunkSize, disableRange}) {
        a.assert(rangeChunkSize > 0, 'Range chunk size must be larger than zero');
        const returnValues = {
            allowRangeRequests: false,
            suggestedLength: undefined
        };
        const length = parseInt(getResponseHeader('Content-Length'), 10);
        if (!Number.isInteger(length)) {
            return returnValues;
        }
        returnValues.suggestedLength = length;
        if (length <= 2 * rangeChunkSize) {
            return returnValues;
        }
        if (disableRange || !isHttp) {
            return returnValues;
        }
        if (getResponseHeader('Accept-Ranges') !== 'bytes') {
            return returnValues;
        }
        const contentEncoding = getResponseHeader('Content-Encoding') || 'identity';
        if (contentEncoding !== 'identity') {
            return returnValues;
        }
        returnValues.allowRangeRequests = true;
        return returnValues;
    }
    function extractFilenameFromHeader(getResponseHeader) {
        const contentDisposition = getResponseHeader('Content-Disposition');
        if (contentDisposition) {
            let filename = b.getFilenameFromContentDispositionHeader(contentDisposition);
            if (filename.includes('%')) {
                try {
                    filename = decodeURIComponent(filename);
                } catch (ex) {
                }
            }
            if (/\.pdf$/i.test(filename)) {
                return filename;
            }
        }
        return null;
    }
    function createResponseStatusError(status, url) {
        if (status === 404 || status === 0 && url.startsWith('file:')) {
            return new a.MissingPDFException('Missing PDF "' + url + '".');
        }
        return new a.UnexpectedResponseException('Unexpected server response (' + status + ') while retrieving PDF "' + url + '".', status);
    }
    function validateResponseStatus(status) {
        return status === 200 || status === 206;
    }
    return {
        createResponseStatusError,
        extractFilenameFromHeader,
        validateRangeRequestCapabilities,
        validateResponseStatus
    };
});