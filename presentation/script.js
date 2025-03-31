console.log("Slideshow script loading...");

// --- Configuration ---
const SLIDESHOW_PLAN_URL = 'slideshow_plan.json';
const FADE_TRANSITION_DURATION = 400;
const SLIDESHOW_WINDOW_NAME = 'presentationSlideshowWindow';
// REMOVED noopener from features to allow window.opener access
const SLIDESHOW_WINDOW_FEATURES = 'width=1024,height=768,resizable=yes,scrollbars=no,status=no,toolbar=no,location=no,menubar=no,noreferrer';

// --- State Variables ---
let appMode = 'controller'; // 'controller' or 'slideshow'
let slidesData = [];
let currentSlideIndex = 0;
let isLoading = false; // Used in slideshow mode for transitions
let slideshowWindowRef = null; // Ref to the popup (used by controller)
let controllerWindowRef = null; // Ref to the opener (used by slideshow)
let isSlideshowReady = false; // Flag for controller to know popup is listening
let closeCheckInterval = null; // Interval timer for checking if slideshow window closed

// --- DOM Elements ---
const bodyElement = document.body;
const landingPage = document.getElementById('landing-page');
const startButton = document.getElementById('start-button');
const loadingErrorElement = document.getElementById('loading-error'); // On landing page
const slideErrorElement = document.getElementById('slide-error'); // In slideshow container

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
    startButton.addEventListener('click', handleStartSlideshow);

    if (!notesPrevButton || !notesNextButton) { console.error("Notes nav buttons not found"); return;}
    notesPrevButton.addEventListener('click', prevSlide);
    notesNextButton.addEventListener('click', nextSlide);

    window.addEventListener('message', handleControllerMessages);
    document.addEventListener('keydown', handleControllerKeyDown);

    if(notesDisplayArea) notesDisplayArea.style.display = 'none';
    if(landingPage) landingPage.style.display = 'block'; // Ensure landing is visible
}

function initializeSlideshowMode() {
    console.log("Initializing in Slideshow mode.");
    controllerWindowRef = window.opener;

    // Critical check: Needs window.opener (hence removing noopener)
    if (!controllerWindowRef) {
        console.error("Slideshow mode: Could not get reference to opener window! Was 'noopener' used?");
        showError("This window must be opened by the controller.", slideErrorElement);
        if(slideContentElement) slideContentElement.innerHTML = "<h1>Error: Cannot find controller window.</h1><p>Please ensure popups are allowed and the presentation is started correctly.</p>";
        // No point continuing without opener
        return;
    }

    window.addEventListener('message', handleSlideshowMessages);

    console.log("Slideshow mode: Sending 'slideshow_ready' message to controller.");
    sendMessageToController({ type: 'slideshow_ready' });

    if(slideContentElement) slideContentElement.innerHTML = "<h1>Waiting for controller...</h1>";
}

// --- Message Handling ---

function handleControllerMessages(event) {
    // SECURITY: Check source only if we have a reference
    if (slideshowWindowRef && event.source !== slideshowWindowRef) {
        // console.warn("Controller received message from unexpected source (not the window we opened).");
        return;
    }
    // SECURITY: Check origin
    const expectedOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
    if (expectedOrigin !== '*' && event.origin !== expectedOrigin) {
        console.warn(`Controller received message from unexpected origin: ${event.origin}. Expected: ${expectedOrigin}`);
        return;
    }

    console.log("Controller received message:", event.data);
    const message = event.data;

    if (message && message.type === 'slideshow_ready') {
        // Check if we were actually waiting for this (i.e., slideshowWindowRef exists)
        if (!slideshowWindowRef || slideshowWindowRef.closed) {
            console.warn("Controller received 'slideshow_ready', but window ref is missing or closed.");
            return;
        }
        console.log("Controller: Slideshow window is ready.");
        isSlideshowReady = true;
        // Hide "Waiting" status on button if applicable
        if (startButton && startButton.textContent.includes('Waiting')) {
            startButton.style.display = 'none'; // Or just hide it completely now
        }
        currentSlideIndex = 0;
        updateControllerView(); // Update notes and send command for slide 0
    }
}

