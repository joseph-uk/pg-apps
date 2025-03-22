const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { ensureDir } = require('fs-extra');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

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
                if (!row.name || !row.url) {
                    console.warn('⚠️  Skipping invalid row:', row);
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
            // Sanitize app name for filesystem
            const sanitizedName = app.name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
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
            console.error(`❌ Error processing ${app.name}:`, error);
        }
    }

    console.log('\n🎉 Process completed!');
}

processApps().catch(console.error);