define(function () {
    'use strict';
    const GlobalWorkerOptions = Object.create(null);
    GlobalWorkerOptions.workerPort = GlobalWorkerOptions.workerPort === undefined ? null : GlobalWorkerOptions.workerPort;
    GlobalWorkerOptions.workerSrc = GlobalWorkerOptions.workerSrc === undefined ? '' : GlobalWorkerOptions.workerSrc;
    return { GlobalWorkerOptions };
});