function handleSlideshowMessages(event) {
    // SECURITY: Check source is opener
    if (event.source !== controllerWindowRef) {
        // console.warn("Slideshow received message from unexpected source (not opener).");
        return;
    }
    // SECURITY: Check origin
    const expectedOrigin = window.location.origin === 'null' ? '*' : window.location.origin; // Or controllerWindowRef.location.origin if same-origin
    if (expectedOrigin !== '*' && event.origin !== expectedOrigin) {
        console.warn(`Slideshow received message from unexpected origin: ${event.origin}. Expected: ${expectedOrigin}`);
        return;
    }

    console.log("Slideshow received message:", event.data);
    const message = event.data;

    if (message && message.type === 'goto_slide') {
        if (typeof message.index === 'number' && message.slideData) {
            console.log(`Slideshow: Received command to go to slide ${message.index}`);
            displaySlideVisuals(message.index, message.slideData);
        } else {
            console.error("Slideshow: Invalid 'goto_slide' message payload:", message);
        }
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
        handleSlideshowClose();
    }
}

function sendMessageToController(message) {
    if (controllerWindowRef) {
        const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
        console.log(`Slideshow sending message to controller (targetOrigin: ${targetOrigin}):`, message);
        try {
            controllerWindowRef.postMessage(message, targetOrigin);
        } catch (error) {
            console.error("Slideshow: Error sending message to controller:", error);
        }
    } else {
        console.warn("Slideshow: Cannot send message, controller window reference missing.");
    }
}

// --- Controller Mode Logic ---

