console.log("Slideshow script loading...");

// --- Configuration ---
const SLIDESHOW_DATA_URL = 'slideshow_data.json';
const FADE_TRANSITION_DURATION = 400;
const SLIDESHOW_WINDOW_NAME = 'presentationSlideshowWindow';
// REMOVED noopener from features to allow window.opener access
const SLIDESHOW_WINDOW_FEATURES = 'width=1024,height=768,resizable=yes,scrollbars=no,status=no,toolbar=no,location=no,menubar=no';
const DEFAULT_AUTO_ADVANCE_DELAY = 5000; // Default delay for auto-advance in ms

// --- State Variables ---
let appMode = 'controller'; // 'controller' or 'slideshow'
let slidesData = [];
let currentSlideIndex = 0;
let isLoading = false; // Used in slideshow mode for transitions
let slideshowWindowRef = null; // Ref to the popup (used by controller)
let controllerWindowRef = null; // Ref to the opener (used by slideshow)
let isSlideshowReady = false; // Flag for controller to know popup is listening
let closeCheckInterval = null; // Interval timer for checking if slideshow window closed

// --- Presentation Settings ---
let presentationSettings = {
    displayMode: 'full', // 'full' or 'bullet'
    advanceMethod: 'manual', // 'manual' or 'auto'
    autoAdvanceDelay: DEFAULT_AUTO_ADVANCE_DELAY
};

// --- Bullet Points State (for bullet-by-bullet mode) ---
let currentBulletIndex = -1; // -1 means no bullets revealed yet
let slideBullets = []; // Array to hold bullet point elements
let autoAdvanceTimer = null; // Timer for auto-advance

// --- DOM Elements ---
const bodyElement = document.body;
const landingPage = document.getElementById('landing-page');
const startButton = document.getElementById('start-button');
const loadingErrorElement = document.getElementById('loading-error'); // On landing page
const slideErrorElement = document.getElementById('slide-error'); // In slideshow container

// Settings Modal Elements
const settingsModal = document.getElementById('settings-modal');
const displayModeRadios = document.getElementsByName('display-mode');
const advanceMethodRadios = document.getElementsByName('advance-method');
const autoDelayContainer = document.getElementById('auto-delay-container');
const autoDelayInput = document.getElementById('auto-delay');
const cancelSettingsButton = document.getElementById('cancel-settings');
const applySettingsButton = document.getElementById('apply-settings');

// Slideshow Mode Elements
const slideshowContainer = document.getElementById('slideshow-container');
const slideContentElement = document.getElementById('slide-content');

// Controller/Notes Mode Elements
const notesDisplayArea = document.getElementById('notes-display-area');
const notesHeader = document.getElementById('notes-header');
const notesContentArea = document.getElementById('notes-content-area');
const notesSlideNumber = document.getElementById('notes-slide-number');
const notesPrevButton = document.getElementById('notes-prev-slide');
const notesNextButton = document.getElementById('notes-next-slide');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded.");

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'slideshow') {
        appMode = 'slideshow';
        document.title = "Presentation Slideshow";
        bodyElement.classList.add('mode-slideshow');
        initializeSlideshowMode();
    } else {
        appMode = 'controller';
        document.title = "Presentation Controller";
        bodyElement.classList.add('mode-controller');
        initializeControllerMode();
    }

    if (typeof marked === 'undefined') {
        console.error('Marked library not loaded!');
        showError('Markdown library failed to load.', appMode === 'controller' ? loadingErrorElement : slideErrorElement);
        if (startButton) startButton.disabled = true;
    } else {
        marked.setOptions({ breaks: true, gfm: true });
        console.log('Marked library loaded.');
    }
});

// --- Mode Initializers ---

