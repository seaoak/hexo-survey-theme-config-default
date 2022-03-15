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
    Object.freeze(table); // just in case
    console.debug(table);
    callback(table);
}

function analyzeGitHub(dom, callback) {
    const divElem = dom.querySelectorAll('.Box .Details')[1];
    assert(divElem);
    const { filename, file_url } =
        Array.from(divElem.querySelectorAll('a.Link--primary'))
            .filter(elem => /^_config\.(yml|json)$/.test(elem.textContent))
            .reduce((acc, elem) => {
                assert(!acc); // not twice
                const filename = elem.textContent;
                const file_url = elem.href;
                return { filename, file_url };
            }, null);
    const raw_url =
        file_url.replace('https://github.com/', '/')
            .replace(/^[/]/, 'https://raw.githubusercontent.com/')
            .replace('/blob/', '/');
    const result = { filename, file_url, raw_url };
    Object.freeze(result); // just in case
    console.debug(result);
    callback(result);
}

function main() {
    fetchHTML(catalog_url, html => {
        parseHTML(html, dom => {
            analyzeCatalog(dom, themes => {
                const names = Object.keys(themes);
                console.log(`${names.length} themes are found in catalog`);
                const targets = 
                    names.filter(name => themes[name].startsWith('https://github.com/'))
                        .slice(0, 1);
                const table = {};
                targets.forEach(name => {
                    const repository_url = themes[name];
                    fetchHTML(repository_url, html => {
                        parseHTML(html, dom => {
                            analyzeGitHub(dom, github_info => {
                                const { filename, file_url, raw_url } = github_info;
                                table[name] = { name, repository_url, filename, file_url, raw_url };
                                if (Object.keys(table).length == targets.length) {
                                    Object.freeze(table); // just in case
                                    console.debug(table);
                                    console.log('${Object.keys(table).length} themes are found in GitHub');
                                }
                            });
                        });
                    });
                });
            });
        });
    });
}

main();
