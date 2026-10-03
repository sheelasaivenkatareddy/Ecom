import { z } from 'zod';

export const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const shippingSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  address: z.string().trim().min(5, 'Enter the full address').max(200),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  state: z.string().trim().min(2, 'Enter the state').max(60),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
});

// Prices are deliberately not accepted from the client: the server always uses catalogue prices.
export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(50),
  shipping: shippingSchema,
  paymentMethod: z.literal('cod').default('cod'),
});

export const updateStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

export const orderIdParam = z.coerce.number().int().positive();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
