init() {
    this.setApplicationTheme(this.activeApp);
    
    // Mount the plugin content
    const root = document.getElementById("cozy-app-root");
    if (root && window.CozyOS.DeveloperHub) {
        // Build the dashboard HTML from your hub data
        const data = window.CozyOS.DeveloperHub.getHomeDashboardData();
        root.innerHTML = `
            <div class="developer-dashboard">
                <h2>Developer Hub</h2>
                <p>Status: ${data.workspaceStatus}</p>
                <!-- Add your other hub elements here -->
            </div>
        `;
    }
    
    if (window.CozyOS.Live) {
        window.CozyOS.Live.registerLivePillEvents();
    }
}
