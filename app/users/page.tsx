"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCheck, ShieldAlert, Trash2, Link as LinkIcon, UserPlus } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("users");
  const [isPending, startTransition] = useTransition();

  // Data state
  const [usersList, setUsersList] = useState<UserView[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [reportingLines, setReportingLines] = useState<ReportingLineView[]>([]);
  const [dealerMappings, setDealerMappings] = useState<DealerMappingView[]>([]);
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

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-7 w-7 text-emerald-600" />
          User & Mapping Control Panel
        </h1>
        <p className="text-sm text-slate-500">
          Enforce Role-Based Access Control and manage organizational reporting hierarchies.
          Change anyone's role in the Users table to promote or demote them.
        </p>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">What each role can do</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              <strong>Admin</strong> — full access including users, settings,
              cancelling and editing invoices.
            </li>
            <li>
              <strong>Regional Manager</strong> — sales, purchases, products,
              and customers under their officers.
            </li>
            <li>
              <strong>Sales Officer</strong> — billing, customers, products, and
              receipts for mapped dealers. No purchases or suppliers.
            </li>
            <li>
              <strong>Dealer</strong> — POS, their own invoices, and outstanding
              only.
            </li>
          </ul>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 font-medium flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-600 font-medium flex items-center gap-2">
          <UserCheck className="h-4 w-4" />
          {success}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="users" className="rounded-md px-4 py-2 text-sm font-medium">
            Users ({usersList.length})
          </TabsTrigger>
          <TabsTrigger value="reporting" className="rounded-md px-4 py-2 text-sm font-medium">
            Reporting Lines ({reportingLines.length})
          </TabsTrigger>
          <TabsTrigger value="dealers" className="rounded-md px-4 py-2 text-sm font-medium">
            Dealer Mappings ({dealerMappings.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Users */}
        <TabsContent value="users" className="grid gap-6 lg:grid-cols-3">
          {/* Create User Card */}
          <Card className="lg:col-span-1 border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-1.5">
                <UserPlus className="h-5 w-5 text-emerald-600" />
                Register New User
              </CardTitle>
              <CardDescription>Add new employee or dealer credentials</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    required
                  />
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
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                  >
                    <option value="admin">Admin / Operator</option>
                    <option value="regional_manager">Regional Manager</option>
                    <option value="sales_officer">Sales Officer</option>
                    <option value="dealer">Dealer</option>
                  </select>
                </div>

                {userRole === "dealer" && (
                  <div className="space-y-1.5 border-t pt-3">
                    <Label htmlFor="customerSelect">Map to Customer Record *</Label>
                    <select
                      id="customerSelect"
                      value={userCustomerId}
                      onChange={(e) => setUserCustomerId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                      required
                    >
                      <option value="">-- Choose Customer --</option>
                      {customersList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500">
                      Linking maps billing records to this dealer user profile.
                    </p>
                  </div>
                )}

                <Button type="submit" disabled={isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {isPending ? "Creating..." : "Create User Profile"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Users List Card */}
          <Card className="lg:col-span-2 border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Registered Users</CardTitle>
              <CardDescription>Security profiles authorized to log in</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Linked Customer</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-400 py-6 text-sm">
                        No registered users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usersList.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-semibold text-slate-800">{user.name}</TableCell>
                        <TableCell className="text-slate-600">{user.phone}</TableCell>
                        <TableCell className="capitalize text-slate-600">
                          {user.phone === SEED_ADMIN_PHONE ? (
                            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                              {ROLE_LABELS[user.role]}
                            </span>
                          ) : (
                            <select
                              aria-label={`Role for ${user.name}`}
                              value={user.role}
                              disabled={isPending}
                              onChange={(e) =>
                                handleRoleChange(
                                  user,
                                  e.target.value as UserRole
                                )
                              }
                              className={`h-8 rounded-md border bg-white px-2 text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 ${
                                user.role === "admin"
                                  ? "border-rose-200 text-rose-700"
                                  : user.role === "regional_manager"
                                    ? "border-blue-200 text-blue-700"
                                    : user.role === "sales_officer"
                                      ? "border-purple-200 text-purple-700"
                                      : "border-emerald-200 text-emerald-700"
                              }`}
                            >
                              {(Object.keys(ROLE_LABELS) as UserRole[]).map(
                                (role) => (
                                  <option key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                  </option>
                                )
                              )}
                            </select>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {user.phone === SEED_ADMIN_PHONE ? (
                            <span className="text-xs text-slate-400">-</span>
                          ) : user.role === "dealer" ||
                            dealerCustomerPick[user.id] !== undefined ? (
                            <select
                              aria-label={`Customer for ${user.name}`}
                              value={
                                dealerCustomerPick[user.id] ??
                                (user.customerId ? String(user.customerId) : "")
                              }
                              disabled={isPending}
                              onChange={(e) =>
                                handleDealerCustomerChange(
                                  user,
                                  e.target.value
                                )
                              }
                              className="h-8 max-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                            >
                              <option value="">-- Customer --</option>
                              {customersList.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.phone !== SEED_ADMIN_PHONE && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Reporting Lines */}
        <TabsContent value="reporting" className="grid gap-6 lg:grid-cols-3">
          {/* Create Mapping Card */}
          <Card className="lg:col-span-1 border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-1.5">
                <LinkIcon className="h-5 w-5 text-blue-600" />
                Assign Reporting Line
              </CardTitle>
              <CardDescription>Link Regional Managers to Sales Officers</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateReportingLine} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rmSelect">Regional Manager</Label>
                  <select
                    id="rmSelect"
                    value={rlManagerId}
                    onChange={(e) => setRlManagerId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    required
                  >
                    <option value="">-- Choose RM --</option>
                    {regionalManagers.map((rm) => (
                      <option key={rm.id} value={rm.id}>
                        {rm.name} ({rm.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="soSelect">Reports to Sales Officer</Label>
                  <select
                    id="soSelect"
                    value={rlOfficerId}
                    onChange={(e) => setRlOfficerId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    required
                  >
                    <option value="">-- Choose Sales Officer --</option>
                    {salesOfficers.map((so) => (
                      <option key={so.id} value={so.id}>
                        {so.name} ({so.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <Button type="submit" disabled={isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {isPending ? "Mapping..." : "Map Reporting Line"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Mapping List Card */}
          <Card className="lg:col-span-2 border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Active Reporting Lines</CardTitle>
              <CardDescription>Regional Manager to Sales Officer hierarchy</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regional Manager</TableHead>
                    <TableHead className="w-[100px] text-center">Direction</TableHead>
                    <TableHead>Sales Officer</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportingLines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-400 py-6 text-sm">
                        No reporting mappings configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportingLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-semibold text-slate-800">{line.managerName}</TableCell>
                        <TableCell className="text-center text-slate-400 text-xs">➡️ manages ➡️</TableCell>
                        <TableCell className="font-semibold text-slate-800">{line.officerName}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteReportingLine(line.id)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Dealer Mappings */}
        <TabsContent value="dealers" className="grid gap-6 lg:grid-cols-3">
          {/* Create Dealer Mapping Card */}
          <Card className="lg:col-span-1 border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-1.5">
                <LinkIcon className="h-5 w-5 text-purple-600" />
                Assign Dealer to SO
              </CardTitle>
              <CardDescription>Link Sales Officers to their Dealer accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateDealerMapping} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dmSoSelect">Sales Officer</Label>
                  <select
                    id="dmSoSelect"
                    value={dmOfficerId}
                    onChange={(e) => setDmOfficerId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    required
                  >
                    <option value="">-- Choose SO --</option>
                    {salesOfficers.map((so) => (
                      <option key={so.id} value={so.id}>
                        {so.name} ({so.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dmDealerSelect">Dealer User Account</Label>
                  <select
                    id="dmDealerSelect"
                    value={dmDealerId}
                    onChange={(e) => setDmDealerId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    required
                  >
                    <option value="">-- Choose Dealer --</option>
                    {dealers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.customerName ? `(Maps to: ${d.customerName})` : `(${d.phone})`}
                      </option>
                    ))}
                  </select>
                </div>

                <Button type="submit" disabled={isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {isPending ? "Mapping..." : "Map Dealer to SO"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Dealer Mapping List Card */}
          <Card className="lg:col-span-2 border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Active Dealer Mappings</CardTitle>
              <CardDescription>Sales Officers assigned to dealer accounts</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sales Officer</TableHead>
                    <TableHead className="w-[100px] text-center">Direction</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dealerMappings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-400 py-6 text-sm">
                        No dealer mappings configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dealerMappings.map((map) => (
                      <TableRow key={map.id}>
                        <TableCell className="font-semibold text-slate-800">{map.officerName}</TableCell>
                        <TableCell className="text-center text-slate-400 text-xs">➡️ manages ➡️</TableCell>
                        <TableCell className="font-semibold text-slate-800">{map.dealerName}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDealerMapping(map.id)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
