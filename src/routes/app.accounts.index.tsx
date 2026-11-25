import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RefreshCw, Eye, Edit, Calendar } from "lucide-react";
import {
  useChartOfAccounts,
  useCreateAccount,
  useUpdateAccount,
  useAccountLedger,
  type ApiAccount,
} from "@/hooks/use-api-config";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { useAuth } from "@/lib/auth-provider";
import { fmtBDT } from "@/lib/pos-data";
import { todayDateRange } from "@/lib/dates";
import { saveTextFile, timestampedFilename } from "@/lib/download";

export const Route = createFileRoute("/app/accounts/")({
  component: ChartOfAccountsPage,
});

function ChartOfAccountsPage() {
  const { can } = useAuth();
  const { data: accounts = [], isLoading, isError, refetch } = useChartOfAccounts();
  const createAccountMut = useCreateAccount();
  const updateAccountMut = useUpdateAccount();

  // Drawers state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Selected entities
  const [selectedAccount, setSelectedAccount] = useState<ApiAccount | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    code: "",
    name: "",
    account_type: "asset",
    account_subtype: "",
    parent_id: "",
  });

  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    account_subtype: "",
    parent_id: "",
    is_active: true,
  });

  const openEdit = (acc: ApiAccount) => {
    setEditForm({
      id: acc.id,
      name: acc.name,
      account_subtype: acc.account_subtype ?? "",
      parent_id: acc.parent_id ?? "",
      is_active: acc.is_active,
    });
    setSelectedAccount(acc);
    setEditOpen(true);
  };

  const handleCreate = async () => {
    await createAccountMut.mutateAsync({
      code: createForm.code,
      name: createForm.name,
      account_type: createForm.account_type,
      account_subtype: createForm.account_subtype || undefined,
      parent_id: createForm.parent_id || undefined,
    });
    setCreateOpen(false);
    setCreateForm({ code: "", name: "", account_type: "asset", account_subtype: "", parent_id: "" });
  };

  const handleEdit = async () => {
    await updateAccountMut.mutateAsync({
      id: editForm.id,
      name: editForm.name,
      account_subtype: editForm.account_subtype || undefined,
      parent_id: editForm.parent_id || undefined,
      is_active: editForm.is_active,
    });
    setEditOpen(false);
  };

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const accountTypes = ["asset", "liability", "equity", "income", "expense"];

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Chart of Accounts"
        subtitle="Manage your general ledger structure, track organization assets, liabilities, equity, revenues, and expenses"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <PermissionGate perm="accounts.manage_chart">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <PageBody>
        {isLoading ? (
          <LoadingState rows={8} />
        ) : (
          <Tabs defaultValue="asset" className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <TabsList className="bg-secondary p-1 h-auto flex flex-wrap gap-1">
                <TabsTrigger value="asset" className="capitalize">Assets</TabsTrigger>
                <TabsTrigger value="liability" className="capitalize">Liabilities</TabsTrigger>
                <TabsTrigger value="equity" className="capitalize">Equity</TabsTrigger>
                <TabsTrigger value="income" className="capitalize">Income</TabsTrigger>
                <TabsTrigger value="expense" className="capitalize">Expenses</TabsTrigger>
              </TabsList>
              <div className="w-full md:w-[260px]">
                <Input
                  type="text"
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {accountTypes.map((type) => {
              const filtered = accounts.filter((a) => {
                const matchesType = a.account_type === type;
                if (!matchesType) return false;
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                return (
                  a.name.toLowerCase().includes(q) ||
                  a.code.toLowerCase().includes(q) ||
                  (a.account_subtype && a.account_subtype.toLowerCase().includes(q))
                );
              });
              return (
                <TabsContent key={type} value={type} className="space-y-4">
                  <SectionCard title={`${type.toUpperCase()} accounts`}>
                    {filtered.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        No accounts created for this category yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="px-5 py-3 text-left">Code</th>
                              <th className="px-5 py-3 text-left">Name</th>
                              <th className="px-5 py-3 text-left">Subtype</th>
                              <th className="px-5 py-3 text-right">Balance</th>
                              <th className="px-5 py-3 text-center">System</th>
                              <th className="px-5 py-3 text-center">Status</th>
                              <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {filtered.map((acc) => (
                              <tr key={acc.id} className="hover:bg-muted/30">
                                <td className="px-5 py-3 font-mono font-medium">{acc.code}</td>
                                <td className="px-5 py-3">{acc.name}</td>
                                <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                                  {acc.account_subtype || "—"}
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-semibold">
                                  {typeof acc.balance === "number" ? fmtBDT(acc.balance) : "—"}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  {acc.is_system ? (
                                    <StatusBadge status="verified" />
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <StatusBadge status={acc.is_active ? "active" : "inactive"} />
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedAccount(acc);
                                        setLedgerOpen(true);
                                      }}
                                      title="View Ledger"
                                    >
                                      <Eye className="h-3.5 w-3.5 mr-1" /> Ledger
                                    </Button>
                                    <PermissionGate perm="accounts.manage_chart">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={acc.is_system}
                                        onClick={() => openEdit(acc)}
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                    </PermissionGate>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {/* Create Account Drawer */}
        <EntityFormDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Create New Account"
          onSubmit={handleCreate}
          isPending={createAccountMut.isPending}
          submitDisabled={!createForm.code || !createForm.name || !createForm.account_type}
        >
          <div className="space-y-4">
            <div>
              <Label>Account Code</Label>
              <Input
                placeholder="e.g. 1013"
                value={createForm.code}
                onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div>
              <Label>Account Name</Label>
              <Input
                placeholder="e.g. Petty Cash"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Account Type</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={createForm.account_type}
                onChange={(e) => setCreateForm((f) => ({ ...f, account_type: e.target.value }))}
              >
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <Label>Subtype (Optional)</Label>
              <Input
                placeholder="e.g. cash, bank, revenue, cogs"
                value={createForm.account_subtype}
                onChange={(e) => setCreateForm((f) => ({ ...f, account_subtype: e.target.value }))}
              />
            </div>
            <div>
              <Label>Parent Account (Optional)</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={createForm.parent_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, parent_id: e.target.value }))}
              >
                <option value="">No Parent Account</option>
                {accounts
                  .filter((a) => a.account_type === createForm.account_type)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </EntityFormDrawer>

        {/* Edit Account Drawer */}
        <EntityFormDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          title={`Edit Account: ${selectedAccount?.code}`}
          onSubmit={handleEdit}
          isPending={updateAccountMut.isPending}
          submitDisabled={!editForm.name}
        >
          <div className="space-y-4">
            <div>
              <Label>Account Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Subtype (Optional)</Label>
              <Input
                value={editForm.account_subtype}
                onChange={(e) => setEditForm((f) => ({ ...f, account_subtype: e.target.value }))}
              />
            </div>
            <div>
              <Label>Parent Account (Optional)</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editForm.parent_id}
                onChange={(e) => setEditForm((f) => ({ ...f, parent_id: e.target.value }))}
              >
                <option value="">No Parent Account</option>
                {accounts
                  .filter((a) => a.account_type === selectedAccount?.account_type && a.id !== selectedAccount?.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <Label htmlFor="edit-active">Is Active</Label>
            </div>
          </div>
        </EntityFormDrawer>

        {/* Account Ledger Drawer */}
        {selectedAccount && (
          <LedgerDrawer
            open={ledgerOpen}
            onOpenChange={setLedgerOpen}
            account={selectedAccount}
          />
        )}
      </PageBody>
    </>
  );
}

function LedgerDrawer({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ApiAccount;
}) {
  const initialDates = todayDateRange();
  const [fromDate, setFromDate] = useState(initialDates.from);
  const [toDate, setToDate] = useState(initialDates.to);
  const [appliedDates, setAppliedDates] = useState({ from: "", to: "" });

  const { data, isLoading } = useAccountLedger(
    account.id,
    appliedDates.from ? new Date(appliedDates.from).toISOString() : undefined,
    appliedDates.to ? new Date(`${appliedDates.to}T23:59:59`).toISOString() : undefined,
  );

  const applyFilters = () => {
    setAppliedDates({ from: fromDate, to: toDate });
  };

  const clearFilters = () => {
    setFromDate(initialDates.from);
    setToDate(initialDates.to);
    setAppliedDates({ from: "", to: "" });
  };

  const handleExportCSV = () => {
    if (!data?.entries || data.entries.length === 0) return;
    
    const headers = ["Date", "Entry No", "Memo", "Debit", "Credit", "Running Balance"];
    const csvRows = data.entries.map((entry) => [
      entry.entry_date ? new Date(entry.entry_date).toLocaleDateString() : "",
      `"${entry.entry_no}"`,
      `"${(entry.memo || "").replace(/"/g, '""')}"`,
      entry.debit,
      entry.credit,
      entry.running_balance,
    ]);

    const csvContent = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
    saveTextFile(csvContent, timestampedFilename(`ledger-${account.code}`, "csv"));
  };

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Ledger — [${account.code}] ${account.name}`}
      onSubmit={async () => onOpenChange(false)}
      submitLabel="Close"
    >
      <div className="space-y-4">
        {/* Date Filter Strip */}
        <div className="flex flex-wrap gap-2.5 items-end bg-secondary/30 p-3 rounded-lg border">
          <div className="w-[140px]">
            <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> From</Label>
            <Input type="date" className="h-8 text-xs mt-1" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="w-[140px]">
            <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> To</Label>
            <Input type="date" className="h-8 text-xs mt-1" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="flex gap-1.5 ml-auto">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={clearFilters}>Clear</Button>
            <Button size="sm" className="h-8 text-xs" onClick={applyFilters}>Apply</Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              disabled={!data?.entries || data.entries.length === 0}
              onClick={handleExportCSV}
            >
              Export
            </Button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState rows={4} />
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm font-semibold p-3 bg-secondary/50 rounded-md">
              <span>Ending Balance</span>
              <span className="font-mono text-primary text-base">
                {fmtBDT(data?.ending_balance ?? 0)}
              </span>
            </div>

            {(!data?.entries || data.entries.length === 0) ? (
              <div className="py-8 text-center text-sm text-muted-foreground bg-card border rounded-lg">
                No ledger entries found for the selected period.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Entry No</th>
                      <th className="px-3 py-2 text-left">Memo</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.entries.map((entry, idx) => (
                      <tr key={entry.entry_id + "-" + idx} className="hover:bg-muted/20">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {entry.entry_date ? new Date(entry.entry_date).toLocaleDateString() : ""}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium">{entry.entry_no}</td>
                        <td className="px-3 py-2 truncate max-w-[150px]" title={entry.memo}>{entry.memo}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-success">
                          {entry.debit > 0 ? fmtBDT(entry.debit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-destructive">
                          {entry.credit > 0 ? fmtBDT(entry.credit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {fmtBDT(entry.running_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </EntityFormDrawer>
  );
}
