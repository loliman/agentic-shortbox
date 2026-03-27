# Module Boundaries & Responsibilities

This document defines the architectural layers and specifies what code belongs in each layer.

## Boundaries
- UI Layer: Only presentation logic
- Route Handlers: Request parsing, parameter mapping, and delegating to services (No business logic)
- Service Layer / Domain: Core logic, business rules
- Data Access Layer: Database access, queries, transactions (no business logic)

*(This file is a stub to be expanded with local specifics)*
