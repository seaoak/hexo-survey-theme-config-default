#!/usr/bin/env node

'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const process = require('process');
const https = require('https');

const jsdom = require('jsdom');
const YAML = require('yaml');

const catalog_url = 'https://hexo.io/themes/';
const cache_filename = './cache.json';

function usage() {
    console.log('Usage:');
    console.log('    node index.js run [limit]');
    console.log('    node index.js clean');
    process.exit(1);
}

function isUnique(arr) {
    const table = {};
    arr.forEach(x => {
        table[x] = (table[x] || 0) + 1;
    });
    return Object.values(table).every(count => count === 1);
}

const cache = (() => {
    const storage = {};

    function store(key, value) {
        assert(key);
        assert.notStrictEqual(value, undefined);
        assert(value);
        storage[key] = value;
    }

    function query(key) {
        assert(key);
        return storage[key];
    }

    function save() {
        assert.notEqual(Object.keys(storage).length, 0, 'CACHE: save(): no content');
        const data = JSON.stringify(storage);
        fs.writeFileSync(cache_filename, data);
        console.info(`CACHE: ${Object.keys(storage).length} entries are saved to ${cache_filename}`);
    }

    function load() {
        assert.equal(Object.keys(storage).length, 0, 'CACHE: load(): contents already exist');
        if (!fs.existsSync(cache_filename)) {
            console.info(`CACHE: cache file does not exist: ${cache_filename}`);
            return;
        }
        const data = fs.readFileSync(cache_filename, {encoding: 'utf8'});
        assert(data);
        Object.assign(storage, JSON.parse(data));
        console.info(`CACHE: ${Object.keys(storage).length} entries are loaded from ${cache_filename}`);
    }

    function clean() {
        if (!fs.existsSync(cache_filename)) {
            console.info(`CACHE: no cache file: ${cache_filename}`);
            return;
        }
        fs.unlinkSync(cache_filename);
        console.info(`CACHE: cache file is removed: ${cache_filename}`);
    }

    return Object.freeze({ store, query, save, load, clean });
})();

function fetchURL(url) {
    // https://nodejs.org/docs/latest/api/http.html#httpgeturl-options-callback
    const cached_data = cache.query(url);
    if (cached_data) return Promise.resolve(cached_data);
    return new Promise((resolve, _reject) => {
        https.get(url, res => {
            assert.strictEqual(res.statusCode, 200);
            assert(/^text\/(html|plain); charset=utf-8$/i.test(res.headers['content-type'] || ''));
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => {
                cache.store(url, rawData);
                resolve(rawData);
            });
        }).on('error', err => {
            console.error('ERROR: fetchURL() failed: ' + err.message);
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
        const themes = list.map(elem => {
            const anchors = elem.querySelectorAll('a.plugin-name');
            assert.strictEqual(anchors.length, 1);
            const anchor = anchors[0];
            const name = anchor.textContent;
            assert(name);
            const repository_url = anchor.href;
            assert(repository_url);
            assert(repository_url.startsWith('https://'));
            console.debug(`${name} ${repository_url}`);
            return { name, repository_url };
        });
        assert(isUnique(themes.map(theme => theme.name)));
        themes.sort((a, b) => a.name.localeCompare(b.name));
        resolve(themes);
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
    if (!theme.raw_url) return Promise.resolve(theme); // skip
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
                        console.warn('WARNING: can not parse YAML file: ' + theme.raw_url);
                        theme.is_error = e;
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
    const limit = (() => {
        const cmd = process.argv[2] || '';
        if (cmd === 'run') {
            if (process.argv.length === 3) return 1;
            if ((process.argv.length === 4) && /^[1-9][0-9]*$/.test(process.argv[3])) return Number(process.argv[3]);
            usage();
        }
        if (cmd === 'clean') {
            if (process.argv.length !== 3) usage();
            cache.clean();
            process.exit(0);
        }
        usage();
    })();
    cache.load();
    fetchURL(catalog_url)
        .then(html => parseHTML(html))
        .then(dom => analyzeCatalog(dom))
        .then(themes => {
            console.log(`${themes.length} themes are found in catalog`);
            themes.filter(theme => theme.repository_url.startsWith('https://github.com/')).slice(0, limit).forEach(theme => theme.is_target = true);
            return Promise.all(themes.map(theme => new Promise((resolve, _reject) => {
                const { name, repository_url, is_target } = theme;
                if (!is_target) return resolve(theme);
                fetchURL(repository_url)
                    .then(html => parseHTML(html))
                    .then(dom => analyzeGitHub(dom))
                    .then(github_info => {
                        Object.assign(theme, github_info);
                        resolve(theme);
                    });
            })));
        })
        .then(themes => {
            console.debug(themes);
            console.log(`${themes.filter(theme => theme.is_target).length} themes are found in GitHub`);
            return Promise.all(themes.map(theme => loadThemeConfig(theme)));
        })
        .then(themes => {
            console.debug(themes.map(theme => Object.assign({}, theme, {config_text: '...'})));
            console.log(`${themes.filter(theme => theme.config).length} themes are processing for analysis`);
            cache.save();
            console.log('Completed');
        }).catch(err => {
            console.error(err);
            console.error('ERROR: fatal');
            process.exit(2);
        });
}

main();
