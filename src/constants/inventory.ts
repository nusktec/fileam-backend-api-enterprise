export const INVENTORY_MOVEMENT_TYPES = {
  OPENING: "OPENING",
  RESTOCK: "RESTOCK",
  ADJUSTMENT_IN: "ADJUSTMENT_IN",
  ADJUSTMENT_OUT: "ADJUSTMENT_OUT",
  SALE: "SALE",
} as const;

export type InventoryMovementType =
  (typeof INVENTORY_MOVEMENT_TYPES)[keyof typeof INVENTORY_MOVEMENT_TYPES];

/** Days without a sale to flag as slow-moving (when stock remains). */
export const INVENTORY_SLOW_MOVING_DAYS = 90;

/** Window to measure velocity for “moving low”. */
export const INVENTORY_VELOCITY_DAYS = 60;
