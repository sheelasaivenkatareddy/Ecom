import type { Pool } from 'pg';
import { withTransaction } from '../../db/index.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { shippingFor } from '../../lib/money.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { CreateOrderInput, OrderStatus } from './orders.schemas.js';

interface OrderRow {
  id: number;
  user_id: number;
  status: OrderStatus;
  payment_method: 'cod';
  subtotal_paise: number;
  shipping_paise: number;
  total_paise: number;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  created_at: Date;
}

interface OrderItemRow {
  order_id: number;
  product_id: number;
  product_name: string;
  unit_price_paise: number;
  quantity: number;
  product_slug: string | null;
  image_url: string | null;
}

const MAX_UNITS_PER_PRODUCT = 10;

/** Which status changes an admin may make. Customers may only cancel a pending order. */
const ADMIN_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const toOrderItem = (row: OrderItemRow) => ({
  productId: row.product_id,
  productSlug: row.product_slug,
  name: row.product_name,
  imageUrl: row.image_url,
  unitPricePaise: row.unit_price_paise,
  quantity: row.quantity,
  lineTotalPaise: row.unit_price_paise * row.quantity,
});

const toOrder = (row: OrderRow, items: OrderItemRow[]) => ({
  id: row.id,
  status: row.status,
  paymentMethod: row.payment_method,
  subtotalPaise: row.subtotal_paise,
  shippingPaise: row.shipping_paise,
  totalPaise: row.total_paise,
  itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  items: items.map(toOrderItem),
  shipping: {
    name: row.shipping_name,
    phone: row.shipping_phone,
    address: row.shipping_address,
    city: row.shipping_city,
    state: row.shipping_state,
    pincode: row.shipping_pincode,
  },
  createdAt: row.created_at,
});

export type Order = ReturnType<typeof toOrder>;

