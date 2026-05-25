const PERMISSIONS_KEY = 'pharma_seller_permissions';

export interface SellerPermissions {
  showDailyTotal: boolean;
  showTransactionHistory: boolean;
  allowManualProductAdd: boolean;
  autoLogoutMinutes: number;
}

const DEFAULTS: SellerPermissions = {
  showDailyTotal: true,
  showTransactionHistory: true,
  allowManualProductAdd: true,
  autoLogoutMinutes: 10,
};

export function getSellerPermissions(): SellerPermissions {
  try {
    const stored = localStorage.getItem(PERMISSIONS_KEY);
    if (!stored) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSellerPermissions(patch: Partial<SellerPermissions>): void {
  const current = getSellerPermissions();
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify({ ...current, ...patch }));
}