function initializeControllerMode() {
    console.log("Initializing in Controller/Notes mode.");
    if (!startButton) { console.error("Start button not found!"); return; }
    startButton.addEventListener('click', showSettingsModal);

    if (!notesPrevButton || !notesNextButton) { console.error("Notes nav buttons not found"); return;}
    notesPrevButton.addEventListener('click', prevSlide);
    notesNextButton.addEventListener('click', nextSlide);

    // Settings modal event listeners
    if (settingsModal) {
        // Show/hide auto delay input based on advance method selection
        for (const radio of advanceMethodRadios) {
            radio.addEventListener('change', function() {
                if (this.value === 'auto' && this.checked) {
                    autoDelayContainer.classList.add('show');
                } else {
                    autoDelayContainer.classList.remove('show');
                }
            });
        }

        cancelSettingsButton.addEventListener('click', hideSettingsModal);
        applySettingsButton.addEventListener('click', applySettingsAndStart);
    }

    window.addEventListener('message', handleControllerMessages);
    document.addEventListener('keydown', handleControllerKeyDown);

    if(notesDisplayArea) notesDisplayArea.style.display = 'none';
    if(landingPage) landingPage.style.display = 'block'; // Ensure landing is visible
}

function initializeSlideshowMode() {
    console.log("Slideshow mode: Initializing...");
    controllerWindowRef = window.opener;
    console.log("Slideshow mode: window.opener is:", controllerWindowRef); // Debug log

    // Critical check: Needs window.opener (hence removing noopener)
    if (!controllerWindowRef) {
        console.error("Slideshow mode: CRITICAL - window.opener is null or undefined! Was 'noopener' used?");
        showError("This window must be opened by the controller.", slideErrorElement);
        if(slideContentElement) slideContentElement.innerHTML = "<h1>Error: Cannot find controller window.</h1><p>Please ensure popups are allowed and the presentation is started correctly.</p>";
        return; // Stop execution
    }

    console.log("Slideshow mode: Adding message listener.");
    window.addEventListener('message', handleSlideshowMessages);

    // *** ADD A SMALL DELAY BEFORE SENDING 'READY' ***
    console.log("Slideshow mode: Scheduling 'slideshow_ready' message send (200ms delay)."); // Updated log
    setTimeout(() => {
        // This code runs after 100ms
        console.log("Slideshow mode: Attempting to send 'slideshow_ready' message NOW."); // Updated log
        sendMessageToController({ type: 'slideshow_ready' });
    }, 200); // Wait 200 milliseconds


    if(slideContentElement) slideContentElement.innerHTML = "<h1>Waiting for controller...</h1>";
}


// --- Message Handling ---

function handleControllerMessages(event) {
    // Add more detailed logging here for debugging
    console.log(`Controller received message event. Origin: ${event.origin}, Source window exists?: ${!!event.source}`);

    // SECURITY: Check source only if we have a reference to the slideshow window
    if (slideshowWindowRef && event.source !== slideshowWindowRef) {
        return;
    }

    // SECURITY: Check origin - crucial for security, especially if targetOrigin was '*'
    const expectedOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
    if (expectedOrigin !== '*' && event.origin !== expectedOrigin) {
        console.warn(`Controller received message from unexpected origin: ${event.origin}. Expected: ${expectedOrigin}. Ignoring.`);
        return; // Ignore messages from wrong origins
    }

    // Now process the message data
    console.log("Controller processing message data:", event.data);
    const message = event.data;

    if (message && message.type === 'slideshow_ready') {
        // Check if we were actually waiting for this
        if (!slideshowWindowRef || slideshowWindowRef.closed) {
            console.warn("Controller received 'slideshow_ready', but window ref is missing or closed.");
            return; // Don't process if the window context is gone
        }
        console.log("Controller: Processing 'slideshow_ready' message.");
        isSlideshowReady = true;
        if (startButton && startButton.textContent.includes('Waiting')) {
            startButton.style.display = 'none'; // Hide the button now
        }
        currentSlideIndex = 0;
        updateControllerView(); // Update notes and send command for slide 0
    } else if (message && message.type === 'bullet_advanced') {
        // Update current bullet index based on slideshow message
        if (typeof message.bulletIndex === 'number') {
            currentBulletIndex = message.bulletIndex;
            updateBulletVisibilityInNotes();
        }
    } else {
        console.log("Controller: Received message of different type or invalid data.");
    }
}


