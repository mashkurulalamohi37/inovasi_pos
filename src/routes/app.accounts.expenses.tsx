import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RefreshCw, Wallet, Tag } from "lucide-react";
import {
  useExpenses,
  useCreateExpense,
  useExpenseCategories,
  useCreateExpenseCategory,
  useChartOfAccounts,
  useApiStores,
} from "@/hooks/use-api-config";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { todayDateRange } from "@/lib/dates";

export const Route = createFileRoute("/app/accounts/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const { data: expenses = [], isLoading: expLoading, isError: expError, refetch: expRefetch } = useExpenses();
  const { data: categories = [], isLoading: catLoading, isError: catError, refetch: catRefetch } = useExpenseCategories();
  const { data: accounts = [] } = useChartOfAccounts();
  const { data: stores = [] } = useApiStores();

  const createExpenseMut = useCreateExpense();
  const createCategoryMut = useCreateExpenseCategory();

  // Tabs / Drawers state
  const [activeTab, setActiveTab] = useState("expenses");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Form states
  const [expenseForm, setExpenseForm] = useState({
    category_id: "",
    amount: "",
    paid_from_account_id: "",
    expense_date: todayDateRange().from,
    store_id: "",
    payee: "",
    note: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    default_expense_account_id: "",
  });

  const handleCreateExpense = async () => {
    await createExpenseMut.mutateAsync({
      category_id: expenseForm.category_id,
      amount: Number(expenseForm.amount),
      paid_from_account_id: expenseForm.paid_from_account_id,
      expense_date: new Date(expenseForm.expense_date).toISOString(),
      store_id: expenseForm.store_id || undefined,
      payee: expenseForm.payee || undefined,
      note: expenseForm.note || undefined,
    });
    setExpenseOpen(false);
    setExpenseForm({
      category_id: "",
      amount: "",
      paid_from_account_id: "",
      expense_date: todayDateRange().from,
      store_id: "",
      payee: "",
      note: "",
    });
    expRefetch();
  };

  const handleCreateCategory = async () => {
    await createCategoryMut.mutateAsync({
      name: categoryForm.name,
      default_expense_account_id: categoryForm.default_expense_account_id,
    });
    setCategoryOpen(false);
    setCategoryForm({ name: "", default_expense_account_id: "" });
    catRefetch();
  };

  const refetchAll = () => {
    expRefetch();
    catRefetch();
  };

  if (expError || catError) return <ErrorState onRetry={refetchAll} />;

  // Filter accounts for form dropdowns
  // cash / bank / asset accounts for paid_from
  const assetAccounts = accounts.filter(
    (a) => a.account_type === "asset" && a.is_active,
  );
  // expense accounts for default expense category account
  const expenseAccounts = accounts.filter(
    (a) => a.account_type === "expense" && a.is_active,
  );

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Expense Tracker"
        subtitle="Record company operating expenses, track disbursements, and configure expense classifications"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetchAll}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            {activeTab === "expenses" ? (
              <PermissionGate perm="accounts.expense_manage">
                <Button size="sm" onClick={() => setExpenseOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Record Expense
                </Button>
              </PermissionGate>
            ) : (
              <PermissionGate perm="accounts.manage_chart">
                <Button size="sm" onClick={() => setCategoryOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Category
                </Button>
              </PermissionGate>
            )}
          </div>
        }
      />

      <PageBody>
        <Tabs defaultValue="expenses" onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-secondary mb-4">
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="categories">Expense Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses">
            {expLoading ? (
              <LoadingState rows={8} />
            ) : (
              <SectionCard title="Disbursement Log">
                {expenses.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No expenses recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3 text-left">Date</th>
                          <th className="px-5 py-3 text-left">Category</th>
                          <th className="px-5 py-3 text-left">Payee</th>
                          <th className="px-5 py-3 text-left">Paid From</th>
                          <th className="px-5 py-3 text-left">Store</th>
                          <th className="px-5 py-3 text-left">Note</th>
                          <th className="px-5 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {expenses.map((exp) => {
                          const category = categories.find((c) => c.id === exp.category_id);
                          const paidAccount = accounts.find((a) => a.id === exp.paid_from_account_id);
                          const store = stores.find((s) => s.id === exp.store_id);

                          return (
                            <tr key={exp.id} className="hover:bg-muted/30">
                              <td className="px-5 py-3">
                                {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : ""}
                              </td>
                              <td className="px-5 py-3 font-medium">
                                {category?.name || "—"}
                              </td>
                              <td className="px-5 py-3 text-muted-foreground">
                                {exp.payee || "—"}
                              </td>
                              <td className="px-5 py-3 text-muted-foreground">
                                {paidAccount ? `[${paidAccount.code}] ${paidAccount.name}` : "—"}
                              </td>
                              <td className="px-5 py-3 text-muted-foreground">
                                {store?.name || "—"}
                              </td>
                              <td className="px-5 py-3 text-muted-foreground truncate max-w-[200px]" title={exp.note ?? ""}>
                                {exp.note || "—"}
                              </td>
                              <td className="px-5 py-3 text-right font-mono font-semibold text-destructive">
                                {fmtBDT(exp.amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}
          </TabsContent>

          <TabsContent value="categories">
            {catLoading ? (
              <LoadingState rows={6} />
            ) : (
              <SectionCard title="Configured Categories">
                {categories.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No expense categories configured yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3 text-left">Category Name</th>
                          <th className="px-5 py-3 text-left">Default Account</th>
                          <th className="px-5 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {categories.map((cat) => {
                          const defAccount = accounts.find((a) => a.id === cat.default_expense_account_id);
                          return (
                            <tr key={cat.id} className="hover:bg-muted/30">
                              <td className="px-5 py-3 font-semibold">{cat.name}</td>
                              <td className="px-5 py-3 text-muted-foreground font-mono">
                                {defAccount ? `[${defAccount.code}] ${defAccount.name}` : "—"}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <StatusBadge status={cat.is_active ? "active" : "inactive"} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}
          </TabsContent>
        </Tabs>

        {/* Record Expense Drawer */}
        <EntityFormDrawer
          open={expenseOpen}
          onOpenChange={setExpenseOpen}
          title="Record Expense"
          onSubmit={handleCreateExpense}
          isPending={createExpenseMut.isPending}
          submitDisabled={!expenseForm.category_id || !expenseForm.amount || !expenseForm.paid_from_account_id}
        >
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={expenseForm.category_id}
                onChange={(e) => setExpenseForm((f) => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">Select Expense Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Paid From Account</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={expenseForm.paid_from_account_id}
                onChange={(e) => setExpenseForm((f) => ({ ...f, paid_from_account_id: e.target.value }))}
              >
                <option value="">Select Payment Account</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.code}] {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Expense Date</Label>
              <Input
                type="date"
                value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Store Branch (Optional)</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={expenseForm.store_id}
                onChange={(e) => setExpenseForm((f) => ({ ...f, store_id: e.target.value }))}
              >
                <option value="">Select Store Branch</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Payee (Optional)</Label>
              <Input
                placeholder="e.g. Electric Company"
                value={expenseForm.payee}
                onChange={(e) => setExpenseForm((f) => ({ ...f, payee: e.target.value }))}
              />
            </div>
            <div>
              <Label>Note / Description (Optional)</Label>
              <Input
                placeholder="Details of the expense"
                value={expenseForm.note}
                onChange={(e) => setExpenseForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>
        </EntityFormDrawer>

        {/* Add Category Drawer */}
        <EntityFormDrawer
          open={categoryOpen}
          onOpenChange={setCategoryOpen}
          title="Add Expense Category"
          onSubmit={handleCreateCategory}
          isPending={createCategoryMut.isPending}
          submitDisabled={!categoryForm.name || !categoryForm.default_expense_account_id}
        >
          <div className="space-y-4">
            <div>
              <Label>Category Name</Label>
              <Input
                placeholder="e.g. Rent, Office Supplies"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Default Ledger Account</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={categoryForm.default_expense_account_id}
                onChange={(e) => setCategoryForm((f) => ({ ...f, default_expense_account_id: e.target.value }))}
              >
                <option value="">Select Expense Account</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.code}] {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </EntityFormDrawer>
      </PageBody>
    </>
  );
}
