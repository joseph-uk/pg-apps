if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY environment variable');
    process.exit(1);
  }

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { ensureDir } = require('fs-extra');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-1.0-pro',
    apiVersion: 'v1'
});

// Verify model access
try {
    const models = await genAI.listModels();
    console.log('✅ Available models:', models);
} catch (error) {
    console.error('❌ Failed to list models:', error);
    process.exit(1);
}

async function processApps() {
    console.log('🚀 Starting description generation process');
    
    // Read CSV file
    console.log('📖 Reading CSV data from data/paragliding-apps.csv');
    const apps = [];
    await new Promise((resolve, reject) => {
        fs.createReadStream('data/paragliding-apps.csv')
            .pipe(csv())
            .on('data', (row) => {
                // Add validation for required fields
                if (!row.Name || !row.URL) {
                    console.warn('⚠️  Skipping invalid row:', row);
                    return;
                }
                apps.push({
                    name: row.Name.trim(),
                    url: row.URL.trim()
                });
            })
            .on('end', () => {
                console.log(`✅ Found ${apps.length} valid apps in CSV`);
                resolve();
            })
            .on('error', reject);
    });

    console.log('apps',apps);

    console.log('🔍 Checking for apps that need description generating...');
    
    for (const [index, app] of apps.entries()) {
        console.log(`\n--- Processing app ${index + 1}/${apps.length}: ${app.name} ---`);
        console.log('app',app);
        try {
            // Add delay between requests
            const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

            // Inside your processing loop
            await delay(2000); // 2 second delay between requests
            // Sanitize app name for filesystem
            const sanitizedName = app.name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
            console.log('sanitizedName',sanitizedName);
            const appPath = path.join('data', 'apps', sanitizedName);
            const descPath = path.join(appPath, 'description.md');

            // Create directory if needed
            if (!fs.existsSync(appPath)) {
                console.log(`📂 Creating directory: ${appPath}`);
                await ensureDir(appPath);
            }

            // Check for existing description
            if (fs.existsSync(descPath)) {
                console.log(`⏩ Skipping - description already exists at ${descPath}`);
                continue;
            }

            console.log('🛠️  No description found - generating new one');
            console.log(`🔗 Using URL: ${app.url}`);

            // Generate content
            const prompt = `Generate markdown documentation for ${app.name} (${app.url})...`;
            
            console.log('🧠 Sending request to Gemini API...');
            const result = await model.generateContent(prompt);
            const mdContent = result.response.text();
            
            console.log(`📄 Writing generated content to ${descPath}`);
            fs.writeFileSync(descPath, mdContent);
            console.log('✅ Successfully generated description');

        } catch (error) {
            if (error.status === 404) {
                console.error('‼️ Model not found - verify model name and API version');
                process.exit(1);
            }
        }
    }

    console.log('\n🎉 Process completed!');
}

processApps().catch(console.error);