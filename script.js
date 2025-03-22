    let apps = [];
    let filteredApps = [];
    let currentSlide = 0;

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
                    // Remove surrounding quotes and trim whitespace
                    value = value.replace(/^"|"$/g, '').trim();
                    obj[header.toLowerCase().replace(/ /g, '_')] = value;
                });
                return obj;
            });

            filteredApps = [...apps];
            init();
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Failed to load data. Please try again later.');
        }
    }

    function init() {
        renderTable(filteredApps);
        renderTags();
        setupEventListeners();
    }

    // Rest of the functions remain the same as previous implementation
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

    function renderTags() {
        const tags = [...new Set(apps.flatMap(app => app.type.split(/,\s*/)))];
        const tagList = document.getElementById('tagList');
        tagList.innerHTML = tags.map(tag => `
            <div class="tag" onclick="filterByTag('${tag}')">${tag}</div>
        `).join('');
    }

    // Start loading data when page loads
    loadData();
