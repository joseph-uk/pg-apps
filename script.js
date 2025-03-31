// Global variables
let apps = [];
let filteredApps = [];
let currentSlide = 0;

// Fetch and parse CSV data
async function loadData() {
    try {
        console.log('Loading data...');
        const response = await fetch('data/paragliding-apps.csv');
        const csvData = await response.text();
        console.log('Data loaded:', csvData);
        
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
        console.log('Parsed apps:', filteredApps);
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
    console.log('Initializing app...');
    renderTable(filteredApps);
    renderTags();
    document.querySelector('.search-box').addEventListener('input', function(event) {
        const query = event.target.value.toLowerCase();
        console.log('Search query:', query);
        filteredApps = apps.filter(app => app.name.toLowerCase().includes(query));
        renderTable(filteredApps);
    });
}

// Render main table
function renderTable(data) {
    console.log('Rendering table with data:', data);
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = data.map((app, index) => `
        <tr onclick="showSlide(${index})">
            <td>${app.name}</td>
            <td>${app.platform}</td>
            <td>${app.type}</td>
            <td>${app.short_description}</td>
        </tr>
    `).join('');
}

// Function to show slide view
function showSlide(index) {
    console.log('Showing slide for index:', index);
    currentSlide = index;
    const app = filteredApps[index];
    const slideContainer = document.getElementById('slideContainer');
    slideContainer.innerHTML = `
        <h2 class="text-2xl font-bold mb-4">${app.name}</h2>
        <div class="slide-content">
            <p><strong>Platform:</strong> ${app.platform}</p>
            <p><strong>Type:</strong> ${app.type}</p>
            <p><strong>Description:</strong> ${app.short_description}</p>
        </div>
    `;
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('slideView').classList.remove('hidden');
}

// Function to show main view
function showMainView() {
    document.getElementById('mainView').classList.remove('hidden');
    document.getElementById('slideView').classList.add('hidden');
}

// Function to generate a color palette
function generateColorPalette(tags) {
    const colors = [
        '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#FF8C33', '#33FFF5', '#8C33FF', '#FF3333', '#33FF8C', '#FF5733'
    ];
    const tagColors = {};
    tags.forEach((tag, index) => {
        tagColors[tag] = colors[index % colors.length];
    });
    return tagColors;
}

// Render tag filters
function renderTags() {
    const tags = [...new Set(apps.flatMap(app => 
        app.type.split(/,\s*/).filter(t => t)
    ))];
    const tagColors = generateColorPalette(tags);
    const tagList = document.getElementById('tagList');
    tagList.innerHTML = tags.map(tag => `
        <button class="tag" style="background-color: ${tagColors[tag]}">
            ${tag}
        </button>
    `).join('');
}

// Event listeners
document.getElementById('tagList').addEventListener('click', function(event) {
    if (event.target.classList.contains('tag')) {
        const tag = event.target.textContent.trim().toLowerCase();
        console.log('Tag clicked:', tag);
        filteredApps = apps.filter(app => app.type.toLowerCase().includes(tag));
        renderTable(filteredApps);
        showMainView();
    }
});

document.querySelector('.search-box').addEventListener('input', function(event) {
    const query = event.target.value.toLowerCase();
    console.log('Search query:', query);
    filteredApps = apps.filter(app => app.name.toLowerCase().includes(query));
    renderTable(filteredApps);
});

// Load data on page load
window.onload = loadData;
