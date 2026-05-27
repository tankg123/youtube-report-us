export const CONTRACT_STATUSES = [
  { value: "incomplete_info", label: "Missing information", color: "bg-amber-50 text-amber-700 border-amber-100" },
  { value: "not_created", label: "No contract", color: "bg-slate-50 text-slate-700 border-slate-200" },
  { value: "sent_waiting", label: "Sent, waiting signature", color: "bg-blue-50 text-blue-700 border-blue-100" },
  { value: "done", label: "Done contract", color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  { value: "renewal_needed", label: "Needs renewal", color: "bg-rose-50 text-rose-700 border-rose-100" }
];

export const PARTNER_REQUIRED_FIELDS = [
  { key: "partner_name", label: "Partner name" },
  { key: "email", label: "Email" },
  { key: "contact_name", label: "Contact person" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "bank_name", label: "Bank name" },
  { key: "account_number", label: "Account number" }
];

export function missingPartnerFields(partner) {
  return PARTNER_REQUIRED_FIELDS
    .filter((field) => !String(partner?.[field.key] || "").trim())
    .map((field) => field.label);
}

export function partnerContractStatus(partner) {
  if (isContractExpired(partner)) return "renewal_needed";
  const explicitStatus = String(partner?.contract_status || "");
  if (CONTRACT_STATUSES.some((item) => item.value === explicitStatus)) return explicitStatus;
  if (partner?.contract_signed_at) return "done";
  if (partner?.contract_sent_at) return "sent_waiting";
  if (missingPartnerFields(partner).length) return "incomplete_info";
  return "not_created";
}

export function contractEndDate(partner) {
  const value = partner?.contract_end_at;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isContractExpired(partner) {
  if (String(partner?.contract_status || "") !== "done") return false;
  const endDate = contractEndDate(partner);
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate < today;
}

export function daysUntilContractEnd(partner) {
  const endDate = contractEndDate(partner);
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
}

export function expiringContracts(partners, days = 30) {
  return partners
    .map((partner) => ({ ...partner, days_until_end: daysUntilContractEnd(partner) }))
    .filter((partner) => String(partner.contract_status || "") === "done" && partner.days_until_end !== null && partner.days_until_end >= 0 && partner.days_until_end <= days)
    .sort((a, b) => a.days_until_end - b.days_until_end);
}

export function contractStatusMeta(status) {
  return CONTRACT_STATUSES.find((item) => item.value === status) || CONTRACT_STATUSES[1];
}

export function summarizePartners(partners) {
  const summary = {
    total: partners.length,
    incomplete_info: 0,
    not_created: 0,
    sent_waiting: 0,
    done: 0,
    renewal_needed: 0,
    expiring_soon: 0,
    created_this_month: 0,
    newest_created_at: "",
    oldest_created_at: ""
  };

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dates = [];

  partners.forEach((partner) => {
    const status = partnerContractStatus(partner);
    summary[status] += 1;
    const daysLeft = daysUntilContractEnd(partner);
    if (String(partner.contract_status || "") === "done" && daysLeft !== null && daysLeft >= 0 && daysLeft <= 30) {
      summary.expiring_soon += 1;
    }
    if (String(partner.created_at || "").startsWith(monthKey)) summary.created_this_month += 1;
    if (partner.created_at) dates.push(partner.created_at);
  });

  dates.sort();
  summary.oldest_created_at = dates[0] || "";
  summary.newest_created_at = dates[dates.length - 1] || "";
  summary.unfinished = summary.total - summary.done;

  return summary;
}
