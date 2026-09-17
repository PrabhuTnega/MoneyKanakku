import { z } from "zod";

export const transactionTypeSchema = z.enum(["EXPENSE", "INCOME"]);

export const listCategoriesQuerySchema = z.object({
  type: transactionTypeSchema,
  status: z.enum(["active", "inactive", "all"]).default("active"),
  // Admins browsing admin-categories.html ask for only the global set;
  // regular users always get "global + my own", scope has no effect for them.
  scope: z.enum(["all", "global"]).default("all"),
});

// Restricted to the exact shapes category-form.html's icon/color pickers
// ever produce (a Bootstrap Icons class, or a hex color / this app's CSS
// custom-property swatches) — not because the UI can't be trusted, but
// because these values are interpolated into innerHTML unescaped all over
// the app (category cards, chips, pickers). A client that calls the API
// directly (not through the UI) could otherwise smuggle arbitrary HTML/JS
// through what looks like a harmless icon name, so this is enforced
// server-side, not left to the picker being the only way in.
const iconSchema = z.string().trim().regex(/^bi-[a-z0-9-]+$/, "Must be a valid icon name").max(40);
const colorSchema = z.string().trim().regex(/^(#[0-9a-fA-F]{3,8}|var\(--[a-zA-Z0-9-]+\))$/, "Must be a hex color or theme color").max(40);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: iconSchema.default("bi-tag-fill"),
  color: colorSchema.default("#2a78d6"),
  transactionType: transactionTypeSchema,
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  icon: iconSchema.optional(),
  color: colorSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
