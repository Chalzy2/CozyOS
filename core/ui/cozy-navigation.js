(function () {
    const navMenu = document.getElementById("cozy-nav-menu");
    const navItems = ["Dashboard", "Builder", "Understanding Engine", "OCR", "BugFixer"]; // Add all items here

    navItems.forEach(item => {
        const btn = document.createElement("button");
        btn.innerText = item;
        btn.className = "cozy-nav-button";
        btn.onclick = () => {
            // Trigger the UI dispatcher to mount the selected app/view
            window.CozyOS.UI.mountApplication(item.toLowerCase().replace(" ", "-"));
        };
        navMenu.appendChild(btn);
    });
})();
