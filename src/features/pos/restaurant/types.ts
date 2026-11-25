export type TableRow = {
  id: string;
  /** Human table code (T-01, VIP-02). Distinct from `id`, which is a UUID. */
  table_no: string;
  table_name: string;
  label: string;
  status: string;
  current_order_id?: string | null;
  capacity?: number;
  guest_count?: number | null;
  order_total?: number | null;
  zone?: string | null;
};

export type ServiceMode = "dine_in" | "takeaway" | "delivery";

export type TableFormValues = {
  table_no: string;
  table_name: string;
  capacity: number;
  floor_or_zone: string;
};

/** What part a dish plays in a bundle. Mirrors the backend's COMBO_ITEM_ROLES. */
export type ComboItemRole = "main" | "side" | "drink" | "addon";

export type ComboComponent = {
  id: string;
  product_id: string;
  item_role: ComboItemRole;
  product_name: string;
  sku?: string | null;
  base_price: number;
  kitchen_station?: string | null;
  is_active: boolean;
};

export type ComboRow = {
  id: string;
  name: string;
  combo_price: number;
  /** Sum of the components' menu prices. */
  components_total: number;
  /** components_total - combo_price. Negative if the bundle costs more than its parts. */
  savings: number;
  items: ComboComponent[];
};

/** A component while it is being edited — no server-side fields yet. */
export type ComboComponentDraft = {
  product_id: string;
  item_role: ComboItemRole;
};

export type ComboFormValues = {
  name: string;
  combo_price: number;
  items: ComboComponentDraft[];
};

export type RecipeIngredient = {
  id: string;
  ingredient_name: string;
  qty_required: number;
  unit: string;
  unit_cost: number;
  auto_deduct: boolean;
};

export type DishRecipe = {
  dish_id: string;
  dish_name: string;
  ingredients: RecipeIngredient[];
  total_cost: number;
  selling_price: number;
};

export type KitchenStockItem = {
  id: string;
  name: string;
  category: string;
  current_stock: number;
  unit: string;
  min_stock_level: number;
  unit_cost: number;
};

export type KitchenWasteLog = {
  id: string;
  ts: string;
  ingredient_name: string;
  qty: number;
  unit: string;
  reason: string;
  cost: number;
};
