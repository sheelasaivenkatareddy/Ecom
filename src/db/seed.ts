import bcrypt from 'bcryptjs';
import type { Queryable } from './types.js';

const image = (photoId: string) =>
  `https://images.unsplash.com/photo-${photoId}?w=800&h=800&fit=crop&auto=format&q=80`;

export const seedCategories = [
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Fashion', slug: 'fashion' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Home & Living', slug: 'home-living' },
] as const;

type CategorySlug = (typeof seedCategories)[number]['slug'];

interface SeedProduct {
  name: string;
  slug: string;
  category: CategorySlug;
  description: string;
  pricePaise: number;
  stock: number;
  imageUrl: string;
  isFeatured?: boolean;
}

export const seedProducts: SeedProduct[] = [
  {
    name: 'Wireless Over-Ear Headphones',
    slug: 'wireless-over-ear-headphones',
    category: 'electronics',
    description:
      'Immersive sound with active noise cancellation, plush memory-foam ear cushions and up to 30 hours of battery life on a single charge.',
    pricePaise: 499_900,
    stock: 25,
    imageUrl: image('1505740420928-5e560c06d30e'),
    isFeatured: true,
  },
  {
    name: 'Fitness Smartwatch',
    slug: 'fitness-smartwatch',
    category: 'electronics',
    description:
      'Track workouts, heart rate, sleep and steps with a bright always-on display, 5 ATM water resistance and a 7-day battery.',
    pricePaise: 649_900,
    stock: 18,
    imageUrl: image('1523275335684-37898b6baf30'),
    isFeatured: true,
  },
  {
    name: 'True Wireless Earbuds',
    slug: 'true-wireless-earbuds',
    category: 'electronics',
    description:
      'Compact earbuds with a pocket-sized charging case, touch controls and clear calls on the go.',
    pricePaise: 299_900,
    stock: 40,
    imageUrl: image('1590658268037-6bf12165a8df'),
  },
  {
    name: 'Low-Profile Wireless Keyboard',
    slug: 'low-profile-wireless-keyboard',
    category: 'electronics',
    description:
      'Slim, quiet keys with a rechargeable battery and multi-device Bluetooth pairing for your laptop, tablet and phone.',
    pricePaise: 349_900,
    stock: 30,
    imageUrl: image('1587829741301-dc798b83add3'),
  },
  {
    name: '14-inch Ultrabook Laptop',
    slug: '14-inch-ultrabook-laptop',
    category: 'electronics',
    description:
      'A thin and light aluminium laptop with a 14-inch Full HD display, 16 GB RAM and a 512 GB SSD for work and study.',
    pricePaise: 6_499_000,
    stock: 8,
    imageUrl: image('1496181133206-80ce9b88a853'),
  },
  {
    name: 'Classic Cotton T-Shirt',
    slug: 'classic-cotton-t-shirt',
    category: 'fashion',
    description:
      'A breathable 100% cotton crew-neck tee with a relaxed fit that works on its own or layered.',
    pricePaise: 59_900,
    stock: 120,
    imageUrl: image('1521572163474-6864f9cf17ab'),
  },
  {
    name: 'Relaxed Fit Denim Jeans',
    slug: 'relaxed-fit-denim-jeans',
    category: 'fashion',
    description:
      'Mid-rise jeans cut from soft, durable denim with a comfortable relaxed fit through the leg.',
    pricePaise: 179_900,
    stock: 60,
    imageUrl: image('1576995853123-5a10305d93c0'),
  },
  {
    name: 'Everyday Running Sneakers',
    slug: 'everyday-running-sneakers',
    category: 'fashion',
    description:
      'Lightweight knit sneakers with a cushioned sole and breathable upper for runs, walks and everything in between.',
    pricePaise: 329_900,
    stock: 35,
    imageUrl: image('1491553895911-0055eca6402d'),
    isFeatured: true,
  },
  {
    name: 'Everyday Backpack 25L',
    slug: 'everyday-backpack-25l',
    category: 'accessories',
    description:
      'A water-resistant backpack with a padded 15-inch laptop sleeve, quick-access pockets and comfortable straps.',
    pricePaise: 199_900,
    stock: 45,
    imageUrl: image('1553062407-98eeb64c6a62'),
  },
  {
    name: 'Chronograph Leather Watch',
    slug: 'chronograph-leather-watch',
    category: 'accessories',
    description:
      'A classic chronograph with a stainless-steel case, scratch-resistant glass and a genuine leather strap.',
    pricePaise: 899_900,
    stock: 12,
    imageUrl: image('1524805444758-089113d48a6d'),
  },
  {
    name: 'Insulated Steel Bottle 750 ml',
    slug: 'insulated-steel-bottle-750ml',
    category: 'accessories',
    description:
      'Double-walled stainless steel keeps drinks cold for 24 hours or hot for 12. Leak-proof and BPA-free.',
    pricePaise: 89_900,
    stock: 80,
    imageUrl: image('1602143407151-7111542de6e8'),
  },
  {
    name: 'Ceramic Coffee Mug 350 ml',
    slug: 'ceramic-coffee-mug',
    category: 'home-living',
    description:
      'A minimal, dishwasher-safe ceramic mug with a comfortable handle, sized for your morning coffee or chai.',
    pricePaise: 34_900,
    stock: 150,
    imageUrl: image('1514228742587-6b1558fcca3d'),
  },
  {
    name: 'Adjustable Desk Lamp',
    slug: 'adjustable-desk-lamp',
    category: 'home-living',
    description:
      'A sturdy metal desk lamp with an adjustable arm and head that puts light exactly where you need it.',
    pricePaise: 149_900,
    stock: 28,
    imageUrl: image('1507473885765-e6ed057f782c'),
    isFeatured: true,
  },
  {
    name: 'Succulent in Ceramic Pot',
    slug: 'succulent-in-ceramic-pot',
    category: 'home-living',
    description:
      'A low-maintenance succulent in a pastel ceramic pot that brightens up any desk or windowsill.',
    pricePaise: 44_900,
    stock: 50,
    imageUrl: image('1485955900006-10f4d324d411'),
  },
];

/** Inserts demo categories, products and an admin account. Does nothing if data already exists. */
export async function seedDatabase(
  db: Queryable,
  admin: { email: string; password: string },
): Promise<void> {
  const existing = await db.query<{ count: string | number }>(
    'SELECT COUNT(*) AS count FROM categories',
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) return;

  const categoryIds = new Map<string, number>();
  for (const category of seedCategories) {
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id',
      [category.name, category.slug],
    );
    categoryIds.set(category.slug, rows[0]!.id);
  }

  for (const product of seedProducts) {
    await db.query(
      `INSERT INTO products (category_id, name, slug, description, price_paise, stock, image_url, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        categoryIds.get(product.category),
        product.name,
        product.slug,
        product.description,
        product.pricePaise,
        product.stock,
        product.imageUrl,
        product.isFeatured ?? false,
      ],
    );
  }

  const passwordHash = await bcrypt.hash(admin.password, 10);
  await db.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
    ['Store Admin', admin.email, passwordHash],
  );
}