export function createOrderService(pool: Pool) {
  async function itemsFor(orderIds: number[]): Promise<Map<number, OrderItemRow[]>> {
    const grouped = new Map<number, OrderItemRow[]>(orderIds.map((id) => [id, []]));
    if (orderIds.length === 0) return grouped;

    const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ');
    const { rows } = await pool.query<OrderItemRow>(
      `SELECT oi.order_id, oi.product_id, oi.product_name, oi.unit_price_paise, oi.quantity,
              p.slug AS product_slug, p.image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (${placeholders})
       ORDER BY oi.id`,
      orderIds,
    );
    for (const row of rows) grouped.get(row.order_id)?.push(row);
    return grouped;
  }

  /** Returns the order if `user` owns it (or is an admin); otherwise 404 so ids are not leaked. */
  async function getForUser(orderId: number, user: AuthUser): Promise<Order> {
    const { rows } = await pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
    const row = rows[0];
    if (!row || (user.role !== 'admin' && row.user_id !== user.id)) {
      throw notFound('Order not found');
    }
    const items = await itemsFor([row.id]);
    return toOrder(row, items.get(row.id) ?? []);
  }

  /** Lists the user's orders, newest first. Admins can pass `all` to see every order. */
  async function list(user: AuthUser, options: { all?: boolean } = {}): Promise<Order[]> {
    const everyone = user.role === 'admin' && options.all === true;
    const { rows } = everyone
      ? await pool.query<OrderRow>('SELECT * FROM orders ORDER BY id DESC LIMIT 100')
      : await pool.query<OrderRow>(
          'SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 100',
          [user.id],
        );
    const items = await itemsFor(rows.map((row) => row.id));
    return rows.map((row) => toOrder(row, items.get(row.id) ?? []));
  }

  async function create(user: AuthUser, input: CreateOrderInput): Promise<Order> {
    const quantities = new Map<number, number>();
    for (const item of input.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    for (const [productId, quantity] of quantities) {
      if (quantity > MAX_UNITS_PER_PRODUCT) {
        throw badRequest(`You can order at most ${MAX_UNITS_PER_PRODUCT} of each product`, {
          productId,
        });
      }
    }

    const orderId = await withTransaction(pool, async (client) => {
      // Check every line before changing anything, so a problem with one item never
      // leaves the others half-reserved.
      const productIds = [...quantities.keys()];
      const placeholders = productIds.map((_, index) => `$${index + 1}`).join(', ');
      const { rows: current } = await client.query<{
        id: number;
        name: string;
        stock: number;
        is_active: boolean;
      }>(`SELECT id, name, stock, is_active FROM products WHERE id IN (${placeholders})`, productIds);
      const currentById = new Map(current.map((product) => [product.id, product]));

      for (const [productId, quantity] of quantities) {
        const product = currentById.get(productId);
        if (!product || !product.is_active) {
          throw conflict('A product in your cart is no longer available', { productId });
        }
        if (product.stock < quantity) {
          throw conflict(`Only ${product.stock} left in stock for "${product.name}"`, {
            productId,
            available: product.stock,
          });
        }
      }

      const lines: { productId: number; name: string; unitPricePaise: number; quantity: number }[] =
        [];

      for (const [productId, quantity] of quantities) {
        // Reserve atomically: the row only updates if enough units are still left, which
        // protects against another order taking the stock since the check above.
        const reserved = await client.query<{ id: number; name: string; price_paise: number }>(
          `UPDATE products SET stock = stock - $1::integer
           WHERE id = $2 AND is_active = true AND stock >= $1::integer
           RETURNING id, name, price_paise`,
          [quantity, productId],
        );
        const product = reserved.rows[0];
        if (!product) {
          throw conflict('An item in your cart just sold out. Please review your cart.', {
            productId,
          });
        }
        lines.push({
          productId: product.id,
          name: product.name,
          unitPricePaise: product.price_paise,
          quantity,
        });
      }

      const subtotal = lines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
      const shipping = shippingFor(subtotal);
      const { name, phone, address, city, state, pincode } = input.shipping;

      const created = await client.query<{ id: number }>(
        `INSERT INTO orders (user_id, payment_method, subtotal_paise, shipping_paise, total_paise,
           shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          user.id,
          input.paymentMethod,
          subtotal,
          shipping,
          subtotal + shipping,
          name,
          phone,
          address,
          city,
          state,
          pincode,
        ],
      );
      const newOrderId = created.rows[0]!.id;

      for (const line of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price_paise, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [newOrderId, line.productId, line.name, line.unitPricePaise, line.quantity],
        );
      }
      return newOrderId;
    });

    return getForUser(orderId, user);
  }

  async function updateStatus(orderId: number, next: OrderStatus, actor: AuthUser): Promise<Order> {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query<Pick<OrderRow, 'user_id' | 'status'>>(
        'SELECT user_id, status FROM orders WHERE id = $1',
        [orderId],
      );
      const order = rows[0];
      if (!order || (actor.role !== 'admin' && order.user_id !== actor.id)) {
        throw notFound('Order not found');
      }

      const allowed: readonly OrderStatus[] =
        actor.role === 'admin'
          ? ADMIN_TRANSITIONS[order.status]
          : order.status === 'pending'
            ? ['cancelled']
            : [];
      if (!allowed.includes(next)) {
        throw conflict(`An order that is ${order.status} cannot be changed to ${next}`);
      }

      // Guard against a concurrent change between the read above and this write.
      const updated = await client.query(
        'UPDATE orders SET status = $1 WHERE id = $2 AND status = $3 RETURNING id',
        [next, orderId, order.status],
      );
      if (updated.rows.length === 0) {
        throw conflict('This order was just updated. Please refresh and try again.');
      }

      if (next === 'cancelled') {
        const items = await client.query<{ product_id: number; quantity: number }>(
          'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
          [orderId],
        );
        for (const item of items.rows) {
          await client.query('UPDATE products SET stock = stock + $1::integer WHERE id = $2', [
            item.quantity,
            item.product_id,
          ]);
        }
      }
    });

    return getForUser(orderId, actor);
  }

  return { list, getForUser, create, updateStatus };
}

export type OrderService = ReturnType<typeof createOrderService>;
