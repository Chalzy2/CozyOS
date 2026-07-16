// ... inside class CozyCoreUIDispatcher

    mountApplication(appName) {
        const root = document.getElementById("cozy-app-root");
        if (!root) return;

        // Clear existing content
        root.innerHTML = "";

        // Route logic: if app is 'developer', trigger the Hub renderer
        if (appName === "developer" && window.CozyOS.DeveloperHub) {
            // This assumes your Hub has a render method or you build the UI here
            const hubUI = document.createElement("div");
            hubUI.className = "cozy-developer-hub-container";
            hubUI.innerHTML = `<h1>Developer Hub Initialized</h1>`; 
            // In reality, call your rendering logic here
            root.appendChild(hubUI);
        }
    }

    init() {
        this.setApplicationTheme(this.activeApp);
        this.mountApplication(this.activeApp); // <--- Add this call
        
        if (window.CozyOS.Live) {
            window.CozyOS.Live.registerLivePillEvents();
        }
    }
// ...
