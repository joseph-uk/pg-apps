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
    await new Promise((resolve) => {
        fs.createReadStream('data/paragliding-apps.csv')
            .pipe(csv())
            .on('data', (row) => apps.push(row))
            .on('end', () => {
                console.log(`✅ Found ${apps.length} apps in CSV`);
                resolve();
            });
    });

    console.log('🔍 Checking for missing descriptions...');
    
    for (const [index, app] of apps.entries()) {
        const appName = app.name;
        console.log(`\n--- Processing app ${index + 1}/${apps.length}: ${appName} ---`);
        
        const appPath = path.join('data', 'apps', appName);
        const descPath = path.join(appPath, 'description.md');

        try {
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
            console.log(`📝 Using URL: ${app.url}`);

            // Generate content
            const prompt = `Generate markdown documentation for ${appName} (${app.url}) focusing on:
- Quick overall summary (1 paragraph)
- Specific key features (bulleted list)
- Pro/paid features (bulleted list)
- Links to official resources/guides/tutorials (list with URLs)

Return only the markdown content with no additional commentary. Use ## headings for each section.`;

            console.log('🧠 Sending request to Gemini API...');
            const result = await model.generateContent(prompt);
            const mdContent = result.response.text();
            
            console.log(`📄 Writing generated content to ${descPath}`);
            fs.writeFileSync(descPath, mdContent);
            console.log('✅ Successfully generated description');

        } catch (error) {
            console.error(`❌ Error processing ${appName}:`, error);
            console.log('⏭️  Continuing to next app...');
        }
    }

    console.log('\n🎉 Process completed!');
    console.log('💾 Changes will be automatically committed and pushed');
}

processApps()
    .catch(error => {
        console.error('🔥 Critical error in process:', error);
        process.exit(1);
    });