# eSIMConnect Admin Panel Documentation

## Overview
This document provides a comprehensive overview of the admin panel functionality for team handover. It covers all modules, their completion status, API endpoints, known issues, and recommended next steps.

---

## Module Status Summary

| Module | Status | Priority |
|--------|--------|----------|
| Dashboard | Complete | - |
| Translations | Complete | - |
| Languages | Complete | - |
| Packages | Complete | - |
| Top-up Packages | Complete | - |
| Orders | Complete | - |
| Custom eSIM Orders | Complete | - |
| Customers | Complete | - |
| Providers | Complete | - |
| Countries/Regions | Complete | - |
| Email Templates | Complete | - |
| Currencies | Complete | - |
| Settings | Complete | - |
| API Documentation | Complete | - |
| Notifications | Complete | - |
| Referrals | Complete | - |
| Reviews | Complete | - |
| Gift Cards | Complete | - |
| Vouchers | Complete | - |
| Email Marketing | Complete | - |
| Analytics | Complete | - |
| KYC Management | Complete | - |
| Ticket Management | Complete | - |
| Blog | Needs Fix | Low |
| Enterprise | Needs Fix | Low |

---

## Detailed Module Documentation

### 1. Dashboard (`/admin/dashboard`)
**File:** `client/src/pages/admin/AdminDashboard.tsx`

**Features:**
- Real-time statistics display
- Time-based filtering (7 days, 30 days, lifetime)
- Revenue metrics, order counts, user statistics
- Chart visualizations

**API Endpoints:**
- `GET /api/admin/stats` - Dashboard statistics

---

### 2. Translations (`/admin/translations`)
**File:** `client/src/pages/admin/AdminTranslations.tsx`

**Features:**
- 12 language support with RTL for Arabic
- CRUD operations for translation keys
- Import/Export CSV and JSON formats
- Namespace filtering (common, homepage, admin, etc.)
- Completion percentage tracking per language
- Bulk add/delete keys

**API Endpoints:**
- `GET /api/admin/translations/:languageId` - Get translations for language
- `POST /api/admin/translations` - Create translation
- `PUT /api/admin/translations/:id` - Update translation
- `DELETE /api/admin/translations/:id` - Delete translation
- `POST /api/admin/translation-keys` - Add translation key
- `DELETE /api/admin/translation-keys/:key` - Delete key

---

### 3. Languages (`/admin/languages`)
**File:** `client/src/pages/admin/AdminLanguages.tsx`

**Features:**
- Enable/disable languages
- RTL support configuration
- Sort order management
- Flag code association

**API Endpoints:**
- `GET /api/admin/languages` - List all languages
- `POST /api/admin/languages` - Create language
- `PUT /api/admin/languages/:id` - Update language
- `DELETE /api/admin/languages/:id` - Delete language

---

### 4. Package Management (`/admin/packages`)
**File:** `client/src/pages/admin/Packages.tsx`

**Features:**
- View unified packages from all providers
- Enable/disable packages
- Set popular/trending/recommended flags
- Filter by provider, type, destination
- Sync packages from providers

**API Endpoints:**
- `GET /api/admin/packages` - List packages with pagination
- `PUT /api/admin/packages/:id/flags` - Update package flags
- `PUT /api/admin/packages/:id` - Update package
- `DELETE /api/admin/packages/:id` - Delete package
- `POST /api/admin/providers/:id/sync` - Sync from provider

---

### 5. Top-up Packages (`/admin/topups`)
**File:** `client/src/pages/admin/Topups.tsx`

**Features:**
- View top-up packages per provider
- Sync topup packages
- Territory support

**API Endpoints:**
- `GET /api/admin/topups` - List topup packages
- `POST /api/admin/providers/:id/sync-topups` - Sync topups

---

### 6. Order Management (`/admin/orders`)
**File:** `client/src/pages/admin/OrderManagement.tsx`

**Features:**
- View all orders with filters
- Update order status
- Process refunds/cancellations
- Send installation instructions
- View eSIM details (QR code, activation info)

**API Endpoints:**
- `GET /api/admin/orders` - List all orders
- `GET /api/admin/orders/:id` - Get order details
- `PUT /api/admin/orders/:id/status` - Update status
- `POST /api/admin/orders/:id/send-instructions` - Send email
- `POST /api/admin/orders/:orderId/refresh-status` - Refresh from provider
- `DELETE /api/admin/orders/:id` - Cancel order

---

### 7. Custom eSIM Orders (`/admin/custom-esim-orders`)
**File:** `client/src/pages/admin/CustomEsimOrders.tsx`

**Features:**
- View pre-purchased eSIMs
- Assign eSIMs to customers
- Search and filter

**API Endpoints:**
- `GET /api/admin/orders/custom` - List custom orders
- `POST /api/admin/orders/:id/assign` - Assign to customer

---

### 8. Customer Management (`/admin/customers`)
**File:** `client/src/pages/admin/CustomerManagement.tsx`

**Features:**
- View all customers
- Create new customers
- Update KYC status
- Delete customers
- View customer orders
- Export customer data

