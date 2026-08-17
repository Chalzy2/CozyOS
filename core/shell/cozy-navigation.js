// core/ui/cozy-navigation.js
function createTile(mod, currentUserId) {
    const btn = document.createElement("button");
    btn.className = "cozy-app-tile";
    btn.dataset.module = mod.id;
    btn.setAttribute("aria-label", mod.name);

    // Image resilience
    const icon = document.createElement("img");
    icon.src = mod.icon;
    icon.alt = mod.name;
    icon.loading = "lazy";
    icon.className = "app-icon";

    // Text content via textContent for safety
    const info = document.createElement("div");
    info.className = "app-info";
    const title = document.createElement("h3");
    title.textContent = mod.name;
    const desc = document.createElement("p");
    desc.textContent = mod.description;

    info.append(title, desc);
    btn.append(icon, info);
    
    // Interaction
    const trigger = () => window.CozyOS.UI.loadModule(mod.id, currentUserId);
    btn.onclick = trigger;
    btn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') trigger(); };

    return btn;
}