function handleSlideshowMessages(event) {
    console.log(`Slideshow received message event. Origin: ${event.origin}, Source is opener?: ${event.source === controllerWindowRef}`);
    // SECURITY: Check source is opener
    if (event.source !== controllerWindowRef) {
        return;
    }
    // SECURITY: Check origin
    const expectedOrigin = window.location.origin === 'null' ? '*' : window.location.origin; // Or controllerWindowRef.location.origin if same-origin
    if (expectedOrigin !== '*' && event.origin !== expectedOrigin) {
        console.warn(`Slideshow received message from unexpected origin: ${event.origin}. Expected: ${expectedOrigin}. Ignoring.`);
        return;
    }

    console.log("Slideshow processing message data:", event.data); // Change log level
    const message = event.data;

    if (message && message.type === 'goto_slide') {
        if (typeof message.index === 'number' && message.slideData) {
            console.log(`Slideshow: Processing 'goto_slide' command for slide ${message.index}`); // Change log level

            // Clear any existing auto-advance timer when changing slides
            if (autoAdvanceTimer) {
                clearTimeout(autoAdvanceTimer);
                autoAdvanceTimer = null;
            }

            // Reset bullet point state for the new slide
            currentBulletIndex = -1;
            slideBullets = [];

            displaySlideVisuals(message.index, message.slideData);
        } else {
            console.error("Slideshow: Invalid 'goto_slide' message payload:", message);
        }
    } else if (message && message.type === 'settings_update') {
        // Update presentation settings
        if (message.settings) {
            presentationSettings = message.settings;
            console.log("Slideshow: Presentation settings updated:", presentationSettings);
        } else {
            console.error("Slideshow: Invalid 'settings_update' message payload:", message);
        }
    } else if (message && message.type === 'next_bullet') {
        // Advance to next bullet point
        if (presentationSettings.displayMode === 'bullet' && slideBullets.length > 0) {
            advanceToNextBullet();
        }
    } else if (message && message.type === 'reset_auto_timer') {
        // Reset the auto-advance timer if in auto mode
        if (presentationSettings.advanceMethod === 'auto') {
            if (autoAdvanceTimer) {
                clearTimeout(autoAdvanceTimer);
                autoAdvanceTimer = null;
            }
            scheduleNextBulletOrSlide();
        }
    } else {
        console.log("Slideshow: Received message of different type or invalid data.");
    }
}

// --- Message Sending ---

function sendMessageToSlideshow(message) {
    if (slideshowWindowRef && !slideshowWindowRef.closed) {
        const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
        console.log(`Controller sending message to slideshow (targetOrigin: ${targetOrigin}):`, message);
        try {
            slideshowWindowRef.postMessage(message, targetOrigin);
        } catch (error) {
            console.error("Controller: Error sending message to slideshow:", error);
            if(slideshowWindowRef.closed) { handleSlideshowClose(); }
        }
    } else {
        console.warn("Controller: Cannot send message, slideshow window not available.");
    }
}

function sendMessageToController(message) {
    if (controllerWindowRef) {
        let targetOrigin = '*'; // Default to wildcard cautiously - see below
        try {
            targetOrigin = controllerWindowRef.location.origin;
            if (targetOrigin === 'null') {
                targetOrigin = '*'; // Must use wildcard for 'null' origins
            }
        } catch (e) {
            console.warn("Slideshow: Could not access controllerWindowRef.location.origin, using own origin/wildcard for postMessage target.");
            targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
        }

        console.log(`Slideshow sending message to controller. Target Origin: ${targetOrigin}. Message:`, message);
        try {
            controllerWindowRef.postMessage(message, targetOrigin);
            console.log("Slideshow: postMessage call seemingly successful (message sent).");
        } catch (error) {
            console.error("Slideshow: Error during postMessage call:", error);
        }
    } else {
        console.warn("Slideshow: Cannot send message, controller window reference missing.");
    }
}

