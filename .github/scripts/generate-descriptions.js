import { GoogleGenerativeAI } from '@google/generative-ai';
import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ensureDir, existsSync, writeFileSync } from 'fs-extra';

// ES module equivalent for __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.0-pro',
    apiVersion: 'v1'
});

async function processApps() {
    console.log('🚀 Starting description generation process');
    
    // Read CSV file
    console.log('📖 Reading CSV data from data/paragliding-apps.csv');
    const apps = [];
    
    await new Promise((resolve, reject) => {
        createReadStream(join(__dirname, '..', '..', 'data', 'paragliding-apps.csv'))
            .pipe(csv())
            .on('data', (row) => {
                if (!row.name || !row.url) {
                    console.warn('⚠️ Skipping invalid row:', row);
                    return;
                }
                apps.push({
                    name: row.name.trim(),
                    url: row.url.trim()
                });
            })
            .on('end', () => {
                console.log(`✅ Found ${apps.length} valid apps in CSV`);
                resolve();
            })
            .on('error', reject);
    });

    console.log('🔍 Checking for missing descriptions...');
    
    for (const [index, app] of apps.entries()) {
        console.log(`\n--- Processing app ${index + 1}/${apps.length}: ${app.name} ---`);
        
        try {
            const sanitizedName = app.name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
            const appPath = join(__dirname, '..', '..', 'data', 'apps', sanitizedName);
            const descPath = join(appPath, 'description.md');

            if (!existsSync(appPath)) {
                console.log(`📂 Creating directory: ${appPath}`);
                await ensureDir(appPath);
            }

            if (existsSync(descPath)) {
                console.log(`⏩ Skipping - description exists at ${descPath}`);
                continue;
            }

            console.log('🛠️ Generating new description...');
            const result = await model.generateContent(`Generate markdown for ${app.name} (${app.url})...`);
            const mdContent = result.response.text();
            
            writeFileSync(descPath, mdContent);
            console.log(`✅ Saved description to ${descPath}`);

        } catch (error) {
            console.error(`❌ Error processing ${app.name}:`, error);
        }
    }

    console.log('\n🎉 Process completed!');
}

processApps().catch(console.error);