# RBAC Permission Matrix

## Complete Permission Matrix

This document provides a visual representation of all role permissions across all modules.

### Legend
- ✅ Full Access (C.R.U.D + Approve + Export)
- 📝 Read & Create & Update (No Delete)
- 👁️ Read Only
- 🚫 No Access
- ✓ Specific permission
- ✗ No permission

---

## Module Permissions by Role

### Dashboard Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 📝 | ✅ | ✅ | ✗ | ✅ | ✅ |
| DevOps Engineer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Business Analyst | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Finance Admin | 📝 | ✅ | ✅ | ✗ | ✅ | ✅ |
| Developer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Designer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Content Editor | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| QA Engineer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Support Team | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Client | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |

### Projects Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 📝 | ✅ | ✅ | ✗ | ✅ | ✅ |
| DevOps Engineer | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Business Analyst | 📝 | ✅ | ✅ | ✗ | ✅ | ✅ |
| Finance Admin | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Developer | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Designer | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Content Editor | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ |
| QA Engineer | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Support Team | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Client | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |

### Tasks Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 📝 | ✅ | ✅ | ✗ | ✅ | ✅ |
| DevOps Engineer | ✓ | ✅ | ✓ | ✗ | ✗ | ✗ |
| Business Analyst | ✓ | ✅ | ✓ | ✗ | ✗ | ✗ |
| Finance Admin | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Developer | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ |
| Designer | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ |
| Content Editor | ✓ | ✅ | ✓ | ✗ | ✗ | ✗ |
| QA Engineer | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ |
| Support Team | ✓ | ✅ | ✓ | ✗ | ✗ | ✗ |
| Client | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |

### Team Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| DevOps Engineer | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Business Analyst | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Finance Admin | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Developer | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Designer | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Content Editor | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| QA Engineer | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Support Team | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Client | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |

### Clients Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| DevOps Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Business Analyst | ✓ | ✅ | ✓ | ✗ | ✗ | ✗ |
| Finance Admin | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Developer | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Designer | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Content Editor | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| QA Engineer | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Support Team | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Client | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |

### Content Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| DevOps Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Business Analyst | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Finance Admin | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Developer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Designer | ✓ | ✅ | ✓ | ✗ | ✗ | ✗ |
| Content Editor | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ |
| QA Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Support Team | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Client | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |

### Finance Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| DevOps Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Business Analyst | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| Finance Admin | 📝 | ✅ | ✅ | ✗ | ✅ | ✅ |
| Developer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Designer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Content Editor | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| QA Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Support Team | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Client | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |

### Reports Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ |
| DevOps Engineer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Business Analyst | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ |
| Finance Admin | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ |
| Developer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Designer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Content Editor | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| QA Engineer | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Support Team | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Client | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |

### Settings Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| DevOps Engineer | ✓ | ✅ | ✓ | ✗ | ✗ | ✗ |
| Business Analyst | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Finance Admin | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Developer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Designer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Content Editor | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| QA Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Support Team | 👁️ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Client | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |

### Users Module

| Role | Create | Read | Update | Delete | Approve | Export |
|------|--------|------|--------|--------|---------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project Manager | 🚫 | ✅ | ✗ | ✗ | ✗ | ✗ |
| DevOps Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Business Analyst | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Finance Admin | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Developer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Designer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Content Editor | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| QA Engineer | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Support Team | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Client | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |

### Remaining Modules (Attendance, Leaves, Tickets, Reimbursements)

| Role | Attendance | Leaves | Tickets | Reimbursements |
|------|-----------|--------|---------|-----------------|
| Admin | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| Project Manager | 👁️ Read | 👁️ Read | ✓ R+C+U | ✓ R+C+U |
| DevOps Engineer | 🚫 None | ✓ R+C+U | ✓ R+C+U | ✓ R+C+U |
| Business Analyst | 👁️ Read | ✓ R+C+U | ✓ R+C+U | 👁️ Read |
| Finance Admin | 🚫 None | 🚫 None | 🚫 None | ✅ Full |
| Developer | 🚫 None | ✓ R+C+U | ✓ R+C+U | ✓ R+C+U |
| Designer | 🚫 None | ✓ R+C+U | ✓ R+C+U | ✓ R+C+U |
| Content Editor | 🚫 None | ✓ R+C+U | ✓ R+C+U | ✓ R+C+U |
| QA Engineer | 🚫 None | ✓ R+C+U | ✓ R+C+U | ✓ R+C+U |
| Support Team | 🚫 None | 🚫 None | ✅ Full | 🚫 None |
| Client | 🚫 None | 🚫 None | ✓ R+C+U | 🚫 None |

---

## Summary Statistics

### Total Permissions

- **Total Modules:** 14
- **Total Actions per Module:** 6 (create, read, update, delete, approve, export)
- **Total Roles:** 11
- **Maximum Possible Permissions:** 924

### By Role

| Role | Modules with Full Access | Modules with Partial Access | Modules with No Access | Total Permissions |
|------|--------------------------|------------------------------|------------------------|------------------|
| Admin | 14 | 0 | 0 | 84 |
| Project Manager | 3 | 8 | 3 | 38 |
| Developer | 1 | 7 | 6 | 22 |
| Designer | 1 | 7 | 6 | 22 |
| Content Editor | 1 | 6 | 7 | 20 |
| QA Engineer | 1 | 7 | 6 | 22 |
| DevOps Engineer | 0 | 8 | 6 | 16 |
| Business Analyst | 0 | 8 | 6 | 20 |
| Finance Admin | 0 | 6 | 8 | 18 |
| Support Team | 0 | 5 | 9 | 13 |
| Client | 0 | 4 | 10 | 10 |

### Access Patterns

- **Most Access:** Admin (100% permissions)
- **Medium Access:** Project Manager, Developer, Designer (20-30% permissions)
- **Limited Access:** Client, Support Team (10-15% permissions)

---

## Usage Reference

### Code Examples

#### Check if Developer can update tasks
```typescript
hasPermission('developer', 'tasks', 'update') // ✅ true
```

#### Check if Client can create tasks
```typescript
hasPermission('client', 'tasks', 'create') // ❌ false
```

#### Check if QA can approve tasks
```typescript
hasPermission('qa_tester', 'tasks', 'approve') // ✅ true
```

#### Check if Finance Admin can manage finance
```typescript
hasPermission('finance_admin', 'finance', 'update') // ✅ true
```

---

## Notes

- All permissions are inherited from database tables
- Matrix reflects default configuration; can be customized per tenant
- Client role intentionally has minimal permissions
- Admin role cannot be restricted
- Use `protectRoute()` to enforce server-side checks
