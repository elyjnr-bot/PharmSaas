import { supabase } from './supabase';
import { normalizePaymentMethod } from './paymentMethods';

export interface SalesStats {
  totalAmount: number;
  taxAmount: number;
  grandTotal: number;
  count: number;
}

export interface PaymentMethodBreakdown {
  especes: number;
  carte: number;
  mtn: number;
  airtel: number;
}

export interface TopSelling {
  medication_name: string;
  total_quantity: number;
  total_revenue: number;
}

export const getDateRange = (period: 'today' | 'week' | 'month') => {
  const now = new Date();
  const start = new Date();

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setMonth(now.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
  }

  return { start: start.toISOString(), end: now.toISOString() };
};

export const getSalesStats = async (period: 'today' | 'week' | 'month'): Promise<SalesStats> => {
  try {
    const { start, end } = getDateRange(period);

    // Source unique : sales_journal (alimenté par toutes les caisses, online + offline).
    // total_price = montant net (HT) de la ligne ; le CA reporté est net de TVA.
    const { data, error } = await supabase
      .from('sales_journal')
      .select('total_price, sale_date')
      .gte('sale_date', start)
      .lte('sale_date', end);

    if (error) throw error;

    const stats: SalesStats = {
      totalAmount: 0,
      taxAmount: 0,
      grandTotal: 0,
      count: data?.length || 0,
    };

    data?.forEach((row) => {
      stats.totalAmount += row.total_price || 0;
      stats.grandTotal += row.total_price || 0;
    });

    return stats;
  } catch (error) {
    console.error('Error getting sales stats:', error);
    return { totalAmount: 0, taxAmount: 0, grandTotal: 0, count: 0 };
  }
};

export const getPaymentMethodBreakdown = async (): Promise<PaymentMethodBreakdown> => {
  try {
    const { start } = getDateRange('today');

    const { data, error } = await supabase
      .from('sales_journal')
      .select('payment_method, total_price')
      .gte('sale_date', start);

    if (error) throw error;

    const breakdown: PaymentMethodBreakdown = {
      especes: 0,
      carte: 0,
      mtn: 0,
      airtel: 0,
    };

    data?.forEach((row) => {
      // Normalise les variantes héritées ('Especes'/'Espèces', casse, accents, ...)
      const id = normalizePaymentMethod(row.payment_method);
      const amount = row.total_price || 0;
      if (id === 'especes') breakdown.especes += amount;
      else if (id === 'carte') breakdown.carte += amount;
      else if (id === 'mtn') breakdown.mtn += amount;
      else if (id === 'airtel') breakdown.airtel += amount;
    });

    return breakdown;
  } catch (error) {
    console.error('Error getting payment breakdown:', error);
    return { especes: 0, carte: 0, mtn: 0, airtel: 0 };
  }
};

export const getCriticalStocks = async () => {
  try {
    const { data, error } = await supabase
      .from('medications')
      .select(`
        *,
        stock_entries(id, is_sold)
      `)
      .order('name', { ascending: true });

    if (error) throw error;

    const medicationsWithStock = (data || []).map((med: any) => {
      const stockEntries = med.stock_entries || [];
      const availableStock = stockEntries.filter((entry: any) => !entry.is_sold).length;

      return {
        ...med,
        quantity: availableStock,
        stock_entries: undefined
      };
    }).filter(med => med.quantity === 0);

    return medicationsWithStock;
  } catch (error) {
    console.error('Error getting critical stocks:', error);
    return [];
  }
};

export const getTopSelling = async (limit: number = 10): Promise<TopSelling[]> => {
  try {
    const { start } = getDateRange('month');

    // Source unique : sales_journal (inclut ventes scan + hors-ligne, contrairement
    // à sale_items qui n'est écrit qu'en ligne).
    const { data, error } = await supabase
      .from('sales_journal')
      .select('medication_name, quantity_sold, total_price, sale_date')
      .gte('sale_date', start);

    if (error) throw error;

    const grouped = data?.reduce((acc: Record<string, TopSelling>, item) => {
      if (!acc[item.medication_name]) {
        acc[item.medication_name] = {
          medication_name: item.medication_name,
          total_quantity: 0,
          total_revenue: 0,
        };
      }
      acc[item.medication_name].total_quantity += item.quantity_sold || 0;
      acc[item.medication_name].total_revenue += item.total_price || 0;
      return acc;
    }, {});

    const topSelling = Object.values(grouped || {})
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, limit);

    return topSelling;
  } catch (error) {
    console.error('Error getting top selling:', error);
    return [];
  }
};

export const getRecentExpenses = async (limit: number = 10) => {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting recent expenses:', error);
    return [];
  }
};

export interface ExpiringProduct {
  id: string;
  name: string;
  dosage: string;
  quantity: number;
  price: number | null;
  batch_number: string;
  expiry_date: string;
  days_until_expiry: number;
  potential_loss: number;
}

export const getExpiringProducts = async () => {
  try {
    const now = new Date();
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(now.getMonth() + 6);

    const { data, error } = await supabase
      .from('medications')
      .select(`
        *,
        stock_entries(id, is_sold)
      `)
      .lte('expiry_date', sixMonthsFromNow.toISOString().split('T')[0])
      .order('expiry_date', { ascending: true });

    if (error) throw error;

    const medicationsWithStock = (data || []).map((med: any) => {
      const stockEntries = med.stock_entries || [];
      const availableStock = stockEntries.filter((entry: any) => !entry.is_sold).length;

      return {
        ...med,
        quantity: availableStock,
        stock_entries: undefined
      };
    }).filter(med => med.quantity > 0);

    const expiringProducts: ExpiringProduct[] = medicationsWithStock.map((med) => {
      const expiryDate = new Date(med.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const potentialLoss = med.quantity * (med.price || 0);

      return {
        id: med.id,
        name: med.name,
        dosage: med.dosage,
        quantity: med.quantity,
        price: med.price,
        batch_number: med.batch_number,
        expiry_date: med.expiry_date,
        days_until_expiry: daysUntilExpiry,
        potential_loss: potentialLoss,
      };
    });

    return expiringProducts;
  } catch (error) {
    console.error('Error getting expiring products:', error);
    return [];
  }
};
