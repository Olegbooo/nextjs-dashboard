import { createClient } from "@supabase/supabase-js";
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from "./definitions";
import { formatCurrency } from "./utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function fetchRevenue() {
  const { data, error } = await supabase.from("revenue").select("*");
  if (error) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch revenue data.");
  }
  return data as Revenue[];
}

export async function fetchLatestInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("amount, id, customers(name, email, image_url)")
    .order("date", { ascending: false })
    .limit(5);

  if (error || !data) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch the latest invoices.");
  }

  return data.map((invoice: any) => ({
    id: invoice.id,
    amount: formatCurrency(invoice.amount),
    name: invoice.customers.name,
    email: invoice.customers.email,
    image_url: invoice.customers.image_url,
  }));
}

export async function fetchCardData() {
  try {
    const [invoiceCountPromise, customerCountPromise, invoiceStatusPromise] =
      await Promise.all([
        supabase.from("invoices").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("status, amount"),
      ]);

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    if (
      invoiceCountPromise.error ||
      customerCountPromise.error ||
      invoiceStatusPromise.error
    ) {
      throw new Error("Failed to fetch card data.");
    }

    let paid = 0;
    let pending = 0;
    invoiceStatusPromise.data?.forEach((invoice: any) => {
      if (invoice.status === "paid") paid += invoice.amount;
      if (invoice.status === "pending") pending += invoice.amount;
    });

    return {
      numberOfCustomers: customerCountPromise.count || 0,
      numberOfInvoices: invoiceCountPromise.count || 0,
      totalPaidInvoices: formatCurrency(paid),
      totalPendingInvoices: formatCurrency(pending),
    };
  } catch (error) {
    console.error("Error:", error);
    throw new Error("Failed to fetch card data.");
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
) {
  const from = (currentPage - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;

  const { data, error } = await supabase
    .from("invoices")
    .select("id, amount, date, status, customers(name, email, image_url)")
    .order("date", { ascending: false })
    .range(from, to)
    .ilike("customers.name", `%${query}%`);

  if (error || !data) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch invoices.");
  }

  return data as unknown as InvoicesTable[];
}

export async function fetchInvoicesPages(query: string) {
  const { count, error } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .ilike("customers.name", `%${query}%`);

  if (error || count === null) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch total number of invoices.");
  }

  return Math.ceil(count / ITEMS_PER_PAGE);
}

export async function fetchInvoiceById(id: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, customer_id, amount, status")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch invoice.");
  }

  return {
    ...data,
    amount: data.amount / 100,
  } as InvoiceForm;
}

export async function fetchCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch all customers.");
  }

  return data as CustomerField[];
}

export async function fetchFilteredCustomers(query: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, image_url, invoices(id, status, amount)")
    .ilike("name", `%${query}%`);

  if (error || !data) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch customer table.");
  }

  const customers = data.map((customer: any) => {
    let total_pending = 0;
    let total_paid = 0;

    customer.invoices?.forEach((inv: any) => {
      if (inv.status === "pending") total_pending += inv.amount;
      if (inv.status === "paid") total_paid += inv.amount;
    });

    return {
      ...customer,
      total_invoices: customer.invoices?.length || 0,
      total_pending: formatCurrency(total_pending),
      total_paid: formatCurrency(total_paid),
    };
  });

  return customers as CustomersTableType[];
}
