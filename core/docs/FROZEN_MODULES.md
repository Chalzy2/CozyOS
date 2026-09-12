Frozen Modules
CozyBaseLinker
Module: CozyBaseLinker
Version: v2.4.0
Status: FROZEN
Responsibility:
Lifecycle
Security context
Router integration
Notifications
Autosave
KPI registry
Event bus
Cleanup
Modification policy:
Critical bug fixes only. No API changes.
Dependencies:
window.CozyOS.Auth.getCurrentIdentity() — identity/session
window.CozyOS.Router.navigate() — navigation (optional, falls back to window.location.href)
window.CozyOS.SystemRoutes.{EXECUTE_LOCAL_QUEUE_SYNC, LOG_SYSTEM_EXCEPTION} — shared engine routes (optional, falls back to literal strings)
window.CozyOS.Notification.show() — toasts (optional, falls back to CustomEvent)
window.CozyOS.Widgets.KpiCard.update() — KPI rendering (optional, falls back to direct DOM update)
window.CozyOS.ActiveTenantId, window.CozyOS.Language.getCurrentLanguage() — tenant/language context (optional)
This base class has no dependency on any business module's constants (e.g. QuarryConstants). Module-specific route names belong in that module's own constants file and are passed through this.ACTIONS / module-level calls, not embedded in CozyBaseLinker.
