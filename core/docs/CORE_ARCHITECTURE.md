What goes in CORE_ARCHITECTURE.md
✅ Frozen modules
CozyBaseLinker
QuarryLinker
Router
Auth
Storage
Notification
Language
AI
Widgets
✅ Folder structure
✅ Module loading order
✅ Event bus
✅ Router API
✅ AI API
✅ Language API
✅ Storage API
✅ Coding standards
✅ Business rules
✅ "Critical bug exception" policy
✅ Current version (v2.4.0)

BaseLinker CAN:
call SystemServices
call engine.handle()
manage UI lifecycle
route events
❌ BaseLinker MUST NEVER:
import QuarryConstants directly (you already fixed this ✔)
contain business logic
know about stone types / payroll / production