async function handleStartSlideshow() {
    console.log("Controller: Start button clicked.");
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
    if (closeCheckInterval) clearInterval(closeCheckInterval); // Clear previous interval if any

    try {
        console.log("Controller: Opening slideshow window...");
        slideshowWindowRef = window.open('index.html?mode=slideshow', SLIDESHOW_WINDOW_NAME, SLIDESHOW_WINDOW_FEATURES);

        if (slideshowWindowRef) {
            console.log("Controller: Slideshow window reference obtained.");
            startButton.textContent = 'Loading Data...';

            // Start checking if the window gets closed
            closeCheckInterval = setInterval(() => {
                // Need to check ref first as it might be nulled by handleSlideshowClose
                if (!slideshowWindowRef || slideshowWindowRef.closed) {
                    clearInterval(closeCheckInterval);
                    closeCheckInterval = null; // Clear interval ID
                    // Only call close handler if it wasn't already called (check isSlideshowReady maybe)
                    if (isSlideshowReady || slideshowWindowRef) { // If we were ready or had a ref
                        handleSlideshowClose();
                    }
                }
            }, 1000); // Check every second

            // Load presentation data
            const response = await fetch(SLIDESHOW_PLAN_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${SLIDESHOW_PLAN_URL}`);
            const jsonData = await response.json();
            if (!Array.isArray(jsonData) || jsonData.length === 0) throw new Error("Slideshow data empty/invalid.");

            slidesData = jsonData.sort((a, b) => a.slideNumber - b.slideNumber);
            console.log("Controller: Slideshow plan loaded:", slidesData);

            // Switch view
            if (landingPage) landingPage.style.display = 'none';
            if (notesDisplayArea) notesDisplayArea.style.display = 'flex';

            // Update status - waiting for ready signal
            startButton.textContent = 'Waiting for Slideshow...';
            console.log("Controller: Waiting for 'slideshow_ready' message...");

        } else {
            // window.open returned null or undefined
            throw new Error("Popup blocked by browser or failed to open.");
        }
    } catch (error) {
        console.error("Controller: Failed to start slideshow:", error);
        showError(`Error starting: ${error.message}. Check pop-up blockers.`, loadingErrorElement);
        // Reset UI fully on error
        startButton.disabled = false;
        startButton.textContent = 'Start Slideshow';
        if (landingPage) landingPage.style.display = 'block';
        if (notesDisplayArea) notesDisplayArea.style.display = 'none';
        slideshowWindowRef = null;
        isSlideshowReady = false;
        if (closeCheckInterval) clearInterval(closeCheckInterval); // Clear interval on error too
        closeCheckInterval = null;
    }
}

function updateControllerView() {
    if (appMode !== 'controller' || !slidesData.length) return;

    if (!isSlideshowReady) {
        console.warn("Controller: Update requested, but slideshow not ready.");
        if(notesContentArea) notesContentArea.textContent = "Waiting for slideshow window...";
        return;
    }

    // Double-check window status before proceeding
    if (!slideshowWindowRef || slideshowWindowRef.closed) {
        // handleSlideshowClose might have already run via interval, but call again just in case
        handleSlideshowClose();
        return;
    }

    console.log(`Controller: Updating view for slide index ${currentSlideIndex}`);
    const slide = slidesData[currentSlideIndex];
    if (!slide) {
        console.error(`Controller: Invalid slide index ${currentSlideIndex}`);
        return; // Should not happen if logic is correct
    }

    // Update Notes Display
    if (notesContentArea) {
        notesContentArea.textContent = slide.notes || "No notes for this slide.";
        notesContentArea.scrollTop = 0;
    }
    if (notesSlideNumber) {
        notesSlideNumber.textContent = `Slide: ${currentSlideIndex + 1} / ${slidesData.length}`;
    }

    // Update Controller Nav Button States
    if (notesPrevButton) notesPrevButton.disabled = currentSlideIndex === 0;
    if (notesNextButton) notesNextButton.disabled = currentSlideIndex >= slidesData.length - 1;

    // Send Command to Slideshow Window
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
    if (currentSlideIndex < slidesData.length - 1) {
        currentSlideIndex++;
        updateControllerView();
    }
}

function handleControllerKeyDown(event) {
    // Only active if controlling and slideshow is ready and window exists
    if (appMode !== 'controller' || !isSlideshowReady || !slideshowWindowRef || slideshowWindowRef.closed) return;

    switch (event.code) {
        case 'Space': case 'ArrowRight': case 'PageDown':
            event.preventDefault();
            console.log("Controller: Next slide keypress:", event.code);
            nextSlide();
            break;
        case 'ArrowLeft': case 'PageUp':
            event.preventDefault();
            console.log("Controller: Previous slide keypress:", event.code);
            prevSlide();
            break;
    }
}

function handleSlideshowClose() {
    if (appMode !== 'controller') return;
    // Prevent multiple cleanup calls
    if (!slideshowWindowRef && !isSlideshowReady && notesPrevButton?.disabled) {
        // console.log("handleSlideshowClose: Already handled or not active.");
        return;
    }

    console.warn("Controller: Slideshow window closed or connection lost.");

    // Clear interval if it's still running
    if (closeCheckInterval) {
        clearInterval(closeCheckInterval);
        closeCheckInterval = null;
    }

    showError("Slideshow window closed. Restart to continue.", loadingErrorElement);
    if (notesContentArea) notesContentArea.textContent = "Slideshow window closed.";
    if (notesPrevButton) notesPrevButton.disabled = true;
    if (notesNextButton) notesNextButton.disabled = true;

    slideshowWindowRef = null; // Clear the reference FIRST
    isSlideshowReady = false; // Reset ready state

    // Reset UI to initial state
    if (notesDisplayArea) notesDisplayArea.style.display = 'none';
    if (landingPage) landingPage.style.display = 'block'; // Show landing page again
    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = 'Start Slideshow';
        startButton.style.display = 'inline-block'; // Make sure it's visible
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
        slideContentElement.classList.remove('fade-out');
        console.log(`Slideshow: Visuals for index ${index} updated.`);

    } catch (error) {
        console.error(`Slideshow: Error displaying slide visuals ${index}:`, error);
        showError(`Error displaying slide ${index + 1}.`, slideErrorElement);
        slideContentElement.innerHTML = "<h1>Error</h1><p>Unexpected error rendering slide.</p>";
        slideContentElement.classList.remove('fade-out');
    } finally {
        isLoading = false;
    }
}


// --- Utility Functions ---
function showError(message, element) {
    if (element) {
        element.textContent = message;
        element.style.display = 'inline-block'; // Use inline-block or block as needed
    }
    console.error("Error shown to user:", message);
}

console.log("Slideshow script loaded successfully.");
