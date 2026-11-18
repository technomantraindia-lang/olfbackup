/**
 * Centralized Wallet Calculation Utility
 * 
 * This utility encapsulates all business logic for vendor wallet calculations
 * to ensure consistency across the codebase.
 * 
 * Business Rules:
 * - Order Value = Gross Amount (Sum of all item selling prices)
 * - Vendor Price = Vendor Cut (Sum of all item vendor prices)
 * - Margin = Order Value - Vendor Price
 * - Penalty = Fixed 100 Rs
 */

export enum PaymentMode {
  CASH_ON_DELIVERY = "CASH_ON_DELIVERY",
  PRE_PAID = "PRE_PAID",
}

export interface OrderFinancials {
  grossAmount: number;      // Total selling price of all items
  vendorCut: number;         // Total vendor price of all items
  totalMargin: number;       // grossAmount - vendorCut
  discount: number;          // Discount amount applied to order
  vendorPayout: number;      // vendorCut - discount (what vendor receives after discount)
}

export interface WalletTransaction {
  credit: number;
  debit: number;
  margin: number;
  vendorCut: number;
  description: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * WalletCalculator - Centralized business logic for vendor wallet calculations
 */
export class WalletCalculator {
  private static readonly PENALTY_AMOUNT = 100;
  private static readonly PARTIAL_DELIVERY_FACTOR = 0.5;

  /**
   * Validate order financials before processing
   */
  static validateOrderFinancials(financials: OrderFinancials): ValidationResult {
    // Validate: Gross amount must be positive
    if (financials.grossAmount <= 0) {
      return {
        isValid: false,
        error: `Invalid order: Gross amount must be positive (received: ${financials.grossAmount})`,
      };
    }

    // Validate: Discount cannot exceed gross amount
    if (financials.discount > financials.grossAmount) {
      return {
        isValid: false,
        error: `Invalid order: Discount (${financials.discount}) exceeds gross amount (${financials.grossAmount})`,
      };
    }

    // Validate: Discount cannot be negative
    if (financials.discount < 0) {
      return {
        isValid: false,
        error: `Invalid order: Discount cannot be negative (received: ${financials.discount})`,
      };
    }

    // Validate: Negative margin (vendor price > selling price)
    if (financials.totalMargin < 0) {
      return {
        isValid: false,
        error: `Invalid order: Negative margin detected (${financials.totalMargin}). Vendor cost (${financials.vendorCut}) > Gross amount (${financials.grossAmount})`,
      };
    }

    // Validate: Vendor cut cannot be negative
    if (financials.vendorCut < 0) {
      return {
        isValid: false,
        error: `Invalid order: Vendor cut cannot be negative (received: ${financials.vendorCut})`,
      };
    }

    return { isValid: true };
  }

  /**
   * Calculate wallet transaction for DELIVERED order
   * 
   * Business Rules:
   * - COD: debit = margin, credit = 0
   * - PrePaid: credit = vendor price - discount, debit = 0
   */
  static calculateDeliveredTransaction(
    financials: OrderFinancials,
    paymentMode: PaymentMode,
    orderId: string
  ): WalletTransaction {
    const validation = this.validateOrderFinancials(financials);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    let credit = 0;
    let debit = 0;
    const roundedMargin = Math.round(financials.totalMargin);
    const roundedVendorPayout = Math.round(financials.vendorPayout);

    if (paymentMode === PaymentMode.CASH_ON_DELIVERY) {
      // COD: Platform keeps the margin
      // Business Rule: debit = margin (NOT margin + discount)
      debit = roundedMargin;
      credit = 0;
    } else {
      // PrePaid: Vendor receives their cut minus discount
      // Business Rule: credit = vendor price - discount
      credit = roundedVendorPayout > 0 ? roundedVendorPayout : 0;
      debit = 0;
    }

    return {
      credit,
      debit,
      margin: roundedMargin,
      vendorCut: roundedVendorPayout,
      description: `Settlement for Order #${orderId} (${paymentMode})`,
    };
  }

  /**
   * Calculate wallet transaction for PARTIALLY DELIVERED order
   * 
   * Business Rules:
   * - COD: debit = margin + (vendor price / 2), credit = 0
   * - PrePaid: credit = (vendor price / 2), debit = 0
   * 
   * Note: Discount should NOT affect the vendor price division
   */
  static calculatePartialDeliveryTransaction(
    financials: OrderFinancials,
    paymentMode: PaymentMode,
    orderId: string
  ): WalletTransaction {
    const validation = this.validateOrderFinancials(financials);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const roundedMargin = Math.round(financials.totalMargin);
    
    // CRITICAL FIX: Use vendorCut (raw vendor price) NOT vendorPayout (after discount)
    // The discount is already reflected in the margin calculation
    const halfVendorCut = Math.round(financials.vendorCut * this.PARTIAL_DELIVERY_FACTOR);
    
    let credit = 0;
    let debit = 0;

    if (paymentMode === PaymentMode.CASH_ON_DELIVERY) {
      // COD Partial: Platform keeps margin + 50% of vendor amount
      // Business Rule: debit = margin + (vendor price / 2)
      debit = roundedMargin + halfVendorCut;
      credit = 0;
    } else {
      // PrePaid Partial: Vendor receives 50% of their cut
      // Business Rule: credit = (vendor price / 2)
      credit = halfVendorCut;
      debit = 0;
    }

    return {
      credit,
      debit,
      margin: roundedMargin,
      vendorCut: halfVendorCut,
      description: `Settlement (50% ${paymentMode === PaymentMode.CASH_ON_DELIVERY ? 'Margin' : 'Outlet Cost'} - Partial Delivery) for Order #${orderId} (${paymentMode})`,
    };
  }

