import { z } from 'zod';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'name'] as const;

export const listProductsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  /** Inclusive price bounds in paise. */
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sort: z.enum(PRODUCT_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

const productFields = {
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes only'),
  description: z.string().trim().min(10).max(2000),
  categorySlug: z.string().trim().min(1),
  pricePaise: z.number().int().min(0).max(100_000_000),
  stock: z.number().int().min(0).max(100_000),
  imageUrl: z.url(),
  isFeatured: z.boolean(),
};

export const createProductSchema = z.object({
  ...productFields,
  slug: productFields.slug.optional(),
  isFeatured: productFields.isFeatured.default(false),
});

export const updateProductSchema = z
  .object(productFields)
  .partial()
  .refine((fields) => Object.keys(fields).length > 0, 'Provide at least one field to update');

export const productIdParam = z.coerce.number().int().positive();

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
