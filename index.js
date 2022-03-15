#!/usr/bin/env node

'use strict';

const assert = require('assert').strict;
const process = require('process');
const https = require('https');

const jsdom = require('jsdom');
const YAML = require('yaml');

const catalog_url = 'https://hexo.io/themes/';

function fetchURL(url) {
    // https://nodejs.org/docs/latest/api/http.html#httpgeturl-options-callback
    return new Promise((resolve, _reject) => {
        https.get(url, res => {
            assert.strictEqual(res.statusCode, 200);
            assert(/^text\/(html|plain); charset=utf-8$/i.test(res.headers['content-type'] || ''));
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => {
                resolve(rawData);
            });
        }).on('error', err => {
            console.error('fetchURL() failed: ' + err.message);
            process.exit(2);
        });
    });
}

function parseHTML(html) {
    // https://www.npmjs.com/package/jsdom
    return new Promise((resolve, _reject) => {
        const { JSDOM } = jsdom;
        const dom = new JSDOM(html);
        resolve(dom.window.document);
    });
}

function analyzeCatalog(dom) {
    return new Promise((resolve, _reject) => {
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
        resolve(table);
    });
}

function analyzeGitHub(dom) {
    return new Promise((resolve, _reject) => {
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
            file_url.replace('https://github.com/', '/') // maybe not necessary (relative URL)
                .replace(/^[/]/, 'https://raw.githubusercontent.com/')
                .replace('/blob/', '/');
        const result = { filename, file_url, raw_url };
        Object.freeze(result); // just in case
        console.debug(result);
        resolve(result);
    });
}

function loadThemeConfig(theme) {
    return new Promise((resolve, _reject) => {
        fetchURL(theme.raw_url)
            .then(text => {
                theme.config_text = text;
                if (theme.filename.endsWith('.yml')) {
                    try {
                        // https://www.npmjs.com/package/yaml
                        theme.config = YAML.parse(text);
                    } catch (e) {
                        console.debug(e);
                        console.err('can not parse YAML file: ' + theme.raw_url);
                        process.exit(2);
                    }
                } else if (theme.filename.endsWith('.json')) {
                    assert(false); // not implemented yet
                } else {
                    assert(false); // never reach
                }
                resolve(theme);
            });
    });
}

function main() {
    const limit = process.argv[2] || 1;
    fetchURL(catalog_url)
        .then(html => parseHTML(html))
        .then(dom => analyzeCatalog(dom))
        .then(themes => {
            const names = Object.keys(themes);
            console.log(`${names.length} themes are found in catalog`);
            names.sort();
            const targets = names.filter(name => themes[name].startsWith('https://github.com/')).slice(0, limit);
            return Promise.all(targets.map(name => new Promise((resolve, _reject) => {
                const repository_url = themes[name];
                fetchURL(repository_url)
                    .then(html => parseHTML(html))
                    .then(dom => analyzeGitHub(dom))
                    .then(github_info => {
                        const { filename, file_url, raw_url } = github_info;
                        resolve({ name, repository_url, filename, file_url, raw_url });
                    });
            })));
        })
        .then(themes => {
            console.debug(themes);
            console.log(`${themes.length} themes are found in GitHub`);
            return Promise.all(themes.map(theme => loadThemeConfig(theme)));
        })
        .then(themes => {
            console.debug(themes);
            console.log('Completed');
        }).catch(err => {
            console.error(err);
            process.exit(2);
        });
}

main();
