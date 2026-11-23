"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getUsers,
  getCustomersForMapping,
  createUser,
  deleteUser,
  updateUserRole,
  getReportingLinesRaw,
  createReportingLine,
  deleteReportingLine,
  getDealerMappingsRaw,
  createDealerMapping,
  deleteDealerMapping,
} from "@/lib/actions/users";
import type { Customer } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Plus, Search, ShieldAlert, Trash2, UserCheck, X } from "lucide-react";
import { ROLE_LABELS, SEED_ADMIN_PHONE, type UserRole } from "@/lib/user-roles";

type UserView = {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  customerId: number | null;
  customerName: string | null;
  createdAt: Date;
};

type ReportingLineView = {
  id: number;
  managerId: number;
  managerName: string;
  officerId: number;
  officerName: string;
};

type DealerMappingView = {
  id: number;
  officerId: number;
  officerName: string;
  dealerId: number;
  dealerName: string;
};

export default function UserManagementPage() {
  const [activeTab, setActiveTab] = useState<"users" | "reporting" | "dealers">("users");
  const [addOpen, setAddOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");
  const [lineQuery, setLineQuery] = useState("");
  const [mapQuery, setMapQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Data state
  const [usersList, setUsersList] = useState<UserView[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [reportingLines, setReportingLines] = useState<ReportingLineView[]>([]);
  const [dealerMappings, setDealerMappings] = useState<DealerMappingView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("sales_officer");
  const [userCustomerId, setUserCustomerId] = useState("");
  const [dealerCustomerPick, setDealerCustomerPick] = useState<
    Record<number, string>
  >({});

  const [rlManagerId, setRlManagerId] = useState("");
  const [rlOfficerId, setRlOfficerId] = useState("");

  const [dmOfficerId, setDmOfficerId] = useState("");
  const [dmDealerId, setDmDealerId] = useState("");

  // Fetch all data
  const fetchData = async () => {
    try {
      const [u, c, rl, dm] = await Promise.all([
        getUsers(),
        getCustomersForMapping(),
        getReportingLinesRaw(),
        getDealerMappingsRaw(),
      ]);
      setUsersList(u as UserView[]);
      setCustomersList(c);
      setReportingLines(rl);
      setDealerMappings(dm);
    } catch (e) {
      console.error(e);
      setError("Failed to fetch user management data.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!userName.trim() || !userPhone.trim()) {
      setError("Please fill out all required fields.");
      return;
    }

    startTransition(async () => {
      try {
        await createUser({
          name: userName,
          phone: userPhone,
          role: userRole,
          customerId: userRole === "dealer" && userCustomerId ? parseInt(userCustomerId, 10) : null,
        });
        setSuccess("User created successfully!");
        setAddOpen(false);
        setUserName("");
        setUserPhone("");
        setUserCustomerId("");
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create user");
      }
    });
  };

  const handleRoleChange = (user: UserView, nextRole: UserRole) => {
    setError("");
    setSuccess("");
    if (nextRole === user.role) return;
    const customerId =
      nextRole === "dealer"
        ? parseInt(dealerCustomerPick[user.id] || String(user.customerId ?? ""), 10)
        : null;
    if (nextRole === "dealer" && !Number.isFinite(customerId)) {
      setDealerCustomerPick((prev) => ({
        ...prev,
        [user.id]: prev[user.id] ?? "",
      }));
      setError(
        `Select a customer for ${user.name} in Linked Customer, then set the role to Dealer.`
      );
      return;
    }
    if (
      !confirm(
        `Change ${user.name} from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[nextRole]}? They must log out and log in again for the new access to apply.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await updateUserRole({
          userId: user.id,
          role: nextRole,
          customerId: Number.isFinite(customerId) ? customerId : null,
        });
        setSuccess(
          `${user.name} is now ${ROLE_LABELS[nextRole]}. They must log in again.`
        );
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to change role");
      }
    });
  };

  const handleDealerCustomerChange = (user: UserView, customerId: string) => {
    setDealerCustomerPick((prev) => ({ ...prev, [user.id]: customerId }));
    if (user.role !== "dealer" || !customerId) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateUserRole({
          userId: user.id,
          role: "dealer",
          customerId: parseInt(customerId, 10),
        });
        setSuccess(`Updated customer mapping for ${user.name}.`);
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to map customer");
      }
    });
  };

  const handleDeleteUser = (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await deleteUser(id);
        setSuccess("User deleted successfully!");
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete user");
      }
    });
  };

  const handleCreateReportingLine = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!rlManagerId || !rlOfficerId) {
      setError("Please select both a manager and an officer.");
      return;
    }

    startTransition(async () => {
      try {
        await createReportingLine(parseInt(rlManagerId, 10), parseInt(rlOfficerId, 10));
        setSuccess("Reporting line created successfully!");
        setRlOfficerId("");
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to map reporting line");
      }
    });
  };

  const handleDeleteReportingLine = (id: number) => {
    if (!confirm("Are you sure you want to delete this reporting line?")) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await deleteReportingLine(id);
        setSuccess("Reporting line deleted successfully!");
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete mapping");
      }
    });
  };

  const handleCreateDealerMapping = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!dmOfficerId || !dmDealerId) {
      setError("Please select both an officer and a dealer.");
      return;
    }

    startTransition(async () => {
      try {
        await createDealerMapping(parseInt(dmOfficerId, 10), parseInt(dmDealerId, 10));
        setSuccess("Dealer mapping created successfully!");
        setDmDealerId("");
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create dealer mapping");
      }
    });
  };

  const handleDeleteDealerMapping = (id: number) => {
    if (!confirm("Are you sure you want to delete this dealer mapping?")) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await deleteDealerMapping(id);
        setSuccess("Dealer mapping deleted successfully!");
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete mapping");
      }
    });
  };

  // Filter roles
  const regionalManagers = usersList.filter((u) => u.role === "regional_manager");
  const salesOfficers = usersList.filter((u) => u.role === "sales_officer");
  const dealers = usersList.filter((u) => u.role === "dealer");

  // Search and role filter (client-side; the page already loads every user).
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return usersList.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        (digits.length > 0 && u.phone.replace(/\D/g, "").includes(digits))
      );
    });
  }, [usersList, userQuery, roleFilter]);

  const filteredLines = useMemo(() => {
    const q = lineQuery.trim().toLowerCase();
    if (!q) return reportingLines;
    return reportingLines.filter((l) => `${l.managerName} ${l.officerName}`.toLowerCase().includes(q));
  }, [reportingLines, lineQuery]);

  const filteredMappings = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    if (!q) return dealerMappings;
    return dealerMappings.filter((m) => `${m.officerName} ${m.dealerName}`.toLowerCase().includes(q));
  }, [dealerMappings, mapQuery]);

  const userPages = usePaging(filteredUsers, `${userQuery}|${roleFilter}`);
  const linePages = usePaging(filteredLines, lineQuery);
  const mapPages = usePaging(filteredMappings, mapQuery);

  const tabs = [
    { key: "users" as const, label: "Users", count: usersList.length },
    { key: "reporting" as const, label: "Reporting lines", count: reportingLines.length },
    { key: "dealers" as const, label: "Dealer mappings", count: dealerMappings.length },
  ];

  return (
    <div className="min-h-full bg-[#F3F5F2]">
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#1C2B22]">Users and access</h1>
            <p className="mt-1 text-sm text-slate-500">
              Control who can sign in, what each role can see, and who reports to whom.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              setAddOpen(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#3F7A52] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#34684A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F7A52]/40"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-slate-200/80 bg-white sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_CARDS.map((card, i) => (
            <div
              key={card.label}
              className={`p-5 ${i > 0 ? "border-t border-slate-200/80 sm:border-t-0 lg:border-l" : ""} ${i === 2 ? "sm:border-t lg:border-t-0" : ""} ${i === 3 ? "sm:border-l sm:border-t lg:border-t-0" : ""} ${i === 1 ? "sm:border-l" : ""}`}
            >
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${card.pill}`}>{card.label}</span>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{card.text}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <UserCheck className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        <div role="tablist" aria-label="User management" className="flex gap-6 overflow-x-auto border-b border-slate-200">
          {tabs.map((tab) => {
            const on = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActiveTab(tab.key)}
                className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 text-sm transition-colors ${
                  on ? "border-[#1C2B22] font-semibold text-[#1C2B22]" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? "bg-[#E3F0E6] text-[#2F6B45]" : "bg-slate-100 text-slate-500"}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {activeTab === "users" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:p-5">
              <SearchBox value={userQuery} onChange={setUserQuery} placeholder="Search by name or phone" />
              <select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "" | UserRole)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F7A52]/30 sm:w-44"
              >
                <option value="">All roles</option>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-[#F7F8F6] text-left text-xs font-medium text-slate-500">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Linked customer</th>
                    <th className="w-16 px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {!loaded ? (
                    <LoadingRow colSpan={5} />
                  ) : userPages.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                        {usersList.length === 0 ? "No registered users found." : "No users match this search."}
                      </td>
                    </tr>
                  ) : (
                    userPages.rows.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                              {initials(user.name)}
                            </span>
                            <span className="font-semibold text-[#1C2B22]">{user.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{user.phone}</td>
                        <td className="px-5 py-3">
                          {user.phone === SEED_ADMIN_PHONE ? (
                            <span className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium ${roleTint(user.role)}`}>
                              {ROLE_LABELS[user.role]}
                            </span>
                          ) : (
                            <select
                              aria-label={`Role for ${user.name}`}
                              value={user.role}
                              disabled={isPending}
                              onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                              className={`h-9 w-44 cursor-pointer rounded-full border-0 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F7A52]/30 ${roleTint(user.role)}`}
                            >
                              {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {user.phone === SEED_ADMIN_PHONE ? (
                            <span className="text-sm text-slate-500">Not linked</span>
                          ) : user.role === "dealer" || dealerCustomerPick[user.id] !== undefined ? (
                            <select
                              aria-label={`Customer for ${user.name}`}
                              value={dealerCustomerPick[user.id] ?? (user.customerId ? String(user.customerId) : "")}
                              disabled={isPending}
                              onChange={(e) => handleDealerCustomerChange(user, e.target.value)}
                              className="h-8 max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F7A52]/30"
                            >
                              <option value="">-- Customer --</option>
                              {customersList.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-slate-500">Not linked</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {user.phone !== SEED_ADMIN_PHONE && (
                            <DeleteButton label={`Delete ${user.name}`} disabled={isPending} onClick={() => handleDeleteUser(user.id)} />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pager paging={userPages} noun="users" />
          </div>
        )}

        {activeTab === "reporting" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <form onSubmit={handleCreateReportingLine} className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:p-5">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="rmSelect" className="text-xs text-slate-500">Regional manager</Label>
                <select id="rmSelect" value={rlManagerId} onChange={(e) => setRlManagerId(e.target.value)} className={FIELD} required>
                  <option value="">-- Choose RM --</option>
                  {regionalManagers.map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name} ({rm.phone})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="soSelect" className="text-xs text-slate-500">Sales officer</Label>
                <select id="soSelect" value={rlOfficerId} onChange={(e) => setRlOfficerId(e.target.value)} className={FIELD} required>
                  <option value="">-- Choose Sales Officer --</option>
                  {salesOfficers.map((so) => (
                    <option key={so.id} value={so.id}>
                      {so.name} ({so.phone})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={isPending} className={PRIMARY}>
                <Plus className="h-4 w-4" />
                {isPending ? "Mapping..." : "Add reporting line"}
              </button>
            </form>
            <div className="p-4 sm:px-5">
              <SearchBox value={lineQuery} onChange={setLineQuery} placeholder="Search by manager or officer" />
            </div>
            <PairTable
              left="Regional manager"
              right="Sales officer"
              rows={linePages.rows.map((l) => ({ id: l.id, left: l.managerName, right: l.officerName }))}
              empty={reportingLines.length === 0 ? "No reporting mappings configured." : "No reporting lines match this search."}
              loading={!loaded}
              disabled={isPending}
              onDelete={handleDeleteReportingLine}
            />
            <Pager paging={linePages} noun="reporting lines" />
          </div>
        )}

        {activeTab === "dealers" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <form onSubmit={handleCreateDealerMapping} className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:p-5">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="dmSoSelect" className="text-xs text-slate-500">Sales officer</Label>
                <select id="dmSoSelect" value={dmOfficerId} onChange={(e) => setDmOfficerId(e.target.value)} className={FIELD} required>
                  <option value="">-- Choose SO --</option>
                  {salesOfficers.map((so) => (
                    <option key={so.id} value={so.id}>
                      {so.name} ({so.phone})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="dmDealerSelect" className="text-xs text-slate-500">Dealer user account</Label>
                <select id="dmDealerSelect" value={dmDealerId} onChange={(e) => setDmDealerId(e.target.value)} className={FIELD} required>
                  <option value="">-- Choose Dealer --</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.customerName ? `(Maps to: ${d.customerName})` : `(${d.phone})`}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={isPending} className={PRIMARY}>
                <Plus className="h-4 w-4" />
                {isPending ? "Mapping..." : "Add dealer mapping"}
              </button>
            </form>
            <div className="p-4 sm:px-5">
              <SearchBox value={mapQuery} onChange={setMapQuery} placeholder="Search by officer or dealer" />
            </div>
            <PairTable
              left="Sales officer"
              right="Dealer"
              rows={mapPages.rows.map((m) => ({ id: m.id, left: m.officerName, right: m.dealerName }))}
              empty={dealerMappings.length === 0 ? "No dealer mappings configured." : "No dealer mappings match this search."}
              loading={!loaded}
              disabled={isPending}
              onDelete={handleDeleteDealerMapping}
            />
            <Pager paging={mapPages} noun="dealer mappings" />
          </div>
        )}
      </div>

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C2B22]/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isPending) setAddOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="add-user-title" className="text-lg font-semibold text-[#1C2B22]">Add user</h2>
              <button type="button" aria-label="Close" onClick={() => setAddOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name *</Label>
                <Input id="name" placeholder="Enter name" value={userName} onChange={(e) => setUserName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone / Mobile Number *</Label>
                <Input
                  id="phone"
                  placeholder="10-digit number"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Security Role</Label>
                <select
                  id="role"
                  value={userRole}
                  onChange={(e) => {
                    setUserRole(e.target.value as UserRole);
                    setUserCustomerId("");
                  }}
                  className={FIELD}
                >
                  <option value="admin">Admin / Operator</option>
                  <option value="regional_manager">Regional Manager</option>
                  <option value="sales_officer">Sales Officer</option>
                  <option value="dealer">Dealer</option>
                  <option value="cashier">Cashier</option>
                  <option value="store_manager">Store Manager</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              {userRole === "dealer" && (
                <div className="space-y-1.5 border-t pt-3">
                  <Label htmlFor="customerSelect">Map to Customer Record *</Label>
                  <select id="customerSelect" value={userCustomerId} onChange={(e) => setUserCustomerId(e.target.value)} className={FIELD} required>
                    <option value="">-- Choose Customer --</option>
                    {customersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500">Linking maps billing records to this dealer user profile.</p>
                </div>
              )}
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <button type="submit" disabled={isPending} className={PRIMARY}>
                  {isPending ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const FIELD =
  "flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F7A52]/30";
const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#3F7A52] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#34684A] disabled:opacity-60";

const ROLE_CARDS = [
  { label: "Admin", pill: "bg-[#E3F0E6] text-[#2F6B45]", text: "Full access, including users, settings, and cancelling or editing invoices." },
  { label: "Regional manager", pill: "bg-[#ECE8FA] text-[#5B4A9E]", text: "Sales, purchases, products, and customers under their officers." },
  { label: "Sales officer", pill: "bg-[#E4EEFB] text-[#2F5E9E]", text: "Billing, customers, products, and receipts for mapped dealers. No purchases or suppliers." },
  { label: "Dealer", pill: "bg-[#FBEBD3] text-[#8A5A14]", text: "POS, their own invoices, and outstanding only." },
];

function roleTint(role: UserRole) {
  switch (role) {
    case "admin":
      return "bg-[#E3F0E6] text-[#2F6B45]";
    case "regional_manager":
      return "bg-[#ECE8FA] text-[#5B4A9E]";
    case "dealer":
      return "bg-[#FBEBD3] text-[#8A5A14]";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

function initials(name: string) {
  const parts = name.replace(/[^A-Za-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PAGE_SIZES = [10, 25, 50] as const;

type Paging<T> = {
  rows: T[];
  total: number;
  page: number;
  pages: number;
  size: number;
  from: number;
  to: number;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
};

/** Client-side paging. Goes back to page 1 whenever `resetKey` (search / filter) or the page size changes. */
function usePaging<T>(items: T[], resetKey: string): Paging<T> {
  const [page, setPage] = useState(1);
  const [size, setSizeState] = useState<number>(10);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    // Search / filter changed: start again from the first page.
    setSeenKey(resetKey);
    setPage(1);
  }
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  const rows = items.slice(start, start + size);
  return {
    rows,
    total,
    page: current,
    pages,
    size,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
    setPage: (next) => setPage(Math.min(Math.max(1, next), pages)),
    setSize: (next) => {
      setSizeState(next);
      setPage(1);
    },
  };
}

/** Page numbers with ellipses: 1 … 4 5 6 … 13 */
function pageList(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  let lo = Math.max(2, page - 1);
  let hi = Math.min(pages - 1, page + 1);
  if (page <= 4) {
    lo = 2;
    hi = 5;
  } else if (page >= pages - 3) {
    lo = pages - 4;
    hi = pages - 1;
  }
  if (lo > 2) out.push("gap");
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

function Pager<T>({ paging, noun }: { paging: Paging<T>; noun: string }) {
  const { page, pages, size, from, to, total, setPage, setSize } = paging;
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <p>
        {total === 0 ? `Showing 0 of 0 ${noun}` : `Showing ${from}–${to} of ${total} ${noun}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Rows per page
          <select
            aria-label="Rows per page"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btn} text-slate-600 hover:bg-slate-100`}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => setPage(p)}
                className={`${btn} ${p === page ? "bg-[#3F7A52] text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {p}
              </button>
            )
          )}
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)} className={`${btn} text-slate-600 hover:bg-slate-100`}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F7A52]/30"
      />
    </div>
  );
}

function DeleteButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function PairTable({
  left,
  right,
  rows,
  empty,
  loading,
  disabled,
  onDelete,
}: {
  left: string;
  right: string;
  rows: { id: number; left: string; right: string }[];
  empty: string;
  loading: boolean;
  disabled: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-y border-slate-100 bg-[#F7F8F6] text-left text-xs text-slate-500">
            <th className="px-5 py-3 font-medium">{left}</th>
            <th className="w-28 px-5 py-3 text-center font-medium"> </th>
            <th className="px-5 py-3 font-medium">{right}</th>
            <th className="w-16 px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={4} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {initials(row.left)}
                    </span>
                    <span className="font-semibold text-[#1C2B22]">{row.left}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-center text-xs text-slate-400">manages</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {initials(row.right)}
                    </span>
                    <span className="font-semibold text-[#1C2B22]">{row.right}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <DeleteButton label={`Delete ${row.left} → ${row.right}`} disabled={disabled} onClick={() => onDelete(row.id)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Table row with an iOS-style spinner, shown while the page's data loads. */
function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12">
        <div role="status" className="flex flex-col items-center gap-3 text-sm text-slate-400">
          <span className="relative block h-7 w-7" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className="absolute left-[45.5%] top-0 h-[30%] w-[9%] rounded-full bg-slate-500"
                style={{
                  transform: `rotate(${i * 30}deg)`,
                  transformOrigin: "50% 166%",
                  animation: "ios-spin-fade 1s linear infinite",
                  animationDelay: `${(i - 12) / 12}s`,
                }}
              />
            ))}
          </span>
          Loading…
          <style>{`@keyframes ios-spin-fade { from { opacity: 1 } to { opacity: 0.15 } }`}</style>
        </div>
      </td>
    </tr>
  );
}