**API Endpoints:**
- `GET /api/admin/customers` - List customers
- `POST /api/admin/customers` - Create customer
- `PUT /api/admin/customers/:id/kyc` - Update KYC
- `DELETE /api/admin/customers/:id` - Delete customer

---

### 9. Provider Management (`/admin/providers`)
**File:** `client/src/pages/admin/Providers.tsx`

**Features:**
- View all eSIM providers (Airalo, eSIM Access, eSIM Go)
- Configure API credentials
- Set margin percentages
- Enable/disable providers
- Trigger package sync
- Price comparison

**API Endpoints:**
- `GET /api/admin/providers` - List providers
- `POST /api/admin/providers` - Create provider
- `PATCH /api/admin/providers/:id` - Update provider
- `DELETE /api/admin/providers/:id` - Delete provider
- `POST /api/admin/providers/:id/sync` - Sync packages
- `POST /api/admin/providers/price-comparison` - Compare prices

---

### 10. Countries/Regions Management
**Files:** 
- `client/src/pages/admin/MasterCountries.tsx`
- `client/src/pages/admin/MasterRegions.tsx`

**Features:**
- View destinations (countries/territories)
- Activate/deactivate destinations
- Upload custom images
- Sync from providers
- Filter by type

**API Endpoints:**
- `GET /api/admin/master-countries` - List countries
- `PATCH /api/admin/master-countries/:id` - Update country
- `GET /api/admin/master-regions` - List regions
- `PATCH /api/admin/master-regions/:id` - Update region
- `POST /api/admin/master-regions/sync` - Sync regions

---

### 11. Gift Cards (`/admin/gift-cards`)
**File:** `client/src/pages/admin/AdminGiftCards.tsx`

**Features:**
- Create single gift cards
- Bulk create gift cards
- View gift card statistics
- Send gift cards to recipients
- Track redemptions and transactions

**API Endpoints:**
- `GET /api/admin/gift-cards` - List with statistics
- `POST /api/admin/gift-cards` - Create gift card
- `POST /api/admin/gift-cards/bulk` - Bulk create
- `POST /api/admin/gift-cards/:id/send` - Send to recipient

---

### 12. Vouchers/Discount Codes (`/admin/vouchers`)
**Files:** 
- `client/src/pages/admin/AdminVouchers.tsx`
- `client/src/pages/admin/vouchers/` (modular version)

**Features:**
- Create percentage or fixed discount vouchers
- Set validity period
- Configure usage limits
- Target specific countries/regions/packages
- First-time customer restrictions
- Usage tracking and statistics

**API Endpoints:**
- `GET /api/admin/vouchers` - List with statistics
- `POST /api/admin/vouchers` - Create voucher
- `PATCH /api/admin/vouchers/:id` - Update voucher
- `DELETE /api/admin/vouchers/:id` - Delete voucher

---

### 13. Reviews (`/admin/reviews`)
**File:** `client/src/pages/admin/AdminReviews.tsx`

**Features:**
- View pending/approved reviews
- Approve or reject reviews
- Create admin reviews
- View review statistics
- Filter by rating and status

**API Endpoints:**
- `GET /api/admin/reviews` - List reviews
- `GET /api/admin/reviews/stats` - Review statistics
- `POST /api/admin/reviews` - Create review
- `POST /api/admin/reviews/:id/approve` - Approve
- `DELETE /api/admin/reviews/:id` - Delete

---

### 14. Email Marketing (`/admin/email-marketing`)
**File:** `client/src/pages/admin/AdminEmailMarketing.tsx`

**Features:**
- Create email campaigns
- Set up automation triggers
- View subscriber lists
- Send campaigns
- Toggle automations

**API Endpoints:**
- `GET /api/admin/email/campaigns` - List campaigns
- `POST /api/admin/email/campaigns` - Create campaign
- `PUT /api/admin/email/campaigns/:id` - Update
- `DELETE /api/admin/email/campaigns/:id` - Delete
- `GET /api/admin/email/automations` - List automations
- `POST /api/admin/email/automations` - Create
- `POST /api/admin/email/automations/:id/toggle` - Toggle
- `GET /api/admin/email/subscriptions` - List subscribers

---

### 15. Analytics (`/admin/analytics`)
**File:** `client/src/pages/admin/AdminAnalytics.tsx`

**Features:**
- Overview metrics (revenue, users, conversion)
- Sales funnel visualization
- Customer segments
- Abandoned cart tracking

**API Endpoints:**
- `GET /api/admin/analytics/overview` - Overview metrics
- `GET /api/admin/analytics/funnel` - Funnel data
- `GET /api/admin/analytics/segments` - Customer segments
- `GET /api/admin/analytics/abandoned-carts` - Abandoned carts

---

### 16. KYC Management (`/admin/kyc`)
**File:** `client/src/pages/admin/KYCManagement.tsx`

**Features:**
- View pending KYC documents
- Approve or reject with reason
- View document images

**API Endpoints:**
- `GET /api/admin/kyc/pending` - List pending requests
- `POST /api/admin/kyc/:id/approve` - Approve
- `POST /api/admin/kyc/:id/reject` - Reject with reason

---

### 17. Ticket Management (`/admin/tickets`)
**File:** `client/src/pages/admin/TicketManagement.tsx`

