export const isExpired = (expiryDate: string): boolean => {
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
};

export const expiresInThreeMonths = (expiryDate: string): boolean => {
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeMonthsFromNow = new Date(today);
  threeMonthsFromNow.setMonth(today.getMonth() + 3);

  return expiry >= today && expiry <= threeMonthsFromNow;
};

export const getDaysUntilExpiry = (expiryDate: string): number => {
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const getExpiryStatus = (expiryDate: string): 'expired' | 'warning' | 'ok' => {
  if (isExpired(expiryDate)) return 'expired';
  if (expiresInThreeMonths(expiryDate)) return 'warning';
  return 'ok';
};