  /**
   * Calculate wallet transaction for UNDELIVERED order
   * 
   * Business Rules:
   * - Both COD and PrePaid: Fixed penalty of Rs. 100
   * - credit = 0, debit = 100, margin = 0, vendor_cut = 0
   */
  static calculateUndeliveredPenalty(
    orderId: string,
    reason?: string
  ): WalletTransaction {
    const reasonText = reason ? `: ${reason}` : "";
    
    return {
      credit: 0,
      debit: this.PENALTY_AMOUNT,
      margin: 0,
      vendorCut: 0,
      description: `Penalty for Undelivered Order #${orderId}${reasonText}`,
    };
  }

  /**
   * Calculate wallet transaction for CANCELLED order
   * 
   * Business Rules:
   * - All values set to 0
   * - No credit or debit applied
   */
  static calculateCancelledTransaction(orderId: string): WalletTransaction {
    return {
      credit: 0,
      debit: 0,
      margin: 0,
      vendorCut: 0,
      description: `Order #${orderId} Cancelled - No Settlement`,
    };
  }

  /**
   * Calculate wallet adjustment for reverting a previous transaction
   * Used when order status changes from one state to another
   * 
   * Returns the net change that should be applied to the wallet
   */
  static calculateWalletAdjustment(
    previousCredit: number,
    previousDebit: number,
    newCredit: number,
    newDebit: number
  ): number {
    // Net change = (new_credit - new_debit) - (previous_credit - previous_debit)
    const previousNet = previousCredit - previousDebit;
    const newNet = newCredit - newDebit;
    return newNet - previousNet;
  }

  /**
   * Calculate penalty reversal (when undelivered order becomes delivered)
   * Returns the amount to credit back to vendor
   */
  static calculatePenaltyReversal(): number {
    return this.PENALTY_AMOUNT;
  }

  /**
   * Get penalty amount constant
   */
  static getPenaltyAmount(): number {
    return this.PENALTY_AMOUNT;
  }

  /**
   * Parse menu items and calculate order financials
   * 
   * @param menuItems - Menu items from order (can be string or object)
   * @param discountAmount - Discount applied to order
   * @returns OrderFinancials object with all calculated values
   */
  static calculateOrderFinancials(
    menuItems: any,
    discountAmount: number = 0
  ): OrderFinancials {
    let vendorCut = 0;
    let grossAmount = 0;

    if (menuItems) {
      let parsedItems;
      if (typeof menuItems === "string") {
        parsedItems = JSON.parse(menuItems);
      } else {
        parsedItems = menuItems;
      }

      const items = parsedItems?.items || [];
      for (const item of items) {
        const sellingPrice = parseFloat(item.SellingPrice) || 0;
        const quantity = item.quantity || 1;
        let vendorPrice: number;

        // Use VendorPrice stored at order creation time (most reliable)
        // Fall back to SellingPrice only if VendorPrice is missing (margin = 0)
        if (item.VendorPrice != null && !isNaN(parseFloat(item.VendorPrice))) {
          vendorPrice = parseFloat(item.VendorPrice);
        } else {
          vendorPrice = sellingPrice;
          console.warn(
            `VendorPrice missing for item "${item.name}" — margin for this line will be 0`
          );
        }

        vendorCut += vendorPrice * quantity;
        grossAmount += sellingPrice * quantity;
      }
    }

    const discount = parseFloat(String(discountAmount)) || 0;
    const totalMargin = grossAmount - vendorCut;
    const vendorPayout = vendorCut - discount;

    return {
      grossAmount,
      vendorCut,
      totalMargin,
      discount,
      vendorPayout,
    };
  }

  /**
   * Determine payment mode from order mode string
   */
  static parsePaymentMode(mode: string): PaymentMode {
    const normalizedMode = mode?.toUpperCase() || "";
    
    if (normalizedMode === "CASH_ON_DELIVERY" || normalizedMode === "COD") {
      return PaymentMode.CASH_ON_DELIVERY;
    } else if (normalizedMode === "PRE_PAID" || normalizedMode === "PREPAID") {
      return PaymentMode.PRE_PAID;
    }
    
    throw new Error(`Invalid payment mode: ${mode}. Expected CASH_ON_DELIVERY or PRE_PAID`);
  }
}
