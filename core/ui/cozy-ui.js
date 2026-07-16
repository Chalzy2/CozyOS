mountApplication(viewName) {
    const root = document.getElementById("cozy-app-root");
    if (!root) return;

    // Based on the button clicked, fetch the correct view from DeveloperHub
    // Example: if viewName is 'builder', we show the Builder interface
    if (viewName === 'builder') {
        root.innerHTML = `
            <div class="cozy-workspace-content">
                <h1>Builder — Refactor Existing Project</h1>
                <!-- Insert your Builder HTML here -->
            </div>
        `;
    } else {
        // Default to Dashboard
        root.innerHTML = `<h1>Dashboard</h1>`;
    }
}
