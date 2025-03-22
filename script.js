// Global variables
let apps = [];
let filteredApps = [];
let currentSlide = 0;

// Fetch and parse CSV data
async function loadData() {
    try {
        const response = await fetch('data/paragliding-apps.csv');
        const csvData = await response.text();
        
        // Parse CSV
        const rows = csvData.split('\n').filter(row => row.trim() !== '');
        const headers = rows[0].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
        
        apps = rows.slice(1).map(row => {
            const cells = row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
            const obj = {};
            headers.forEach((header, index) => {
                let value = cells[index] || '';
                value = value.replace(/^"|"$/g, '').trim();
                const cleanHeader = header.toLowerCase().replace(/ /g, '_');
                obj[cleanHeader] = value;
            });
            return obj;
        });

        filteredApps = [...apps];
        console.log('apps',filteredApps);
        init();
    } catch (error) {
        console.error('Error loading data:', error);
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = 'Failed to load data. Please try again later.';
        document.body.prepend(errorElement);
    }
}

// Initialize app
function init() {
    renderTable(filteredApps);
    renderTags();
    setupEventListeners();
}

// Render main table
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = data.map(app => `
        <tr onclick="showSlide(${apps.indexOf(app)})">
            <td>${app.name}</td>
            <td>${app.platform}</td>
            <td>${app.type}</td>
            <td>${app.short_description}</td>
        </tr>
    `).join('');
}

// Render tag filters
function renderTags() {
    const tags = [...new Set(apps.flatMap(app => 
        app.type.split(/,\s*/).filter(t => t)
    ))];
    const tagList = document.getElementById('tagList');
    tagList.innerHTML = tags.map(tag => `
        <div class="tag" onclick="filterByTag('${tag}')">${tag}</div>
    `).join('');
}

// Filter by tag
function filterByTag(tag) {
    filteredApps = apps.filter(app => 
        app.type.split(/,\s*/).includes(tag)
    );
    renderTable(filteredApps);
}

function showSlide(index) {
    currentSlide = index;
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('slideView').style.display = 'block';
    
    const app = filteredApps[index];
    const slideContainer = document.getElementById('slideContainer');
    slideContainer.innerHTML = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-start mb-4">
                        <h1 class="text-3xl font-bold text-gray-900">${app.name}</h1>
                        <button onclick="showMainView()" class="text-gray-500 hover:text-gray-700 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <a href="${app.url}" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                        ${app.url}
                    </a>
                </div>

                <div class="p-6 overflow-y-auto flex-1 space-y-4">
                    ${app.platform ? `
                    <div>
                        <dt class="text-sm font-semibold text-gray-600 uppercase">Platform</dt>
                        <dd class="mt-1 text-gray-900">${app.platform}</dd>
                    </div>` : ''}

                    ${app.type ? `
                    <div>
                        <dt class="text-sm font-semibold text-gray-600 uppercase">Type</dt>
                        <dd class="mt-1 text-gray-900">${app.type}</dd>
                    </div>` : ''}

                    ${app.short_description ? `
                    <div>
                        <dt class="text-sm font-semibold text-gray-600 uppercase">Description</dt>
                        <dd class="mt-1 text-gray-900">${app.short_description}</dd>
                    </div>` : ''}

                    ${app.pros ? `
                    <div>
                        <dt class="text-sm font-semibold text-gray-600 uppercase">Pros</dt>
                        <dd class="mt-1 text-gray-900">${app.pros}</dd>
                    </div>` : ''}

                    ${app.cons ? `
                    <div>
                        <dt class="text-sm font-semibold text-gray-600 uppercase">Cons</dt>
                        <dd class="mt-1 text-gray-900">${app.cons}</dd>
                    </div>` : ''}

                    ${app.cost ? `
                    <div>
                        <dt class="text-sm font-semibold text-gray-600 uppercase">Cost</dt>
                        <dd class="mt-1 text-gray-900">${app.cost}</dd>
                    </div>` : ''}

                    <div id="extendedDescription" class="prose max-w-none mt-6"></div>
                </div>

                <div class="p-4 bg-gray-50 border-t border-gray-200 flex justify-between">
                    <button 
                        ${currentSlide === 0 ? 'disabled' : ''} 
                        onclick="showSlide(${currentSlide - 1})"
                        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>
                    <button 
                        ${currentSlide === filteredApps.length - 1 ? 'disabled' : ''} 
                        onclick="showSlide(${currentSlide + 1})"
                        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    `;

    // Load extended description after initial render
    loadExtendedDescription(app);
}

// New method to load extended description
async function loadExtendedDescription(app) {
    const container = document.getElementById('extendedDescription');
    if (!container) return;

    const markdownPath = `data/apps/${encodeURIComponent(app.name)}/description.md`;
    
    try {
        const response = await fetch(markdownPath);
        if (!response.ok) return; // Skip if not found
        
        const markdown = await response.text();
        const unsafeHtml = marked.parse(markdown);
        const cleanHtml = DOMPurify.sanitize(unsafeHtml, {
            USE_PROFILES: { html: true },
            ALLOWED_TAGS: ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'img'],
            ALLOWED_ATTR: ['href', 'src', 'alt']
        });

        container.innerHTML = cleanHtml;
    } catch (error) {
        console.error('Error loading extended description:', error);
    }
}
// Return to main view
function showMainView() {
    document.getElementById('mainView').style.display = 'block';
    document.getElementById('slideView').style.display = 'none';
}

function setupEventListeners() {
    // Search functionality
    const searchBox = document.querySelector('.search-box');
    if (!searchBox) {
        console.error('Search box element not found');
        return;
    }
    
    searchBox.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filteredApps = apps.filter(app => 
            Object.values(app).some(value =>
                value.toLowerCase().includes(searchTerm)
            )
        );
        renderTable(filteredApps);
    });

    // Table sorting - wait for headers to exist
    const setupTableHeaders = () => {
        const headers = document.querySelectorAll('th');
        if (headers.length === 0) {
            requestAnimationFrame(setupTableHeaders);
            return;
        }

        headers.forEach(th => {
            th.addEventListener('click', () => {
                const column = th.innerText.toLowerCase().replace(/ /g, '_');
                filteredApps.sort((a, b) => (a[column] || '').localeCompare(b[column] || ''));
                renderTable(filteredApps);
            });
        });
    };

    setupTableHeaders();
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    loadData();
});
