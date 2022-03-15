#!/usr/bin/env node

'use strict';

const assert = require('assert').strict;
const process = require('process');
const https = require('https');

const jsdom = require('jsdom');

const catalog_url = 'https://hexo.io/themes/';

function fetchHTML(url, callback) {
    // https://nodejs.org/docs/latest/api/http.html#httpgeturl-options-callback
    https.get(url, res => {
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual((res.headers['content-type'] || '').toLowerCase(), 'text/html; charset=UTF-8'.toLowerCase());
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
            callback(rawData);
        });
    }).on('error', err => {
        console.error('fetchHTML() failed: ' + err.message);
        process.exit(2);
    });
}

function parseHTML(html, callback) {
    // https://www.npmjs.com/package/jsdom
    const { JSDOM } = jsdom;
    const dom = new JSDOM(html);
    callback(dom.window.document);
}

function analyzeCatalog(dom, callback) {
    const list = Array.from(dom.querySelectorAll('#plugin-list > li'));
    assert(list.length > 0);
    const table = {};
    list.slice().forEach(elem => {
        const anchors = elem.querySelectorAll('a.plugin-name');
        assert.strictEqual(anchors.length, 1);
        const anchor = anchors[0];
        const name = anchor.textContent;
        assert(name);
        const url = anchor.href;
        assert(url);
        assert(url.startsWith('https://'));
        console.debug(`${name} ${url}`);
        assert(!table[name]); // not twice
        table[name] = url;
    });
    console.debug(table);
    callback(table);
}

function main() {
    fetchHTML(catalog_url, html => {
        parseHTML(html, dom => {
            analyzeCatalog(dom, table => {
                console.log(`RESULT: found ${Object.keys(table).length} themes`);
            });
        });
    });
}

main();
