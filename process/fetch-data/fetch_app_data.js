#!/usr/bin/env node

import http from "http";
import fs from "fs";
import path from "path";
import https from "https";
import { parse } from "csv-parse/browser/esm/sync.js";
import { stringify } from "csv-stringify/browser/esm/sync.js";
import { sanitizeName } from "../helper.js";
// Configuration
const PROJECT_ROOT = __dirname + '/../../';
const DATA_DIR = PROJECT_ROOT + '/data/';
const CSV_FILE = DATA_DIR + '/paragliding-apps.csv';
const RAW_DATA_DIR = DATA_DIR + '/raw/';
const RATE_LIMIT_PAUSE = 1000; // milliseconds between requests

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// Helper functions
function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {recursive: true});
    }
}

function sanitizeFilename(name) {
    return sanitizeName(name);
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const req = protocol.get(url, {headers: HEADERS}, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Status Code: ${res.statusCode}`));
            }

            const data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data).toString()));
        });

        req.on('error', reject);
        req.end();
    });
}

async function fetchUrlContent(url) {
    try {
        if (!url || !url.trim() || url === 'undefined') {
            console.log('Invalid URL, skipping');
            return null;
        }

        // Make sure the URL has a protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        return await fetchUrl(url);
    } catch (error) {
        console.error(`Error fetching ${url}: ${error.message}`);
        return null;
    }
}

async function fetchWikipediaContent(appName) {
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(appName)}&format=json`;
        const searchData = JSON.parse(await fetchUrl(searchUrl));

        if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
            const topResult = searchData.query.search[0];
            const pageTitle = topResult.title;
            const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;

            const wikiContent = await fetchUrlContent(pageUrl);

            if (wikiContent) {
                return {
                    title: pageTitle,
                    url: pageUrl,
                    content: wikiContent
                };
            }
        }

        return null;
    } catch (error) {
        console.error(`Error searching Wikipedia for ${appName}: ${error.message}`);
        return null;
    }
}

async function processApp(app) {
    const appName = app.name;
    const appUrl = app.url;

    console.log(`Processing: ${appName}`);
    const safeName = sanitizeFilename(appName);
    const appRawDir = path.join(RAW_DATA_DIR, safeName);
    ensureDirExists(appRawDir);

    const results = {
        name: appName,
        url: appUrl,
        platform: app.platform || '',
        type: app.type || '',
        short_description: app.short_description || '',
        timestamp: new Date().toISOString()
    };

    // Fetch main URL content
    if (appUrl) {
        console.log(`  Fetching URL: ${appUrl}`);
        const htmlContent = await fetchUrlContent(appUrl);

        if (htmlContent) {
            fs.writeFileSync(path.join(appRawDir, `${appUrl}.html`), htmlContent, 'utf8');
            results.website_fetched = true;
        } else {
            results.website_fetched = false;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_PAUSE));
    }

    // Fetch Wikipedia content
    console.log(`  Searching Wikipedia for: ${appName}`);
    const wikiData = await fetchWikipediaContent(appName);

    if (wikiData) {
        fs.writeFileSync(path.join(appRawDir, `${appName}.wikipedia.html`), wikiData.content, 'utf8');
        results.wikipedia = {
            title: wikiData.title,
            url: wikiData.url,
            fetched: true
        };
    } else {
        results.wikipedia = {
            fetched: false
        };
    }

    // Save metadata
    fs.writeFileSync(
        path.join(appRawDir, 'metadata.json'),
        JSON.stringify(results, null, 2),
        'utf8'
    );

    console.log(`  Completed processing: ${appName}`);
    return results;
}

function readAppsFromCsv() {
    try {
        const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true
        });
        return records;
    } catch (error) {
        console.error(`Error reading CSV file: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

async function main() {
    ensureDirExists(RAW_DATA_DIR);

    if (process.argv.length > 2) {
        // Process specific app by name
        const appName = process.argv[2];
        const apps = readAppsFromCsv();
        let found = false;

        for (const app of apps) {
            if (app.name.toLowerCase() === appName.toLowerCase()) {
                await processApp(app);
                found = true;
                break;
            }
        }

        if (!found) {
            console.log(`App '${appName}' not found in CSV.`);
        }
    } else {
        // Process all apps
        const results = [];
        const apps = readAppsFromCsv();

        for (const app of apps) {
            results.push(await processApp(app));
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_PAUSE));
        }

        // Save overall results
        fs.writeFileSync(
            path.join(RAW_DATA_DIR, 'fetch_results.json'),
            JSON.stringify(results, null, 2),
            'utf8'
        );

        console.log(`Completed processing ${results.length} apps.`);
    }
}

main().catch(error => {
    console.error(`Error in main process: ${error.message}`);
    process.exit(1);
});