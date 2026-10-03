import type { Queryable } from '../../db/types.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from './products.schemas.js';

interface ProductRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  price_paise: number;
  stock: number;
  image_url: string;
  is_featured: boolean;
  created_at: Date;
  category_name: string;
  category_slug: string;
}

const PRODUCT_COLUMNS = `p.id, p.name, p.slug, p.description, p.price_paise, p.stock, p.image_url,
  p.is_featured, p.created_at, c.name AS category_name, c.slug AS category_slug`;
const FROM_PRODUCTS = 'FROM products p JOIN categories c ON c.id = p.category_id';

// Whitelisted ORDER BY clauses; user input never reaches the SQL directly.
const SORT_SQL: Record<ListProductsQuery['sort'], string> = {
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price_paise ASC, p.id ASC',
  price_desc: 'p.price_paise DESC, p.id DESC',
  name: 'p.name ASC, p.id ASC',
};

const toProduct = (row: ProductRow) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  pricePaise: row.price_paise,
  stock: row.stock,
  inStock: row.stock > 0,
  imageUrl: row.image_url,
  isFeatured: row.is_featured,
  category: { name: row.category_name, slug: row.category_slug },
  createdAt: row.created_at,
});

export type Product = ReturnType<typeof toProduct>;

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);

export function createProductService(db: Queryable) {
  async function findById(id: number): Promise<Product> {
    const { rows } = await db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} ${FROM_PRODUCTS} WHERE p.id = $1 AND p.is_active = true`,
      [id],
    );
    if (!rows[0]) throw notFound('Product not found');
    return toProduct(rows[0]);
  }

  async function categoryIdFor(slug: string): Promise<number> {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM categories WHERE slug = $1', [slug]);
    if (!rows[0]) throw badRequest(`Unknown category "${slug}"`);
    return rows[0].id;
  }

  async function assertSlugAvailable(slug: string, exceptId?: number): Promise<void> {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM products WHERE slug = $1', [slug]);
    if (rows.some((row) => row.id !== exceptId)) {
      throw conflict(`A product with the slug "${slug}" already exists`);
    }
  }

  async function list(query: ListProductsQuery) {
    const conditions = ['p.is_active = true'];
    const values: unknown[] = [];
    const param = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.q) {
      const term = param(`%${escapeLike(query.q)}%`);
      conditions.push(`(p.name ILIKE ${term} OR p.description ILIKE ${term})`);
    }
    if (query.category) conditions.push(`c.slug = ${param(query.category)}`);
    if (query.minPrice !== undefined) conditions.push(`p.price_paise >= ${param(query.minPrice)}`);
    if (query.maxPrice !== undefined) conditions.push(`p.price_paise <= ${param(query.maxPrice)}`);
    if (query.featured !== undefined) conditions.push(`p.is_featured = ${param(query.featured)}`);

    const where = `WHERE ${conditions.join(' AND ')}`;
    const count = await db.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total ${FROM_PRODUCTS} ${where}`,
      [...values],
    );
    const total = Number(count.rows[0]?.total ?? 0);

    const limit = param(query.limit);
    const offset = param((query.page - 1) * query.limit);
    const { rows } = await db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} ${FROM_PRODUCTS} ${where}
       ORDER BY ${SORT_SQL[query.sort]} LIMIT ${limit} OFFSET ${offset}`,
      values,
    );

    return {
      items: rows.map(toProduct),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async function getBySlug(slug: string): Promise<Product> {
    const { rows } = await db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} ${FROM_PRODUCTS} WHERE p.slug = $1 AND p.is_active = true`,
      [slug],
    );
    if (!rows[0]) throw notFound('Product not found');
    return toProduct(rows[0]);
  }

  async function listCategories() {
    const { rows } = await db.query<{
      id: number;
      name: string;
      slug: string;
      product_count: string | number;
    }>(
      `SELECT c.id, c.name, c.slug, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
       GROUP BY c.id, c.name, c.slug
       ORDER BY c.name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      productCount: Number(row.product_count),
    }));
  }

  async function create(input: CreateProductInput): Promise<Product> {
    const slug = input.slug ?? slugify(input.name);
    await assertSlugAvailable(slug);
    const categoryId = await categoryIdFor(input.categorySlug);

    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO products (category_id, name, slug, description, price_paise, stock, image_url, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        categoryId,
        input.name,
        slug,
        input.description,
        input.pricePaise,
        input.stock,
        input.imageUrl,
        input.isFeatured,
      ],
    );
    return findById(rows[0]!.id);
  }

  async function update(id: number, input: UpdateProductInput): Promise<Product> {
    await findById(id);

    const assignments: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.slug !== undefined) {
      await assertSlugAvailable(input.slug, id);
      set('slug', input.slug);
    }
    if (input.description !== undefined) set('description', input.description);
    if (input.categorySlug !== undefined) set('category_id', await categoryIdFor(input.categorySlug));
    if (input.pricePaise !== undefined) set('price_paise', input.pricePaise);
    if (input.stock !== undefined) set('stock', input.stock);
    if (input.imageUrl !== undefined) set('image_url', input.imageUrl);
    if (input.isFeatured !== undefined) set('is_featured', input.isFeatured);

    values.push(id);
    await db.query(
      `UPDATE products SET ${assignments.join(', ')} WHERE id = $${values.length}`,
      values,
    );
    return findById(id);
  }

  /** Soft-deletes a product so past orders keep their history. */
  async function remove(id: number): Promise<void> {
    const { rows } = await db.query(
      'UPDATE products SET is_active = false WHERE id = $1 AND is_active = true RETURNING id',
      [id],
    );
    if (rows.length === 0) throw notFound('Product not found');
  }

  return { list, getBySlug, listCategories, create, update, remove };
}

export type ProductService = ReturnType<typeof createProductService>;
