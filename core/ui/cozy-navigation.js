(function () {
    const navMenu = document.getElementById("cozy-nav-menu");
    const navItems = ["Dashboard", "Builder", "Understanding Engine", "OCR", "BugFixer"];

    navItems.forEach(item => {
        const btn = document.createElement("button");
        btn.innerText = item;
        btn.className = "cozy-nav-button";
        
        // Add a click listener directly to the button
        btn.addEventListener('click', function() {
            console.log("Button clicked: " + item); // Check console for this!
            window.CozyOS.UI.mountApplication(item.toLowerCase().replace(" ", "-"));
        });
        
        navMenu.appendChild(btn);
    });
})();
