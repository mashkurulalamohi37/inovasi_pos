import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChefHat,
  Plus,
  Trash2,
  PackageCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import type { RecipeIngredient } from "./types";

const RECIPE_LIBRARIES: Record<string, RecipeIngredient[]> = {
  "burger": [
    { id: "b1", ingredient_name: "Burger Bun", qty_required: 1, unit: "pc", unit_cost: 12, auto_deduct: true },
    { id: "b2", ingredient_name: "Chicken / Beef Patty", qty_required: 1, unit: "pc (120g)", unit_cost: 35, auto_deduct: true },
    { id: "b3", ingredient_name: "Cheddar Cheese Slice", qty_required: 1, unit: "slice", unit_cost: 8, auto_deduct: true },
    { id: "b4", ingredient_name: "Mayonnaise & Sauce", qty_required: 25, unit: "ml", unit_cost: 4, auto_deduct: true },
    { id: "b5", ingredient_name: "Lettuce & Tomato", qty_required: 20, unit: "g", unit_cost: 3, auto_deduct: true },
    { id: "b6", ingredient_name: "Burger Packaging Box", qty_required: 1, unit: "pc", unit_cost: 5, auto_deduct: true },
  ],
  "luchi": [
    { id: "l1", ingredient_name: "Refined Flour (Maida)", qty_required: 40, unit: "g", unit_cost: 3, auto_deduct: true },
    { id: "l2", ingredient_name: "Pure Ghee & Oil", qty_required: 15, unit: "ml", unit_cost: 4, auto_deduct: true },
    { id: "l3", ingredient_name: "Salt & Dough Mix", qty_required: 2, unit: "g", unit_cost: 1, auto_deduct: true },
  ],
  "chola batora": [
    { id: "cb1", ingredient_name: "Chana / Chickpeas", qty_required: 120, unit: "g", unit_cost: 15, auto_deduct: true },
    { id: "cb2", ingredient_name: "Batora Flour Dough", qty_required: 80, unit: "g", unit_cost: 8, auto_deduct: true },
    { id: "cb3", ingredient_name: "Chana Masala & Spices", qty_required: 25, unit: "g", unit_cost: 7, auto_deduct: true },
    { id: "cb4", ingredient_name: "Mustard Oil & Garnish", qty_required: 20, unit: "ml", unit_cost: 5, auto_deduct: true },
  ],
  "chicken jhal fry": [
    { id: "jf1", ingredient_name: "Raw Chicken Meat", qty_required: 150, unit: "g", unit_cost: 32, auto_deduct: true },
    { id: "jf2", ingredient_name: "Green Chili & Onion Paste", qty_required: 40, unit: "g", unit_cost: 8, auto_deduct: true },
    { id: "jf3", ingredient_name: "Mustard Oil & Spices", qty_required: 20, unit: "ml", unit_cost: 6, auto_deduct: true },
    { id: "jf4", ingredient_name: "Capsicum & Tomato", qty_required: 30, unit: "g", unit_cost: 5, auto_deduct: true },
  ],
  "chicken chaap": [
    { id: "cc1", ingredient_name: "Chicken Leg Quarter", qty_required: 1, unit: "pc (220g)", unit_cost: 55, auto_deduct: true },
    { id: "cc2", ingredient_name: "Cashew Paste & Spices", qty_required: 50, unit: "g", unit_cost: 15, auto_deduct: true },
    { id: "cc3", ingredient_name: "Mustard Oil & Ghee", qty_required: 30, unit: "ml", unit_cost: 10, auto_deduct: true },
    { id: "cc4", ingredient_name: "Foil Packaging", qty_required: 1, unit: "pc", unit_cost: 4, auto_deduct: true },
  ],
  "haleem": [
    { id: "h1", ingredient_name: "Mixed Lentils & Grains", qty_required: 100, unit: "g", unit_cost: 12, auto_deduct: true },
    { id: "h2", ingredient_name: "Beef / Chicken Shreds", qty_required: 80, unit: "g", unit_cost: 25, auto_deduct: true },
    { id: "h3", ingredient_name: "Special Haleem Spices", qty_required: 15, unit: "g", unit_cost: 6, auto_deduct: true },
    { id: "h4", ingredient_name: "Fried Onion & Lemon", qty_required: 20, unit: "g", unit_cost: 5, auto_deduct: true },
  ],
  "soup": [
    { id: "s1", ingredient_name: "Chicken Stock & Shreds", qty_required: 150, unit: "ml", unit_cost: 15, auto_deduct: true },
    { id: "s2", ingredient_name: "Corn Starch & Egg Drop", qty_required: 30, unit: "g", unit_cost: 6, auto_deduct: true },
    { id: "s3", ingredient_name: "Soy & Chili Sauce", qty_required: 15, unit: "ml", unit_cost: 4, auto_deduct: true },
    { id: "s4", ingredient_name: "Soup Container Bowl", qty_required: 1, unit: "pc", unit_cost: 5, auto_deduct: true },
  ],
  "steak": [
    { id: "st1", ingredient_name: "Chicken / Beef Cut", qty_required: 1, unit: "pc (250g)", unit_cost: 95, auto_deduct: true },
    { id: "st2", ingredient_name: "Garlic Butter & Herbs", qty_required: 30, unit: "g", unit_cost: 15, auto_deduct: true },
    { id: "st3", ingredient_name: "Mashed Potato / Veggies", qty_required: 80, unit: "g", unit_cost: 12, auto_deduct: true },
    { id: "st4", ingredient_name: "Pepper Mushroom Sauce", qty_required: 40, unit: "ml", unit_cost: 10, auto_deduct: true },
  ],
  "rice": [
    { id: "r1", ingredient_name: "Jasmine / Basmati Rice", qty_required: 180, unit: "g", unit_cost: 15, auto_deduct: true },
    { id: "r2", ingredient_name: "Fried Chicken Piece", qty_required: 2, unit: "pcs", unit_cost: 38, auto_deduct: true },
    { id: "r3", ingredient_name: "Sautéed Vegetables", qty_required: 50, unit: "g", unit_cost: 8, auto_deduct: true },
    { id: "r4", ingredient_name: "Chili Paste & Seasoning", qty_required: 15, unit: "ml", unit_cost: 4, auto_deduct: true },
    { id: "r5", ingredient_name: "Bento Box Packaging", qty_required: 1, unit: "pc", unit_cost: 6, auto_deduct: true },
  ],
  "biryani": [
    { id: "by1", ingredient_name: "Kacchi Chinigura Rice", qty_required: 200, unit: "g", unit_cost: 22, auto_deduct: true },
    { id: "by2", ingredient_name: "Mutton / Chicken Meat", qty_required: 180, unit: "g", unit_cost: 65, auto_deduct: true },
    { id: "by3", ingredient_name: "Ghee, Saffron & Masala", qty_required: 25, unit: "g", unit_cost: 15, auto_deduct: true },
    { id: "by4", ingredient_name: "Potato (Aloo)", qty_required: 1, unit: "pc (60g)", unit_cost: 4, auto_deduct: true },
    { id: "by5", ingredient_name: "Borhani & Foil Box", qty_required: 1, unit: "set", unit_cost: 12, auto_deduct: true },
  ],
  "sandwich": [
    { id: "sw1", ingredient_name: "Sandwich Bread Slices", qty_required: 2, unit: "slices", unit_cost: 8, auto_deduct: true },
    { id: "sw2", ingredient_name: "Chicken / Egg Filling", qty_required: 50, unit: "g", unit_cost: 16, auto_deduct: true },
    { id: "sw3", ingredient_name: "Mayonnaise Spread", qty_required: 15, unit: "ml", unit_cost: 4, auto_deduct: true },
    { id: "sw4", ingredient_name: "Cucumber & Lettuce", qty_required: 15, unit: "g", unit_cost: 3, auto_deduct: true },
    { id: "sw5", ingredient_name: "Sandwich Foil Wrap", qty_required: 1, unit: "pc", unit_cost: 3, auto_deduct: true },
  ],
  "pizza": [
    { id: "p1", ingredient_name: "Pizza Dough Crust Base", qty_required: 1, unit: "pc", unit_cost: 30, auto_deduct: true },
    { id: "p2", ingredient_name: "Mozzarella Cheese", qty_required: 80, unit: "g", unit_cost: 42, auto_deduct: true },
    { id: "p3", ingredient_name: "Chicken Toppings", qty_required: 60, unit: "g", unit_cost: 25, auto_deduct: true },
    { id: "p4", ingredient_name: "Tomato Pizza Sauce", qty_required: 35, unit: "ml", unit_cost: 8, auto_deduct: true },
    { id: "p5", ingredient_name: "Pizza Box Packaging", qty_required: 1, unit: "pc", unit_cost: 12, auto_deduct: true },
  ],
  "pasta": [
    { id: "pst1", ingredient_name: "Pasta (Penne/Fusilli)", qty_required: 120, unit: "g", unit_cost: 18, auto_deduct: true },
    { id: "pst2", ingredient_name: "White Cream Sauce", qty_required: 100, unit: "ml", unit_cost: 22, auto_deduct: true },
    { id: "pst3", ingredient_name: "Chicken Meat Cubes", qty_required: 60, unit: "g", unit_cost: 24, auto_deduct: true },
    { id: "pst4", ingredient_name: "Parmesan & Cheese", qty_required: 15, unit: "g", unit_cost: 10, auto_deduct: true },
  ],
  "coffee": [
    { id: "cf1", ingredient_name: "Roasted Espresso Beans", qty_required: 18, unit: "g", unit_cost: 12, auto_deduct: true },
    { id: "cf2", ingredient_name: "Full Cream Steamed Milk", qty_required: 180, unit: "ml", unit_cost: 14, auto_deduct: true },
    { id: "cf3", ingredient_name: "Flavored Syrup / Sugar", qty_required: 10, unit: "ml", unit_cost: 4, auto_deduct: true },
    { id: "cf4", ingredient_name: "Coffee Cup & Lid", qty_required: 1, unit: "set", unit_cost: 6, auto_deduct: true },
  ],
  "shake": [
    { id: "sh1", ingredient_name: "Whole Milk & Ice Cream", qty_required: 200, unit: "ml", unit_cost: 25, auto_deduct: true },
    { id: "sh2", ingredient_name: "Chocolate / Vanilla Syrup", qty_required: 30, unit: "ml", unit_cost: 10, auto_deduct: true },
    { id: "sh3", ingredient_name: "Whipped Cream & Topping", qty_required: 25, unit: "g", unit_cost: 8, auto_deduct: true },
    { id: "sh4", ingredient_name: "Tall Cup & Straw", qty_required: 1, unit: "set", unit_cost: 7, auto_deduct: true },
  ],
};

