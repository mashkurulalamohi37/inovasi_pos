import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RefreshCw,
  Coins,
  ArrowLeft,
  CheckCircle2,
  Printer,
  Download,
  User,
  Wallet,
  Users,
  TrendingUp,
  Trash2,
  Sparkles,
  X,
  Building2,
  Calendar,
  BadgeDollarSign,
  CreditCard,
  Tag,
  Check,
  Building,
} from "lucide-react";
import {
  useChartOfAccounts,
  useAccountLedger,
  useExpenses,
  useCreateExpense,
  useExpenseCategories,
  useCreateExpenseCategory,
  type ApiAccount,
} from "@/hooks/use-api-config";
import { useMiniHrEmployees, type MiniHrEmployee } from "@/hooks/use-mini-hr";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { toCsv } from "@/lib/csv";
import { saveTextFile } from "@/lib/download";
import { openPrintDocument, escapeHtml } from "@/lib/print-document";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/accounts/employee-salary")({
  component: EmployeeSalaryPage,
});

interface SalaryDisbursement {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  month: string; // e.g. "2026-08"
  amount: number;
  payment_method: string;
  paid_from_account_name?: string;
  status: "disbursed" | "pending";
  created_at: string;
  note?: string;
}

const LOCAL_STORAGE_KEY = "pulse_salary_disbursements_v3";

const DEFAULT_EMPLOYEES: MiniHrEmployee[] = [
  {
    id: "emp-1",
    employee_code: "EMP-ADMIN",
    first_name: "Pulse",
    last_name: "Admin",
    full_name: "Pulse Admin",
    employee_status: "active",
    has_login: true,
    is_active: true,
  },
  {
    id: "emp-2",
    employee_code: "EMP-CASHIER",
    first_name: "Front",
    last_name: "Cashier",
    full_name: "Front Cashier",
    employee_status: "active",
    has_login: true,
    is_active: true,
  },
  {
    id: "emp-3",
    employee_code: "EMP-MANAGER",
    first_name: "Store",
    last_name: "Manager",
    full_name: "Store Manager",
    employee_status: "active",
    has_login: true,
    is_active: true,
  },
  {
    id: "emp-4",
    employee_code: "EMP-INVENTORY",
    first_name: "Inventory",
    last_name: "Clerk",
    full_name: "Inventory Clerk",
    employee_status: "active",
    has_login: true,
    is_active: true,
  },
  {
    id: "emp-5",
    employee_code: "EMP-AUDITOR",
    first_name: "Compliance",
    last_name: "Auditor",
    full_name: "Compliance Auditor",
    employee_status: "active",
    has_login: true,
    is_active: true,
  },
];

const PRESET_AMOUNTS = [15000, 25000, 35000, 45000, 60000];
const QUICK_NOTE_TAGS = [
  "Regular Monthly Payroll",
  "Overtime Compensation",
  "Performance Bonus Included",
  "Advance Adjusted",
];

function getInitialEntries(): SalaryDisbursement[] {
  const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const todayStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return [
    {
      id: "sal-1",
      employee_id: "emp-1",
      employee_name: "Pulse Admin",
      employee_code: "EMP-ADMIN",
      month: currentMonthStr,
      amount: 45000,
      payment_method: "Cash",
      paid_from_account_name: "Cash on Hand",
      status: "disbursed",
      created_at: todayStr,
      note: "Monthly executive management salary",
    },
    {
      id: "sal-2",
      employee_id: "emp-2",
      employee_name: "Front Cashier",
      employee_code: "EMP-CASHIER",
      month: currentMonthStr,
      amount: 22000,
      payment_method: "Cash",
      paid_from_account_name: "Cash on Hand",
      status: "disbursed",
      created_at: todayStr,
      note: "Regular cashier monthly payroll",
    },
    {
      id: "sal-3",
      employee_id: "emp-3",
      employee_name: "Store Manager",
      employee_code: "EMP-MANAGER",
      month: currentMonthStr,
      amount: 35000,
      payment_method: "Bank Transfer",
      paid_from_account_name: "Operating Bank Account",
      status: "disbursed",
      created_at: todayStr,
      note: "Store operations compensation",
    },
  ];
}

