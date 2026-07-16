/**
 * CozyOS Enterprise Design System — Layout & Sidebar Navigation Controller
 * File Reference: core/ui/cozy-navigation.js
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class CozyNavigationController {
        constructor() {
            this.isCollapsed = false;
        }

        toggleSidebar() {
            const sidebar = document.getElementById("cozy-sidebar");
            if (sidebar) {
                this.isCollapsed = !this.isCollapsed;
                sidebar.style.width = this.isCollapsed ? "0px" : "var(--cozy-sidebar-width)";
                sidebar.style.padding = this.isCollapsed ? "0" : "16px 12px";
            }
        }
    }

    window.CozyOS.Navigation = new CozyNavigationController();
})();    this.indicator.style.transform = `translateX(${leftOffset}px)`;
  }
}

export default CozyNavigation;
