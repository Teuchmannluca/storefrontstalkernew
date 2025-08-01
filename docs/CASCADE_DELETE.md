# Cascade Delete Behavior

## Overview
When you delete a storefront, all associated products are automatically deleted from the database.

## How it works
1. The `products` table has a foreign key constraint with `ON DELETE CASCADE`
2. When a storefront is deleted, PostgreSQL automatically deletes all products that reference that storefront
3. This happens at the database level, ensuring data integrity

## User Experience
- When deleting a storefront with products, users see a confirmation message showing the number of products that will be deleted
- Example: "Are you sure you want to delete this storefront? This will also delete 25 products."
- If the storefront has no products, the standard confirmation is shown

## Database Schema
```sql
CREATE TABLE products (
  storefront_id UUID NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  -- other columns...
);
```

## Affected Pages
- Dashboard page (`/dashboard`)
- Storefronts page (`/dashboard/storefronts`)
- Storefront detail page (`/dashboard/storefronts/[id]`)

All delete operations properly cascade to remove associated products.