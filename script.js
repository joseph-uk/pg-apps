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

// Show detail slide
function showSlide(index) {
    currentSlide = index;
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('slideView').style.display = 'block';
    
    const app = filteredApps[index];
    const slideContainer = document.getElementById('slideContainer');
    slideContainer.innerHTML = `
        <div class="slide active">
            <div class="slide-header">
                <h1>${app.name}</h1>
                <p><a href="${app.url}" target="_blank">${app.url}</a></p>
            </div>
            <div class="slide-content">
                ${app.platform ? `<p><strong>Platform:</strong> ${app.platform}</p>` : ''}
                ${app.type ? `<p><strong>Type:</strong> ${app.type}</p>` : ''}
                ${app.short_description ? `<p><strong>Description:</strong> ${app.short_description}</p>` : ''}
                ${app.pros ? `<p><strong>Pros:</strong> ${app.pros}</p>` : ''}
                ${app.cons ? `<p><strong>Cons:</strong> ${app.cons}</p>` : ''}
                ${app.cost ? `<p><strong>Cost:</strong> ${app.cost}</p>` : ''}
            </div>
            <div class="slide-nav">
                <button ${currentSlide === 0 ? 'disabled' : ''} onclick="showSlide(${currentSlide - 1})">Previous</button>
                <button ${currentSlide === filteredApps.length - 1 ? 'disabled' : ''} onclick="showSlide(${currentSlide + 1})">Next</button>
            </div>
        </div>
    `;
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
