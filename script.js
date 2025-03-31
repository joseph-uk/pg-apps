document.addEventListener('DOMContentLoaded', () => {
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
            displayErrorMessage('Failed to load data. Please try again later.');
        }
    }

    // Display error message
    function displayErrorMessage(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        document.body.prepend(errorElement);
    }

    // Initialize app
    function init() {
        console.log('Initializing app...');
        renderTable(filteredApps);
        renderTags();
        addEventListeners();
    }

    // Add event listeners
    function addEventListeners() {
        document.querySelector('.search-box').addEventListener('input', handleSearchInput);
        document.getElementById('showFullListBtn').addEventListener('click', showFullList);
        document.getElementById('backToListBtn').addEventListener('click', showMainView);
        document.getElementById('tagList').addEventListener('click', handleTagClick);
        document.getElementById('tableBody').addEventListener('click', handleTableRowClick);
    }

    // Handle search input
    function handleSearchInput(event) {
        const query = event.target.value.toLowerCase();
        console.log('Search query:', query);
        filteredApps = apps.filter(app => app.name.toLowerCase().includes(query));
        updateViewHeading(query ? `Results for: "${query}"` : 'Displaying full list');
        renderTable(filteredApps);
        toggleShowFullListButton(query);
        showMainView();
    }

    // Handle tag click
    function handleTagClick(event) {
        clearSearchInput();
        if (event.target.classList.contains('tag')) {
            const tag = event.target.textContent.trim().toLowerCase();
            console.log('Tag clicked:', tag);
            filteredApps = apps.filter(app => app.type.toLowerCase().includes(tag));
            updateViewHeading(`Viewing tag: "${tag}"`);
            renderTable(filteredApps);
            toggleShowFullListButton(tag);
            showMainView();
        }
    }

    // Handle table row click
    function handleTableRowClick(event) {
        const row = event.target.closest('tr');
        if (row) {
            const index = row.getAttribute('data-index');
            showSlide(index);
        }
    }

    // Render main table
    function renderTable(data) {
        console.log('Rendering table with data:', data);
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = data.map((app, index) => `
            <tr data-index="${index}">
                <td>${app.name}</td>
                <td>${app.platform}</td>
                <td>${app.type}</td>
                <td>${app.short_description}</td>
            </tr>
        `).join('');
    }

    // Show slide view
    function showSlide(index) {
        console.log('Showing slide for index:', index);
        currentSlide = index;
        const app = filteredApps[index];
        const slideContainer = document.getElementById('slideContainer');
        if (!slideContainer) {
            console.error('Slide container or tags element not found');
            return;
        }
        const fields = ['name', 'url', 'platform', 'type', 'short_description', 'cost', 'pros', 'cons'];
        const content = fields.map(field => {
            if (app[field] && app[field] !== '0') {
                if (field === 'url') {
                    return `<p><strong>${field.replace(/_/g, ' ')}:</strong> <a href="${app[field]}" target="_blank" class="text-blue-500 hover:underline">${app[field]}</a></p>`;
                }
                return `<p><strong>${field.replace(/_/g, ' ')}:</strong> ${app[field]}</p>`;
            }
            return '';
        }).join('');
        slideContainer.innerHTML = `
            <h2 class="text-2xl font-bold mb-4">${app.name}</h2>
            <div class="slide-content space-y-4">
                ${content}
            </div>
            <div id="slideTags" class="mb-4 flex flex-wrap gap-2"></div>
            <div id="markdownContent" class="max-w-none space-y-4"></div>
        `;
        renderSlideTags(app.type);
        document.getElementById('mainView').classList.add('hidden');
        document.getElementById('slideView').classList.remove('hidden');
        loadMarkdownContent(app.name);
    }

    // Render slide tags
    function renderSlideTags(type) {
        const slideTags = document.getElementById('slideTags');
        const tags = type.split(/,\s*/).filter(t => t);
        const tagColors = generateColorPalette(tags);
        slideTags.innerHTML = tags.map(tag => `
            <button class="tag" style="background-color: ${tagColors[tag]}">
                ${tag}
            </button>
        `).join('');
        slideTags.addEventListener('click', handleTagClick);
    }

    // Load and render markdown content
    function loadMarkdownContent(appName) {
        const markdownPath = `data/apps/${appName.replace(/ /g, '_')}/description.md`;
        fetch(markdownPath)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Markdown file not found');
                }
                return response.text();
            })
            .then(markdown => {
                document.getElementById('markdownContent').innerHTML = DOMPurify.sanitize(marked.parse(markdown));
            })
            .catch(error => {
                console.log('No markdown file found for this app:', error);
            });
    }

    // Show main view
    function showMainView() {
        document.getElementById('mainView').classList.remove('hidden');
        document.getElementById('slideView').classList.add('hidden');
    }

    // Update the view heading
    function updateViewHeading(text) {
        document.getElementById('viewHeading').textContent = text;
    }

    // Generate a color from a string
    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = (hash & 0x00FFFFFF)
            .toString(16)
            .toUpperCase();
        return "00000".substring(0, 6 - color.length) + color;
    }

    // Generate a color palette
    function generateColorPalette(tags) {
        const tagColors = {};
        tags.forEach(tag => {
            tagColors[tag] = `#${stringToColor(tag)}`;
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

    // Show the full list
    function showFullList() {
        clearSearchInput();
        filteredApps = [...apps];
        renderTable(filteredApps);
        updateViewHeading('Displaying full list');
        toggleShowFullListButton('');
    }

    // Toggle the visibility of the "Display full list" button
    function toggleShowFullListButton(query) {
        const showFullListBtn = document.getElementById('showFullListBtn');
        if (query) {
            showFullListBtn.classList.remove('hidden');
        } else {
            showFullListBtn.classList.add('hidden');
        }
    }

    function clearSearchInput() {
        document.querySelector('input.search-box').value = '';
    }

    // Load data on page load
    loadData();
});