function resolveRecipeForDish(dishName: string): RecipeIngredient[] {
  if (!dishName) return RECIPE_LIBRARIES["burger"];

  try {
    const saved = localStorage.getItem(`pulse.recipe.${dishName}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  const lower = dishName.toLowerCase();
  for (const [key, ingredients] of Object.entries(RECIPE_LIBRARIES)) {
    if (lower.includes(key)) return ingredients;
  }

  if (lower.includes("chola") || lower.includes("batora")) return RECIPE_LIBRARIES["chola batora"];
  if (lower.includes("luchi")) return RECIPE_LIBRARIES["luchi"];
  if (lower.includes("chaap")) return RECIPE_LIBRARIES["chicken chaap"];
  if (lower.includes("jhal") || lower.includes("fry")) return RECIPE_LIBRARIES["chicken jhal fry"];
  if (lower.includes("haleem")) return RECIPE_LIBRARIES["haleem"];
  if (lower.includes("soup")) return RECIPE_LIBRARIES["soup"];
  if (lower.includes("steak")) return RECIPE_LIBRARIES["steak"];
  if (lower.includes("combo") || lower.includes("special") || lower.includes("rice")) return RECIPE_LIBRARIES["rice"];
  if (lower.includes("sub") || lower.includes("club") || lower.includes("egg")) return RECIPE_LIBRARIES["sandwich"];
  if (lower.includes("chowmein") || lower.includes("noodle") || lower.includes("pasta")) return RECIPE_LIBRARIES["pasta"];
  if (lower.includes("coffee") || lower.includes("latte") || lower.includes("tea")) return RECIPE_LIBRARIES["coffee"];
  if (lower.includes("shake") || lower.includes("juice") || lower.includes("drink")) return RECIPE_LIBRARIES["shake"];

  return RECIPE_LIBRARIES["burger"];
}

export function RecipeBomDialog({
  open,
  onOpenChange,
  dishName = "Chicken Burger",
  sellingPrice = 150,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dishName?: string;
  sellingPrice?: number;
}) {
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(() => resolveRecipeForDish(dishName));
  const [newIngName, setNewIngName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("pc");
  const [newCost, setNewCost] = useState("10");

  useEffect(() => {
    if (open) {
      setIngredients(resolveRecipeForDish(dishName));
    }
  }, [dishName, open]);

  const totalRecipeCost = ingredients.reduce((sum, ing) => sum + ing.unit_cost, 0);
  const profitMargin = sellingPrice > 0 ? ((sellingPrice - totalRecipeCost) / sellingPrice) * 100 : 0;

  const handleAddIngredient = () => {
    if (!newIngName.trim()) {
      toast.error("Enter ingredient name");
      return;
    }
    const newIng: RecipeIngredient = {
      id: `ing-${Date.now()}`,
      ingredient_name: newIngName.trim(),
      qty_required: Number(newQty) || 1,
      unit: newUnit.trim() || "pc",
      unit_cost: Number(newCost) || 0,
      auto_deduct: true,
    };
    setIngredients(prev => [...prev, newIng]);
    setNewIngName("");
    setNewQty("1");
    setNewCost("10");
    toast.success(`Added ${newIng.ingredient_name} to recipe`);
  };

  const handleRemove = (id: string) => {
    setIngredients(prev => prev.filter(i => i.id !== id));
    toast.info("Ingredient removed");
  };

  const handleSaveRecipe = () => {
    try {
      localStorage.setItem(`pulse.recipe.${dishName}`, JSON.stringify(ingredients));
    } catch {}
    toast.success(`Saved Recipe BOM for ${dishName}!`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <ChefHat className="h-5 w-5 text-primary" />
            <span>Recipe BOM & Ingredients — {dishName}</span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-bold">
              Selling Price: {fmtBDT(sellingPrice)}
            </Badge>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold">
              Recipe Cost: {fmtBDT(totalRecipeCost)}
            </Badge>
            <Badge
              variant="outline"
              className={profitMargin > 50 ? "bg-emerald-600 text-white font-bold" : "bg-amber-500 text-white font-bold"}
            >
              Profit Margin: {profitMargin.toFixed(1)}%
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Ingredient List Table */}
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-12 bg-muted/60 px-3 py-2 text-xs font-bold text-muted-foreground border-b border-border">
              <div className="col-span-5">Ingredient Material</div>
              <div className="col-span-2 text-center">Qty / Unit</div>
              <div className="col-span-3 text-right">Cost (BDT)</div>
              <div className="col-span-2 text-center">Action</div>
            </div>
            <div className="divide-y divide-border/60 max-h-60 overflow-y-auto">
              {ingredients.map((ing) => (
                <div key={ing.id} className="grid grid-cols-12 px-3 py-2 text-xs items-center hover:bg-muted/20">
                  <div className="col-span-5 font-semibold flex items-center gap-1.5">
                    <PackageCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{ing.ingredient_name}</span>
                  </div>
                  <div className="col-span-2 text-center font-mono text-muted-foreground">
                    {ing.qty_required} {ing.unit}
                  </div>
                  <div className="col-span-3 text-right font-bold font-mono text-foreground">
                    {fmtBDT(ing.unit_cost)}
                  </div>
                  <div className="col-span-2 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemove(ing.id)}
                      title="Remove ingredient"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {ingredients.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No ingredients defined yet. Add items below.
                </div>
              )}
            </div>
          </div>

          {/* Add New Ingredient Form */}
          <div className="rounded-xl border border-border/80 p-3 bg-muted/20 space-y-2">
            <div className="text-xs font-bold flex items-center gap-1.5 text-foreground">
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span>Add Raw Ingredient Material to Dish</span>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <Input
                  placeholder="e.g. Burger Bun / Flour / Spices"
                  className="h-8 text-xs bg-background"
                  value={newIngName}
                  onChange={(e) => setNewIngName(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  placeholder="Qty"
                  className="h-8 text-xs bg-background"
                  type="number"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  placeholder="Unit (pc/g/ml)"
                  className="h-8 text-xs bg-background"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                />
              </div>
              <div className="col-span-3">
                <Input
                  placeholder="Cost ৳"
                  className="h-8 text-xs bg-background"
                  type="number"
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                />
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs w-full font-bold gap-1 cursor-pointer"
              onClick={handleAddIngredient}
            >
              <Plus className="h-3.5 w-3.5" /> Add Ingredient to Recipe
            </Button>
          </div>
        </div>

        <DialogFooter className="border-t pt-3 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            <span>Stock automatically deducts when items are cooked in Kitchen KDS.</span>
          </div>
          <Button
            size="sm"
            onClick={handleSaveRecipe}
          >
            Save Recipe BOM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