// --- Controller Mode Logic ---

async function handleStartSlideshow() {
    console.log("Controller: Start slideshow initiated.");
    if (slideshowWindowRef && !slideshowWindowRef.closed) {
        console.log("Controller: Slideshow window already open, focusing.");
        slideshowWindowRef.focus();
        return; // Already running
    }

    // Clear previous errors and state
    loadingErrorElement.style.display = 'none';
    startButton.disabled = true;
    startButton.textContent = 'Opening...';
    isSlideshowReady = false;
    if (closeCheckInterval) clearInterval(closeCheckInterval);
    closeCheckInterval = null;

    try {
        console.log("Controller: Opening slideshow window...");
        slideshowWindowRef = window.open('index.html?mode=slideshow', SLIDESHOW_WINDOW_NAME, SLIDESHOW_WINDOW_FEATURES);

        if (slideshowWindowRef) {
            console.log("Controller: Slideshow window reference obtained.");
            startButton.textContent = 'Loading Data...';

            // Start checking if the window gets closed
            closeCheckInterval = setInterval(() => {
                if (!slideshowWindowRef || slideshowWindowRef.closed) {
                    clearInterval(closeCheckInterval);
                    closeCheckInterval = null;
                    if (isSlideshowReady || slideshowWindowRef) {
                        handleSlideshowClose();
                    }
                }
            }, 1000);

            const response = await fetch(SLIDESHOW_DATA_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${SLIDESHOW_DATA_URL}`);
            const jsonData = await response.json();
            if (!Array.isArray(jsonData) || jsonData.length === 0) throw new Error("Slideshow data empty/invalid.");

            slidesData = jsonData.sort((a, b) => a.slideNumber - b.slideNumber);
            console.log("Controller: Slideshow plan loaded:", slidesData.length, "slides");

            if (landingPage) landingPage.style.display = 'none';
            if (notesDisplayArea) notesDisplayArea.style.display = 'flex';

            startButton.textContent = 'Waiting for Slideshow...'; // Update status text
            console.log("Controller: Waiting for 'slideshow_ready' message...");

        } else {
            throw new Error("Popup blocked by browser or failed to open.");
        }
    } catch (error) {
        console.error("Controller: Failed to start slideshow:", error);
        showError(`Error starting: ${error.message}. Check pop-up blockers.`, loadingErrorElement);
        startButton.disabled = false;
        startButton.textContent = 'Start Slideshow';
        if (landingPage) landingPage.style.display = 'block';
        if (notesDisplayArea) notesDisplayArea.style.display = 'none';
        slideshowWindowRef = null;
        isSlideshowReady = false;
        if (closeCheckInterval) clearInterval(closeCheckInterval);
        closeCheckInterval = null;
    }
}

function updateControllerView() {
    if (appMode !== 'controller' || !slidesData.length) return;

    if (!isSlideshowReady) {
        console.warn("Controller: Update requested, but slideshow not ready.");
        if(notesContentArea) notesContentArea.textContent = "Waiting for slideshow window...";
        if (notesPrevButton) notesPrevButton.disabled = true;
        if (notesNextButton) notesNextButton.disabled = true;
        return;
    }

    if (!slideshowWindowRef || slideshowWindowRef.closed) {
        handleSlideshowClose();
        return;
    }

    console.log(`Controller: Updating view for slide index ${currentSlideIndex}`);
    const slide = slidesData[currentSlideIndex];
    if (!slide) {
        console.error(`Controller: Invalid slide index ${currentSlideIndex}`);
        return;
    }

    if (notesContentArea) {
        notesContentArea.innerHTML = '';
        
        const slidePreviewDiv = document.createElement('div');
        slidePreviewDiv.className = 'slide-preview';
        
        if (slide.title) {
            const titleElement = document.createElement('h2');
            titleElement.textContent = slide.title;
            slidePreviewDiv.appendChild(titleElement);
        }
        
        if (slide.contentFile) {
            fetch(slide.contentFile)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.text();
                })
                .then(markdownText => {
                    const contentHtml = marked.parse(markdownText);
                    const contentDiv = document.createElement('div');
                    contentDiv.innerHTML = contentHtml;
                    
                    // Store all bullets in a data attribute for future reference
                    const bullets = contentDiv.querySelectorAll('li');
                    slideBullets = Array.from(bullets);
                    
                    // Apply styling based on current bullet index
                    if (presentationSettings.displayMode === 'bullet') {
                        bullets.forEach((bullet, index) => {
                            if (index > currentBulletIndex) {
                                bullet.classList.add('not-yet-visible');
                            }
                        });
                    }
                    
                    slidePreviewDiv.appendChild(contentDiv);
                    
                    // This ensures bullet visibility is updated immediately
                    updateBulletVisibilityInNotes();
                })
                .catch(error => {
                    console.error("Failed to load slide content for notes:", error);
                    slidePreviewDiv.innerHTML += '<p>Error loading slide content</p>';
                });
        }
        
        notesContentArea.appendChild(slidePreviewDiv);
        
        const notesDiv = document.createElement('div');
        notesDiv.className = 'speaker-notes';
        notesDiv.textContent = slide.notes || "No notes for this slide.";
        notesContentArea.appendChild(notesDiv);
        
        notesContentArea.scrollTop = 0;
    }
    
    if (notesSlideNumber) {
        notesSlideNumber.textContent = `Slide: ${currentSlideIndex + 1} / ${slidesData.length}`;
    }

    if (notesPrevButton) notesPrevButton.disabled = currentSlideIndex === 0;
    if (notesNextButton) notesNextButton.disabled = currentSlideIndex >= slidesData.length - 1;

    // Reset bullet index when changing slides
    currentBulletIndex = -1;

    sendMessageToSlideshow({
        type: 'settings_update',
        settings: presentationSettings
    });

    sendMessageToSlideshow({
        type: 'goto_slide',
        index: currentSlideIndex,
        slideData: {
            title: slide.title,
            imageUrl: slide.imageUrl,
            contentFile: slide.contentFile
        }
    });
}

function prevSlide() {
    if (appMode !== 'controller' || !isSlideshowReady) return;
    if (currentSlideIndex > 0) {
        currentSlideIndex--;
        updateControllerView();
    }
}

function nextSlide() {
    if (appMode !== 'controller' || !isSlideshowReady) return;
    
    // If in bullet mode and there are more bullets to show, advance bullet instead
    if (presentationSettings.displayMode === 'bullet') {
        // Check if we can advance a bullet on the current slide
        const slidePreview = notesContentArea.querySelector('.slide-preview');
        if (slidePreview) {
            const bullets = slidePreview.querySelectorAll('li');
            if (currentBulletIndex < bullets.length - 1) {
                advanceBulletOrSlide();
                return;
            }
        }
    }
    
    // Otherwise proceed to next slide
    if (currentSlideIndex < slidesData.length - 1) {
        currentSlideIndex++;
        updateControllerView();
    }
}

function handleControllerKeyDown(event) {
    if (appMode !== 'controller' || !isSlideshowReady || !slideshowWindowRef || slideshowWindowRef.closed) return;

    switch (event.code) {
        case 'Space': case 'ArrowRight': case 'PageDown':
            event.preventDefault();
            console.log("Controller: Next action keypress:", event.code);
            advanceBulletOrSlide();
            break;
        case 'ArrowLeft': case 'PageUp':
            event.preventDefault();
            console.log("Controller: Previous slide keypress:", event.code);
            prevSlide();
            break;
    }
}

// --- Settings Modal Functions ---

function showSettingsModal() {
    if (settingsModal) {
        settingsModal.classList.add('show');
    }
}

function hideSettingsModal() {
    if (settingsModal) {
        settingsModal.classList.remove('show');
    }
}

function applySettingsAndStart() {
    for (const radio of displayModeRadios) {
        if (radio.checked) {
            presentationSettings.displayMode = radio.value;
            break;
        }
    }

    for (const radio of advanceMethodRadios) {
        if (radio.checked) {
            presentationSettings.advanceMethod = radio.value;
            break;
        }
    }

    if (presentationSettings.advanceMethod === 'auto' && autoDelayInput) {
        const delay = parseInt(autoDelayInput.value, 10);
        if (!isNaN(delay) && delay >= 1000) {
            presentationSettings.autoAdvanceDelay = delay;
        } else {
            presentationSettings.autoAdvanceDelay = DEFAULT_AUTO_ADVANCE_DELAY;
        }
    }

    console.log("Controller: Applied presentation settings:", presentationSettings);
    hideSettingsModal();
    handleStartSlideshow();
}

// --- Bullet Point Navigation ---

function advanceBulletOrSlide() {
    if (appMode !== 'controller' || !isSlideshowReady) return;
    
    if (presentationSettings.displayMode !== 'bullet') {
        nextSlide();
        return;
    }
    
    // Get current slide's bullets
    const slidePreview = notesContentArea.querySelector('.slide-preview');
    if (slidePreview) {
        const bullets = slidePreview.querySelectorAll('li');
        
        if (bullets.length > 0 && currentBulletIndex < bullets.length - 1) {
            // Still have bullets to advance
            currentBulletIndex++;
            
            sendMessageToSlideshow({
                type: 'next_bullet'
            });
            
            if (presentationSettings.advanceMethod === 'auto') {
                sendMessageToSlideshow({
                    type: 'reset_auto_timer'
                });
            }
            
            updateBulletVisibilityInNotes();
            return;
        }
    }
    
    // No more bullets, go to next slide
    if (currentSlideIndex < slidesData.length - 1) {
        currentSlideIndex++;
        updateControllerView();
    }
}

function updateBulletVisibilityInNotes() {
    if (appMode !== 'controller' || !notesContentArea) return;
    
    const slidePreview = notesContentArea.querySelector('.slide-preview');
    if (!slidePreview) return;
    
    const bullets = slidePreview.querySelectorAll('li');
    console.log(`Updating bullet visibility: current index=${currentBulletIndex}, total=${bullets.length}`);
    
    bullets.forEach((bullet, index) => {
        if (index <= currentBulletIndex) {
            bullet.classList.remove('not-yet-visible');
        } else {
            bullet.classList.add('not-yet-visible');
        }
    });
}

function scheduleNextBulletOrSlide() {
    if (appMode !== 'slideshow' || presentationSettings.advanceMethod !== 'auto') return;

    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
    }

    autoAdvanceTimer = setTimeout(() => {
        if (presentationSettings.displayMode === 'bullet') {
            advanceToNextBullet();
        }
    }, presentationSettings.autoAdvanceDelay);
}

function handleSlideshowClose() {
    if (appMode !== 'controller') return;
    if (!slideshowWindowRef && !isSlideshowReady) {
        return;
    }

    console.warn("Controller: Slideshow window closed or connection lost.");

    if (closeCheckInterval) {
        clearInterval(closeCheckInterval);
        closeCheckInterval = null;
    }

    slideshowWindowRef = null;
    isSlideshowReady = false;

    showError("Slideshow window closed. Restart to continue.", loadingErrorElement);

    if (notesContentArea) notesContentArea.textContent = "Slideshow window closed.";
    if (notesPrevButton) notesPrevButton.disabled = true;
    if (notesNextButton) notesNextButton.disabled = true;
    if (notesDisplayArea) notesDisplayArea.style.display = 'none';
    if (landingPage) landingPage.style.display = 'block';
    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = 'Start Slideshow';
        startButton.style.display = 'inline-block';
    }
}


// --- Slideshow Mode Logic ---

async function displaySlideVisuals(index, slideData) {
    if (appMode !== 'slideshow' || !slideData) return;

    console.log(`Slideshow: Rendering visuals for index ${index}`);
    isLoading = true;
    slideErrorElement.style.display = 'none';

    try {
        slideContentElement.classList.add('fade-out');
        slideshowContainer.style.backgroundImage = slideData.imageUrl ? `url('${slideData.imageUrl}')` : 'none';

        await new Promise(resolve => setTimeout(resolve, FADE_TRANSITION_DURATION * 0.9));

        let contentHtml = '';
        try {
            if (slideData.title) contentHtml += `<h1>${slideData.title}</h1>`;
            if (slideData.contentFile) {
                console.log(`Slideshow: Fetching markdown ${slideData.contentFile}`);
                const mdResponse = await fetch(slideData.contentFile);
                if (!mdResponse.ok) throw new Error(`HTTP ${mdResponse.status} fetching ${slideData.contentFile}`);
                contentHtml += marked.parse(await mdResponse.text());
            } else if (!slideData.title) {
                contentHtml += '<p>Slide content missing.</p>';
            }
        } catch (contentError) {
            console.error(`Slideshow: Error loading content for index ${index}:`, contentError);
            contentHtml = `<h1>Error</h1><p>Failed to load slide content (${slideData.contentFile || 'N/A'}).</p><p><small>${contentError.message}</small></p>`;
            showError(`Failed to load slide ${index + 1} content.`, slideErrorElement);
        }

        slideContentElement.innerHTML = contentHtml;

        if (presentationSettings.displayMode === 'bullet') {
            slideBullets = Array.from(slideContentElement.querySelectorAll('li'));
            currentBulletIndex = -1;

            slideBullets.forEach(bullet => {
                bullet.classList.remove('visible');
            });

            if (presentationSettings.displayMode === 'bullet') {
                setTimeout(() => {
                    advanceToNextBullet();

                    if (presentationSettings.advanceMethod === 'auto') {
                        scheduleNextBulletOrSlide();
                    }
                }, 100);
            }
        } else {
            const bullets = slideContentElement.querySelectorAll('li');
            bullets.forEach(bullet => {
                bullet.classList.add('visible');
            });
        }

        slideContentElement.classList.remove('fade-out');
        console.log(`Slideshow: Visuals for index ${index} updated.`);

        if (presentationSettings.displayMode === 'bullet') {
            slideContentElement.onclick = function(event) {
                event.preventDefault();
                advanceToNextBullet();
            };
        } else {
            slideContentElement.onclick = null;
        }

    } catch (error) {
        console.error(`Slideshow: Error displaying slide visuals ${index}:`, error);
        showError(`Error displaying slide ${index + 1}.`, slideErrorElement);
        slideContentElement.innerHTML = "<h1>Error</h1><p>Unexpected error rendering slide.</p>";
        slideContentElement.classList.remove('fade-out');
    } finally {
        isLoading = false;
    }
}

// --- Bullet Point Control Functions ---

function advanceToNextBullet() {
    if (appMode !== 'slideshow' || presentationSettings.displayMode !== 'bullet') return;

    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
    }

    if (slideBullets.length > 0) {
        if (currentBulletIndex < slideBullets.length - 1) {
            currentBulletIndex++;
            
            // Make all bullets up to current index visible
            slideBullets.forEach((bullet, index) => {
                if (index <= currentBulletIndex) {
                    bullet.classList.add('visible');
                } else {
                    bullet.classList.remove('visible');
                }
            });

            if (controllerWindowRef && !controllerWindowRef.closed) {
                sendMessageToController({
                    type: 'bullet_advanced',
                    bulletIndex: currentBulletIndex
                });
            }

            if (presentationSettings.advanceMethod === 'auto') {
                scheduleNextBulletOrSlide();
            }

            return true;
        }
    }

    return false;
}

// --- Utility Functions ---
function showError(message, element) {
    if (element) {
        element.textContent = message;
        element.style.display = (element.id === 'loading-error') ? 'block' : 'inline-block';
        if (element.id === 'loading-error' && landingPage.style.display !== 'none') {
            element.style.textAlign = 'center';
        }
    }
    console.error("Error shown to user:", message);
}

console.log("Slideshow script loaded successfully.");