**Features:**
- View support tickets
- Update ticket status
- Respond to tickets

**API Endpoints:**
- `GET /api/admin/tickets` - List tickets
- `POST /api/admin/tickets` - Create ticket
- `PUT /api/admin/tickets/:id/status` - Update status
- `DELETE /api/admin/tickets/:id` - Delete

---

### 18. Settings (`/admin/settings`)
**File:** `client/src/pages/admin/Settings.tsx`

**Features:**
- General platform settings
- Currency management
- Payment gateway configuration
- SMTP email settings
- AI integration settings

**API Endpoints:**
- `GET /api/admin/settings` - Get settings
- `PUT /api/admin/settings/:key` - Update setting
- `GET /api/admin/currencies` - List currencies
- `POST /api/admin/currencies` - Add currency
- `PUT /api/admin/currencies/:id` - Update
- `DELETE /api/admin/currencies/:id` - Delete
- `GET /api/admin/payment-settings` - Payment config
- `PUT /api/admin/payment-settings` - Update payment

---

## Known Issues

### TypeScript Errors (Pre-existing)
The following files have TypeScript errors that existed before the current work:

1. **`server/routes.ts`** (44 errors)
   - Missing storage methods (`getSetting`, `updateUserById`, `createReferralTransaction`, `upsertSetting`)
   - Schema property mismatches (`packageTitle`, `isUnified`, `minimumOrderAmount`)
   - Session type issues (`enterpriseUserId`)
   - Enum value mismatches in enterprise routes

2. **`client/src/pages/admin/AdminBlog.tsx`** (1 error)
   - Delete mutation has incorrect apiRequest signature

3. **`client/src/pages/admin/AdminEnterprise.tsx`** (17 errors)
   - Missing type definitions for analytics response
   - Property access errors on untyped query results

### Duplicate Files
- **Voucher implementations**: Both `AdminVouchers.tsx` and `vouchers/` folder exist. Consider consolidating.

---

## Database Schema (Key Tables)

### Gift Cards
```sql
gift_cards (
  id, code, amount, currency, balance, purchased_by, recipient_email,
  recipient_name, message, theme, delivery_sent, status, expires_at,
  redeemed_by, redeemed_at, created_by_admin, created_at, updated_at
)
```

### Vouchers
```sql
voucher_codes (
  id, code, type, value, min_purchase_amount, max_discount_amount,
  max_uses, per_user_limit, current_uses, valid_from, valid_until,
  status, description, target_countries, target_regions, target_packages,
  first_time_only, is_stackable, created_by, created_at, updated_at
)
```

### Reviews
```sql
reviews (
  id, user_id, package_id, order_id, rating, title, comment, pros, cons,
  is_approved, is_verified_purchase, helpful_count, created_at, updated_at
)
```

---

## Authentication

### Admin Authentication
- Session-based authentication
- Separate from user authentication
- Routes protected by `requireAdmin` middleware
- Sessions stored in database

### Login Flow
1. POST `/api/admin/login` with email/password
2. Session created with `adminId`
3. Session cookie set for subsequent requests

---

## Recommended Next Steps

### High Priority
1. Fix the 44 TypeScript errors in `server/routes.ts` - mostly adding missing storage methods
2. Test all admin endpoints with actual API calls to verify functionality

### Medium Priority
1. Consolidate voucher implementations (choose one approach)
2. Fix AdminEnterprise.tsx type errors
3. Add comprehensive error handling to new endpoints

### Low Priority
1. Fix AdminBlog.tsx apiRequest signature
2. Add unit tests for admin endpoints
3. Add activity logging to gift card and voucher operations

---

## Environment Variables

Required secrets for admin functionality:
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Express session secret
- `SMTP_*` - Email configuration (for notifications)

---

## File Structure

```
client/src/pages/admin/
├── AdminDashboard.tsx
├── AdminTranslations.tsx
├── AdminLanguages.tsx
├── AdminReviews.tsx
├── AdminGiftCards.tsx
├── AdminVouchers.tsx
├── AdminEmailMarketing.tsx
├── AdminAnalytics.tsx
├── AdminEnterprise.tsx
├── AdminBlog.tsx
├── AdminReferrals.tsx
├── CustomerManagement.tsx
├── OrderManagement.tsx
├── CustomEsimOrders.tsx
├── Packages.tsx
├── Topups.tsx
├── Providers.tsx
├── MasterCountries.tsx
├── MasterRegions.tsx
├── KYCManagement.tsx
├── TicketManagement.tsx
├── Settings.tsx
├── Currencies.tsx
├── EmailTemplates.tsx
├── NotificationHistory.tsx
├── FailoverSettings.tsx
├── ApiDocs.tsx
├── PagesManagement.tsx
└── vouchers/
    ├── index.tsx
    ├── VoucherForm.tsx
    ├── VoucherList.tsx
    ├── api.ts
    ├── types.ts
    └── dialog.tsx
```

---

## Contact

For questions about this implementation, refer to:
- This documentation
- `replit.md` for project overview
- Individual component files for specific functionality

---

*Last Updated: January 2026*
