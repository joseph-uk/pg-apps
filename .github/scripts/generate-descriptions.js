import { GoogleGenerativeAI,HarmCategory,
    HarmBlockThreshold, } from '@google/generative-ai';
import { createReadStream } from 'fs';
import csvParser from 'csv-parser';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fsExtra from 'fs-extra';

// Destructure fs-extra methods
const { ensureDir, existsSync, writeFileSync } = fsExtra;

// ES module path setup
const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Gemini AI
const modelConfig={
    model: "gemini-2.0-flash-thinking-exp-01-21",
    systemInstruction: "You are a web researcher who can take the name/url of a website or app to generate a markdown article that includes.\n\nDo some research including visiting hte URL and searching for other information then generate\n\n* quick overall summary\n* specific key features\n* pro features that are paid for\n* links to useful resources/guides/tutorials\n\nreturn only markdown\n\ndo not provide any placeholders/incomplete text\n\nif you do not have clear knowledge, do not guess, you can instead just return an empty string\n\nyou must return only valid markdown, with no placeholders.\n\nuse headings with # prefix\n\nUse links in your repsonse, output the full URLs and use the correct markdown formatting to allow them to be rendered as clickable links\n\nYour goal is to provide a good number of links to useful resources at the bottom, please ensure you include at least 4 urls not including the main home page URL for the app",
  }
const generationConfig = {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 65536,
    responseMimeType: "text/plain",
  };
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel(modelConfig);

async function processApps() {
    console.log('🚀 Starting description generation process');
    
    // Read CSV file
    console.log('📖 Reading CSV data from data/paragliding-apps.csv');
    const apps = [];
    
    await new Promise((resolve, reject) => {
        createReadStream(join(__dirname, '..', '..', 'data', 'paragliding-apps.csv'))
            .pipe(csvParser())
            .on('data', (row) => {
                if (!row.Name || !row.URL) {
                    console.warn('⚠️ Skipping invalid row:', row);
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
            const prompt = `Generate comprehensive markdown documentation for ${app.name} (${app.url}) structured as:

            ## Quick Summary
            [Brief 1-paragraph overview of the app's main purpose]

            ## Key Features
            - [Bulleted list of core features]
            - [Focus on paragliding-specific functionality]

            ## Pro/Paid Features
            - [List of premium features requiring payment]
            - [Include pricing structure if known]

            ## Resources & Guides
            - [Links to official tutorials] 
            - [Community guides]
            - [Relevant YouTube videos]

            Only return the markdown content with no additional commentary. Use the exact section headers above.`;

            console.log('📝 Using prompt:', prompt);

            const result = await model.generateContent(prompt);
            const mdContent = result.response.text();
            
            writeFileSync(descPath, mdContent);
            console.log(`✅ Saved description to ${descPath}`);
            // BREAK AFTER CREATING ONE DESCRIPTION
            break;

        } catch (error) {
            console.error(`❌ Error processing ${app.name}:`, error);
            if (error.message.includes('404')) {
                console.error('‼️ Model not found - verify API access');
                console.error('Current model config:', { model: 'gemini-1.5-pro-latest', apiVersion: 'v1beta' });
                process.exit(1);
            }
        }
    }

    console.log('\n🎉 Process completed!');
}

// Add error handling for uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

processApps().catch(console.error);