import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Medication } from './supabase';
import { saveCart, loadCart, clearCart as clearCartDB, type CartItem as DBCartItem } from './db';

export interface InventoryUnit {
  id: string;
  unit_code: string;
  medication_id: string;
  batch_number: string;
  expiry_date: string | null;
  status: string;
  imported_code: string | null;
}

interface CartItem {
  medication: Medication;
  quantity: number;
  units?: InventoryUnit[];
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (medication: Medication) => void;
  addUnitToCart: (medication: Medication, unit: InventoryUnit) => void;
  removeUnitFromCart: (medicationId: string, unitId: string) => void;
  updateCartQuantity: (medicationId: string | number, newQuantity: number) => void;
  clearCart: () => void;
  cartItemCount: number;
  total: number;
  isUnitMode: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function isUnitModeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('workflow_mode') === 'unit';
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const isUnitMode = isUnitModeEnabled();

  useEffect(() => {
    const loadPersistedCart = async () => {
      try {
        const items = await loadCart();

        if (items.length > 0) {
          const restoredCart = items.map((item: DBCartItem) => ({
            medication: {
              id: item.medication_id,
              name: item.medication_name,
              dosage: item.medication_dosage,
              price: item.unit_price,
              quantity: 999,
            } as Medication,
            quantity: item.quantity,
            units: item.units || [],
          }));

          setCart(restoredCart);
        }
      } catch (error) {
        console.error('Error loading cart:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadPersistedCart();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const persistCart = async () => {
      try {
        const items: DBCartItem[] = cart.map((item) => ({
          medication_id: item.medication.id,
          medication_name: item.medication.name,
          medication_dosage: item.medication.dosage,
          quantity: item.quantity,
          unit_price: item.medication.price || 0,
          total_price: (item.medication.price || 0) * item.quantity,
          units: item.units,
        }));

        await saveCart(items);
      } catch (error) {
        console.error('Error saving cart:', error);
      }
    };

    persistCart();
  }, [cart, isLoaded]);

  const addToCart = (medication: Medication) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.medication.id === medication.id);
      if (existing) {
        if (existing.quantity >= medication.quantity) return prev;
        return prev.map((item) =>
          item.medication.id === medication.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { medication, quantity: 1, units: [] }];
    });
  };

  const addUnitToCart = (medication: Medication, unit: InventoryUnit) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.medication.id === medication.id);

      if (existing) {
        const unitAlreadyInCart = existing.units?.some(u => u.id === unit.id);
        if (unitAlreadyInCart) return prev;

        return prev.map((item) =>
          item.medication.id === medication.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                units: [...(item.units || []), unit],
              }
            : item
        );
      }

      return [...prev, { medication, quantity: 1, units: [unit] }];
    });
  };

  const removeUnitFromCart = (medicationId: string, unitId: string) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.medication.id !== medicationId) return item;

          const newUnits = (item.units || []).filter(u => u.id !== unitId);
          const newQuantity = newUnits.length;

          if (newQuantity === 0) return null;

          return { ...item, quantity: newQuantity, units: newUnits };
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  const updateCartQuantity = (medicationId: string | number, newQuantity: number) => {
    if (newQuantity <= 0) {
      setCart((prev) => prev.filter((item) => item.medication.id !== medicationId));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.medication.id === medicationId
            ? { ...item, quantity: Math.min(newQuantity, item.medication.quantity) }
            : item
        )
      );
    }
  };

  const clearCart = async () => {
    setCart([]);
    try {
      await clearCartDB();
    } catch (error) {
      console.error('Error clearing cart:', error);
    }
  };

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const calculateTotal = () => {
    const subtotal = cart.reduce((sum, item) => sum + (item.medication.price || 0) * item.quantity, 0);
    const tax = Math.round(subtotal * 0.189);
    return subtotal + tax;
  };

  const total = calculateTotal();

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        addUnitToCart,
        removeUnitFromCart,
        updateCartQuantity,
        clearCart,
        cartItemCount,
        total,
        isUnitMode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