function EmployeeSalaryPage() {
  const navigate = useNavigate();
  const useApi = shouldUseBackend();

  // Queries & Mutations
  const { data: accounts = [], refetch: refetchAccounts } = useChartOfAccounts();
  const { data: apiEmployees = [] } = useMiniHrEmployees(undefined, useApi);
  const { data: categories = [], refetch: refetchCategories } = useExpenseCategories();
  const { data: expenses = [], refetch: refetchExpenses } = useExpenses(100);
  const createExpenseMut = useCreateExpense();
  const createCategoryMut = useCreateExpenseCategory();

  // In backend mode, use ONLY real employees from the API. In demo/offline mode, fallback to default demo employees.
  const employees = useMemo(() => {
    if (useApi) return apiEmployees;
    return apiEmployees.length > 0 ? apiEmployees : DEFAULT_EMPLOYEES;
  }, [apiEmployees, useApi]);

  // Asset accounts list for payment source
  const paymentAccounts = useMemo(() => {
    const assetAccs = accounts.filter(
      (a) => a.account_type === "asset" && a.is_active
    );
    if (assetAccs.length > 0) return assetAccs;
    if (useApi) return [];
    return [
      { id: "acc-cash", name: "Cash on Hand", code: "1000-01", account_type: "asset", is_active: true } as ApiAccount,
      { id: "acc-bank", name: "Operating Bank Account", code: "1000-02", account_type: "asset", is_active: true } as ApiAccount,
    ];
  }, [accounts, useApi]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  useEffect(() => {
    if (paymentAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(paymentAccounts[0].id);
    }
  }, [paymentAccounts, selectedAccountId]);

  const activePaidAccount = useMemo(() => {
    return paymentAccounts.find((a) => a.id === selectedAccountId) || paymentAccounts[0];
  }, [paymentAccounts, selectedAccountId]);

  const ledgerQuery = useAccountLedger(activePaidAccount?.id || undefined);
  const rawCashBalance = ledgerQuery.data?.ending_balance;
  const cashBalance = rawCashBalance !== undefined ? rawCashBalance : (useApi ? 0 : 6791668.27);

  // Local storage state for instant persistence & demo mode
  const [localEntries, setLocalEntries] = useState<SalaryDisbursement[]>(() => {
    if (useApi) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (item) =>
                !["sal-1", "sal-2", "sal-3"].includes(item.id) &&
                !["emp-1", "emp-2", "emp-3", "emp-4", "emp-5"].includes(item.employee_id)
            );
          }
        }
      } catch {
        // ignore
      }
      return [];
    }
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return getInitialEntries();
  });

  // Clean out any cached demo disbursements if user is logged into backend
  useEffect(() => {
    if (useApi) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter(
              (item) =>
                !["sal-1", "sal-2", "sal-3"].includes(item.id) &&
                !["emp-1", "emp-2", "emp-3", "emp-4", "emp-5"].includes(item.employee_id)
            );
            if (cleaned.length !== parsed.length) {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }, [useApi]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localEntries));
    } catch {
      // ignore
    }
  }, [localEntries]);

  // Form states
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [empSearchQuery, setEmpSearchQuery] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [salaryMonthNum, setSalaryMonthNum] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [salaryYear, setSalaryYear] = useState(String(new Date().getFullYear()));
  const salaryMonth = `${salaryYear}-${salaryMonthNum}`;
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Bank Transfer" | "Mobile Money">("Cash");
  const [note, setNote] = useState("");
  const [disburseNow, setDisburseNow] = useState(true);

  // Suggestions container ref
  const empContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (empContainerRef.current && !empContainerRef.current.contains(e.target as Node)) {
        setEmpDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Filter employee suggestions
  const filteredEmployees = useMemo(() => {
    const term = empSearchQuery.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(term) ||
        e.employee_code.toLowerCase().includes(term)
    );
  }, [empSearchQuery, employees]);

  // Selected employee
  const selectedEmployee = useMemo(() => {
    return employees.find((e) => e.id === selectedEmpId);
  }, [selectedEmpId, employees]);

  const selectedInitials = useMemo(() => {
    if (!selectedEmployee) return "";
    return selectedEmployee.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [selectedEmployee]);

  // Month and year options
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthOptions = MONTH_NAMES.map((name, idx) => ({
    value: String(idx + 1).padStart(2, "0"),
    label: name,
  }));
  const yearOptions = Array.from({ length: 2035 - 2022 + 1 }, (_, i) => 2022 + i)
    .map((y) => ({ value: String(y), label: String(y) }));

  // Map API expenses to disbursements
  const apiSalaryExpenses = useMemo(() => {
    const catIds = new Set(
      categories
        .filter((c) => {
          const n = (c.name || "").toLowerCase();
          return (
            n.includes("salar") ||
            n.includes("wage") ||
            n.includes("payroll") ||
            n.includes("remuneration")
          );
        })
        .map((c) => c.id)
    );

    return expenses
      .filter((e) => {
        if (e.category_id && catIds.has(e.category_id)) return true;
        const noteStr = (e.note || "").toLowerCase();
        return (
          noteStr.includes("salary") ||
          noteStr.includes("payroll") ||
          noteStr.includes("wage")
        );
      })
      .map((e) => {
        let month = "";
        const noteStr = e.note || "";
        const match = noteStr.match(/Salary disbursement for (\d{4}-\d{2})/);
        if (match) {
          month = match[1];
        } else {
          const d = new Date(e.expense_date);
          month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }

        const dateObj = new Date(e.expense_date);
        const formattedDate = dateObj.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        return {
          id: e.id,
          employee_id: e.id,
          employee_name: e.payee || "Employee",
          employee_code: "EMP",
          month: month,
          amount: e.amount,
          payment_method: "Cash",
          paid_from_account_name: "Cash Account",
          status: "disbursed" as const,
          created_at: formattedDate,
          note: e.note || "",
        };
      });
  }, [expenses, categories]);

  // Combine API and Local disbursements
  const allDisbursements = useMemo(() => {
    const map = new Map<string, SalaryDisbursement>();
    if (useApi) {
      // In API mode, only include real session disbursements (omit demo seed entries)
      localEntries
        .filter(
          (item) =>
            !["sal-1", "sal-2", "sal-3"].includes(item.id) &&
            !["emp-1", "emp-2", "emp-3", "emp-4", "emp-5"].includes(item.employee_id)
        )
        .forEach((item) => map.set(item.id, item));
    } else {
      localEntries.forEach((item) => map.set(item.id, item));
    }
    apiSalaryExpenses.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  }, [apiSalaryExpenses, localEntries, useApi]);

  // Filter Register list by selected month
  const [filterMonthNum, setFilterMonthNum] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const filterMonth = `${filterYear}-${filterMonthNum}`;

  const filteredRegister = useMemo(() => {
    return allDisbursements.filter((d) => d.month === filterMonth);
  }, [allDisbursements, filterMonth]);

  // KPI Calculations
  const totalDisbursedMonth = useMemo(() => {
    return filteredRegister.reduce((acc, curr) => acc + curr.amount, 0);
  }, [filteredRegister]);

  const avgSalaryMonth = useMemo(() => {
    return filteredRegister.length > 0 ? Math.round(totalDisbursedMonth / filteredRegister.length) : 0;
  }, [totalDisbursedMonth, filteredRegister]);

  const appendNoteTag = (tag: string) => {
    if (note.includes(tag)) return;
    setNote((prev) => (prev ? `${prev}, ${tag}` : tag));
  };

  const handleSaveSalaryEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !selectedEmployee) {
      toast.error("Please select an employee");
      return;
    }
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const employeeName = selectedEmployee.full_name;
    const employeeCode = selectedEmployee.employee_code;
    const newId = `sal-${Date.now()}`;
    const todayFormatted = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const newRecord: SalaryDisbursement = {
      id: newId,
      employee_id: selectedEmpId,
      employee_name: employeeName,
      employee_code: employeeCode,
      month: salaryMonth,
      amount: parsedAmount,
      payment_method: paymentMethod,
      paid_from_account_name: activePaidAccount?.name || "Cash Account",
      status: "disbursed",
      created_at: todayFormatted,
      note: note.trim() || undefined,
    };

    // 1. Post real Expense disbursement to database if connected
    if (disburseNow && activePaidAccount) {
      try {
        let targetCategory = categories.find((c) => {
          const n = (c.name || "").toLowerCase();
          return (
            n.includes("salar") ||
            n.includes("wage") ||
            n.includes("payroll")
          );
        });
        let categoryId = targetCategory?.id;

        if (!categoryId) {
          const salaryExpenseAccount = accounts.find(
            (a) => a.account_type === "expense" && a.name.toLowerCase().includes("salary")
          );
          const fallbackExpenseAccount = accounts.find((a) => a.account_type === "expense");
          const defaultAccId = salaryExpenseAccount?.id || fallbackExpenseAccount?.id || "";

          if (defaultAccId) {
            const newCat = await createCategoryMut.mutateAsync({
              name: "Salaries and Wages",
              default_expense_account_id: defaultAccId,
            });
            categoryId = newCat.id;
            refetchCategories();
          }
        }

        if (categoryId) {
          await createExpenseMut.mutateAsync({
            category_id: categoryId,
            amount: parsedAmount,
            paid_from_account_id: activePaidAccount.id,
            expense_date: new Date().toISOString(),
            payee: employeeName,
            note: `Salary disbursement for ${salaryMonth} via ${paymentMethod}. Notes: ${note}`,
          });
          refetchExpenses();
        }
      } catch (err) {
        console.error("API post optional warning:", err);
      }
    }

    // 2. Add to local state for instant persistence
    setLocalEntries((prev) => [newRecord, ...prev]);

    toast.success(`Salary entry saved: ${fmtBDT(parsedAmount)} for ${employeeName}`);

    // Reset Form
    setSelectedEmpId("");
    setEmpSearchQuery("");
    setAmount("");
    setNote("");

    // Refetch ending balances
    ledgerQuery.refetch();
    refetchAccounts();
  };

  const handleDeleteEntry = (id: string, empName: string) => {
    setLocalEntries((prev) => prev.filter((item) => item.id !== id));
    toast.success(`Salary entry for ${empName} removed`);
  };

  const forceRefetchAll = () => {
    ledgerQuery.refetch();
    refetchAccounts();
    refetchCategories();
    refetchExpenses();
    toast.info("Refreshed salary register & balances");
  };

  const handleExportCsv = () => {
    if (filteredRegister.length === 0) {
      toast.error("No entries to export for this month");
      return;
    }
    const headers = [
      "Employee Name",
      "Employee Code",
      "Salary Month",
      "Amount (BDT)",
      "Payment Method",
      "Paid From Account",
      "Status",
      "Disbursed Date",
      "Notes",
    ];
    const csvData = filteredRegister.map((r) => ({
      "Employee Name": r.employee_name,
      "Employee Code": r.employee_code || "",
      "Salary Month": r.month,
      "Amount (BDT)": r.amount,
      "Payment Method": r.payment_method || "Cash",
      "Paid From Account": r.paid_from_account_name || "Cash Account",
      "Status": r.status,
      "Disbursed Date": r.created_at,
      "Notes": r.note || "",
    }));

    const csv = toCsv(headers, csvData);
    saveTextFile(csv, `salary_register_${filterMonth}.csv`);
    toast.success("Salary register exported to CSV");
  };

  const handlePrintRegister = () => {
    if (filteredRegister.length === 0) {
      toast.error("No entries to print for this month");
      return;
    }

    let bodyHtml = `<table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Employee Code</th>
          <th>Month</th>
          <th>Payment Method</th>
          <th class="num">Amount (BDT)</th>
          <th>Status</th>
          <th>Disbursed Date</th>
        </tr>
      </thead>
      <tbody>`;

    filteredRegister.forEach((r) => {
      bodyHtml += `<tr>
        <td><b>${escapeHtml(r.employee_name)}</b></td>
        <td>${escapeHtml(r.employee_code || "—")}</td>
        <td>${escapeHtml(r.month)}</td>
        <td>${escapeHtml(r.payment_method)} (${escapeHtml(r.paid_from_account_name || "Cash")})</td>
        <td class="num"><b>${fmtBDT(r.amount)}</b></td>
        <td><span style="color:#059669;font-weight:600;text-transform:uppercase;font-size:10px;">${escapeHtml(r.status)}</span></td>
        <td>${escapeHtml(r.created_at)}</td>
      </tr>`;
    });

    bodyHtml += `<tr class="subtotal">
      <td colspan="4"><b>Total Disbursed</b></td>
      <td class="num"><b>${fmtBDT(totalDisbursedMonth)}</b></td>
      <td colspan="2"></td>
    </tr></tbody></table>`;

    const ok = openPrintDocument({
      title: "Employee Salary Register",
      subtitle: `Monthly salary disbursement schedule for ${filterMonth}`,
      orientation: "landscape",
      meta: [
        { label: "Month", value: filterMonth },
        { label: "Total Entries", value: String(filteredRegister.length) },
        { label: "Printed", value: new Date().toLocaleString() },
      ],
      bodyHtml,
    });

    if (!ok) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
    }
  };

  return (
    <>
      <PageHeader
        title="Employee Salary"
        subtitle="Monthly salary entry and disbursement from cash account"
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-medium border-border/80 shadow-2xs hover:bg-accent"
              onClick={() => navigate({ to: "/app/accounts" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent px-4 py-1.5 text-right shadow-2xs backdrop-blur-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {activePaidAccount?.name || "Cash Account"} Balance
              </div>
              <div className="font-display text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                {fmtBDT(cashBalance)}
              </div>
            </div>
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Premium Enhanced Form */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:shadow-md">
              {/* Form Card Header Banner */}
              <div className="flex items-start justify-between border-b border-border/60 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                    <BadgeDollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">
                      New Salary Entry
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Record monthly salary &amp; disburse from accounts
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 border border-emerald-500/20">
                  <Sparkles className="h-3 w-3" /> Payroll Form
                </span>
              </div>

              <form onSubmit={handleSaveSalaryEntry} className="space-y-4">
                {/* Employee Autocomplete Dropdown / Empty Alert */}
                {employees.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <Users className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                      <span>No Registered Employees Found</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {useApi
                        ? "There are no active employees registered for this store. Add staff under HR > Employees to record and disburse salaries."
                        : "No employees available."}
                    </p>
                    {useApi && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs font-semibold bg-background hover:bg-accent border-amber-500/30 text-foreground"
                        onClick={() => navigate({ to: "/app/hr/employees" })}
                      >
                        <Users className="h-3.5 w-3.5" /> Go to HR &gt; Employees
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="relative" ref={empContainerRef}>
                    <Label htmlFor="salary-employee" className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Employee *</span>
                      {selectedEmployee && (
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          Employee Selected
                        </span>
                      )}
                    </Label>
                    <div className="relative mt-1.5">
                      <Input
                        id="salary-employee"
                        value={
                          empDropdownOpen
                            ? empSearchQuery
                            : selectedEmployee
                            ? `${selectedEmployee.full_name} (${selectedEmployee.employee_code})`
                            : ""
                        }
                        onChange={(e) => {
                          setEmpSearchQuery(e.target.value);
                          setEmpDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setEmpSearchQuery("");
                          setEmpDropdownOpen(true);
                        }}
                        placeholder="Search employee name or code..."
                        className="h-10 w-full bg-background pr-9 text-sm font-medium border-border/80 focus:border-emerald-500 focus:ring-emerald-500/20"
                      />
                      {selectedEmpId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmpId("");
                            setEmpSearchQuery("");
                          }}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="pointer-events-none absolute right-2.5 top-2.5 text-muted-foreground">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    {/* Selected Employee Preview Card */}
                    {selectedEmployee && !empDropdownOpen && (
                      <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 transition-all animate-in fade-in-50">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-xs">
                          {selectedInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-foreground truncate">
                            {selectedEmployee.full_name}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                            <span className="bg-emerald-500/10 text-emerald-700 px-1.5 py-0.2 rounded-xs font-mono font-medium">
                              {selectedEmployee.employee_code}
                            </span>
                            <span>• Status: Active</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Employee Dropdown List */}
                    {empDropdownOpen && (
                      <div className="absolute z-50 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-xl outline-none animate-in fade-in-0 zoom-in-95">
                        {filteredEmployees.map((emp) => {
                          const initials = emp.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase();
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              className={cn(
                                "relative flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-xs outline-none hover:bg-accent hover:text-accent-foreground text-left transition-colors",
                                selectedEmpId === emp.id && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold"
                              )}
                              onClick={() => {
                                setSelectedEmpId(emp.id);
                                setEmpDropdownOpen(false);
                              }}
                            >
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary shrink-0">
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">{emp.full_name}</div>
                                <div className="text-[10px] text-muted-foreground">{emp.employee_code}</div>
                              </div>
                              {selectedEmpId === emp.id && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 ml-auto" />
                              )}
                            </button>
                          );
                        })}
                        {filteredEmployees.length === 0 && (
                          <div className="px-3 py-3 text-xs text-muted-foreground text-center italic">
                            No matching employees found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Salary Month and Amount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Salary Month *</Label>
                    <div className="mt-1.5 flex gap-1.5">
                      <select
                        id="salary-month"
                        value={salaryMonthNum}
                        onChange={(e) => setSalaryMonthNum(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-semibold shadow-2xs transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {monthOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <select
                        id="salary-year"
                        value={salaryYear}
                        onChange={(e) => setSalaryYear(e.target.value)}
                        className="flex h-10 w-[82px] shrink-0 rounded-lg border border-border/80 bg-background px-2 py-1 text-xs font-semibold shadow-2xs transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {yearOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="salary-amount" className="text-xs font-semibold text-foreground">
                      Amount (BDT) *
                    </Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-2.5 top-2 flex h-6 items-center justify-center rounded-md bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">
                        ৳ BDT
                      </span>
                      <Input
                        id="salary-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="e.g. 25000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="h-10 w-full bg-background pl-16 text-sm font-bold tracking-wide border-border/80 focus:border-emerald-500 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Amount Preset Pills */}
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" /> Quick Presets:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAmount(String(amt))}
                        className={cn(
                          "rounded-lg border border-border/70 bg-secondary/30 px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:text-emerald-600 transition-all cursor-pointer shadow-2xs",
                          amount === String(amt) && "bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs hover:bg-emerald-700 hover:text-white"
                        )}
                      >
                        ৳{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Method & Source Account Selection */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Payment Method</Label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="mt-1.5 flex h-9 w-full rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-medium shadow-2xs transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Mobile Money">Mobile Money (bKash/Nagad)</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-foreground">Paid From Account</Label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="mt-1.5 flex h-9 w-full rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-medium shadow-2xs transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {paymentAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.code || "Asset"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Notes & Quick Tags */}
                <div>
                  <Label htmlFor="salary-note" className="text-xs font-semibold text-foreground">
                    Notes
                  </Label>
                  <Textarea
                    id="salary-note"
                    placeholder="Optional details or salary period remarks"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1.5 w-full bg-background text-xs resize-none border-border/80 focus:border-emerald-500 focus:ring-emerald-500/20"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {QUICK_NOTE_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => appendNoteTag(tag)}
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Tag className="h-2.5 w-2.5" /> + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Disburse Checkbox Card */}
                <label className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 cursor-pointer hover:bg-emerald-500/10 transition-colors shadow-2xs">
                  <input
                    type="checkbox"
                    checked={disburseNow}
                    onChange={(e) => setDisburseNow(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                  />
                  <div className="text-xs text-left">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 block">Disburse now</span>
                    <span className="text-muted-foreground text-[10px]">
                      Create expense &amp; deduct {amount ? fmtBDT(Number(amount)) : "amount"} from {activePaidAccount?.name || "Cash Account"} immediately
                    </span>
                  </div>
                </label>

                {/* Gradient Primary Submit Button */}
                <Button
                  type="submit"
                  className="w-full h-11 gap-2 font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
                  disabled={createExpenseMut.isPending || employees.length === 0 || !selectedEmpId}
                >
                  <CheckCircle2 className="h-4.5 w-4.5" /> Save &amp; Disburse Salary Entry
                </Button>
              </form>
            </div>
          </div>

          {/* Right Column: Register & KPI Dashboard */}
          <div className="lg:col-span-7 space-y-4">
            {/* KPI Stat Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs hover:shadow-xs transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Paid
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <Wallet className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-1.5 font-display text-xl font-extrabold text-foreground">
                  {fmtBDT(totalDisbursedMonth)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">{filterMonth} Payroll</div>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs hover:shadow-xs transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Employees Paid
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-1.5 font-display text-xl font-extrabold text-foreground">
                  {filteredRegister.length}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">Disbursements</div>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs hover:shadow-xs transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Average Salary
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-1.5 font-display text-xl font-extrabold text-foreground">
                  {fmtBDT(avgSalaryMonth)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">Per Employee</div>
              </div>
            </div>

            {/* Main Register Card */}
            <SectionCard
              title="Salary Register"
              description={`Disbursement log for ${filterMonth}`}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <select
                      value={filterMonthNum}
                      onChange={(e) => setFilterMonthNum(e.target.value)}
                      className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {monthOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      className="h-8 w-[72px] rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {yearOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs font-semibold shadow-2xs hover:bg-accent"
                    onClick={handleExportCsv}
                  >
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs font-semibold shadow-2xs hover:bg-accent"
                    onClick={handlePrintRegister}
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={forceRefetchAll}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              }
            >
              <div className="mt-4 overflow-hidden rounded-xl border border-border/80 bg-background shadow-2xs">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/60 text-[10px] uppercase font-bold text-muted-foreground border-b border-border/80">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-3 py-3">Month</th>
                      <th className="px-3 py-3">Method</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-3 py-3 text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredRegister.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            <span>{d.employee_name}</span>
                            {d.employee_code && (
                              <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.2 rounded-xs font-medium">
                                {d.employee_code}
                              </span>
                            )}
                          </div>
                          {d.note && (
                            <div className="text-[10px] text-muted-foreground font-normal italic mt-0.5">
                              {d.note}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground font-semibold">{d.month}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-secondary/50 px-2 py-0.5 rounded-md">
                            <CreditCard className="h-3 w-3 text-muted-foreground" />
                            {d.payment_method || "Cash"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold tabular-nums text-foreground">
                          {fmtBDT(d.amount)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              {d.status}
                            </span>
                            <span className="text-[9px] text-muted-foreground mt-0.5 whitespace-nowrap font-medium">
                              {d.created_at}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(d.id, d.employee_name)}
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 cursor-pointer"
                            title="Remove entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredRegister.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Coins className="h-9 w-9 text-muted-foreground/40" />
                            <div className="font-bold text-sm text-foreground">No salary disbursements recorded</div>
                            <div className="text-xs text-muted-foreground max-w-sm">
                              {employees.length === 0
                                ? "Register employees in HR > Employees to record and disburse monthly salary."
                                : `Select an employee on the left to record and disburse monthly salary for ${filterMonth}.`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </div>
      </PageBody>
    </>
  );
}
