/**
 * Test file for WalletCalculator
 * 
 * Run with: npx ts-node utils/wallet-calculator.test.ts
 * Or use any test runner like Jest, Mocha, etc.
 */

import { WalletCalculator, PaymentMode, OrderFinancials } from "./wallet-calculator.util";

// Test colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function assertEquals(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Expected: ${expected}, Got: ${actual}`);
    testsFailed++;
  }
}

function testCase(name: string, fn: () => void) {
  console.log(`\n${YELLOW}${name}${RESET}`);
  fn();
}

// Test data based on the business rules
const ORDER_VALUE = 500;
const VENDOR_PRICE = 440;
const MARGIN = ORDER_VALUE - VENDOR_PRICE; // 60
const PENALTY = 100;

console.log("=".repeat(70));
console.log("WALLET CALCULATOR TESTS - Based on Business Rules");
console.log("=".repeat(70));
console.log(`Order Value: ${ORDER_VALUE}`);
console.log(`Vendor Price: ${VENDOR_PRICE}`);
console.log(`Margin: ${MARGIN}`);
console.log(`Penalty: ${PENALTY}`);
console.log("=".repeat(70));

// ============================================================================
// CASE 1: Delivered + COD
// ============================================================================
testCase("Case 1: Delivered + COD (No Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 0,
    vendorPayout: VENDOR_PRICE,
  };

  const result = WalletCalculator.calculateDeliveredTransaction(
    financials,
    PaymentMode.CASH_ON_DELIVERY,
    "TEST-001"
  );

  assertEquals(result.credit, 0, "Credit should be 0");
  assertEquals(result.debit, 60, "Debit should be 60 (margin)");
  assertEquals(result.margin, 60, "Margin should be 60");
});

testCase("Case 1b: Delivered + COD (With Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 40,
    vendorPayout: VENDOR_PRICE - 40, // 400
  };

  const result = WalletCalculator.calculateDeliveredTransaction(
    financials,
    PaymentMode.CASH_ON_DELIVERY,
    "TEST-001B"
  );

  // CRITICAL: Debit should be MARGIN only, NOT margin + discount
  assertEquals(result.credit, 0, "Credit should be 0");
  assertEquals(result.debit, 60, "Debit should be 60 (margin only, not margin+discount)");
  assertEquals(result.margin, 60, "Margin should be 60");
});

// ============================================================================
// CASE 2: Delivered + PrePaid
// ============================================================================
testCase("Case 2: Delivered + PrePaid (No Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 0,
    vendorPayout: VENDOR_PRICE,
  };

  const result = WalletCalculator.calculateDeliveredTransaction(
    financials,
    PaymentMode.PRE_PAID,
    "TEST-002"
  );

  assertEquals(result.credit, 440, "Credit should be 440 (vendor price)");
  assertEquals(result.debit, 0, "Debit should be 0");
  assertEquals(result.margin, 60, "Margin should be 60");
});

testCase("Case 2b: Delivered + PrePaid (With Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 40,
    vendorPayout: VENDOR_PRICE - 40, // 400
  };

  const result = WalletCalculator.calculateDeliveredTransaction(
    financials,
    PaymentMode.PRE_PAID,
    "TEST-002B"
  );

  assertEquals(result.credit, 400, "Credit should be 400 (vendor price - discount)");
  assertEquals(result.debit, 0, "Debit should be 0");
  assertEquals(result.margin, 60, "Margin should be 60");
});

// ============================================================================
// CASE 3 & 4: Undelivered (COD and PrePaid same)
// ============================================================================
testCase("Case 3 & 4: Undelivered (COD and PrePaid)", () => {
  const result = WalletCalculator.calculateUndeliveredPenalty("TEST-003", "Item not available");

  assertEquals(result.credit, 0, "Credit should be 0");
  assertEquals(result.debit, 100, "Debit should be 100 (penalty)");
  assertEquals(result.margin, 0, "Margin should be 0");
  assertEquals(result.vendorCut, 0, "Vendor cut should be 0");
});

// ============================================================================
// CASE 5: Cancelled (COD and PrePaid)
// ============================================================================
testCase("Case 5: Cancelled Order", () => {
  const result = WalletCalculator.calculateCancelledTransaction("TEST-005");

  assertEquals(result.credit, 0, "Credit should be 0");
  assertEquals(result.debit, 0, "Debit should be 0");
  assertEquals(result.margin, 0, "Margin should be 0");
  assertEquals(result.vendorCut, 0, "Vendor cut should be 0");
});

// ============================================================================
// CASE 6: Partial Delivered + COD
// ============================================================================
testCase("Case 6: Partial Delivered + COD (No Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 0,
    vendorPayout: VENDOR_PRICE,
  };

  const result = WalletCalculator.calculatePartialDeliveryTransaction(
    financials,
    PaymentMode.CASH_ON_DELIVERY,
    "TEST-006"
  );

  // Business Rule: debit = margin + (vendor_price / 2)
  // Expected: 60 + (440 / 2) = 60 + 220 = 280
  assertEquals(result.credit, 0, "Credit should be 0");
  assertEquals(result.debit, 280, "Debit should be 280 (margin + vendor_price/2)");
  assertEquals(result.margin, 60, "Margin should be 60");
  assertEquals(result.vendorCut, 220, "Vendor cut should be 220 (half of 440)");
});

testCase("Case 6b: Partial Delivered + COD (With Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 40,
    vendorPayout: VENDOR_PRICE - 40, // 400
  };

  const result = WalletCalculator.calculatePartialDeliveryTransaction(
    financials,
    PaymentMode.CASH_ON_DELIVERY,
    "TEST-006B"
  );

  // CRITICAL: Should use vendorCut (440) NOT vendorPayout (400)
  // Expected: 60 + (440 / 2) = 280
  assertEquals(result.credit, 0, "Credit should be 0");
  assertEquals(result.debit, 280, "Debit should be 280 (margin + vendor_price/2, NOT affected by discount)");
  assertEquals(result.margin, 60, "Margin should be 60");
  assertEquals(result.vendorCut, 220, "Vendor cut should be 220 (half of vendor_price 440, NOT vendorPayout)");
});

// ============================================================================
// CASE 7: Partial Delivered + PrePaid
// ============================================================================
testCase("Case 7: Partial Delivered + PrePaid (No Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 0,
    vendorPayout: VENDOR_PRICE,
  };

  const result = WalletCalculator.calculatePartialDeliveryTransaction(
    financials,
    PaymentMode.PRE_PAID,
    "TEST-007"
  );

  // Business Rule: credit = vendor_price / 2
  // Expected: 440 / 2 = 220
  assertEquals(result.credit, 220, "Credit should be 220 (vendor_price/2)");
  assertEquals(result.debit, 0, "Debit should be 0");
  assertEquals(result.margin, 60, "Margin should be 60");
  assertEquals(result.vendorCut, 220, "Vendor cut should be 220");
});

testCase("Case 7b: Partial Delivered + PrePaid (With Discount)", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 40,
    vendorPayout: VENDOR_PRICE - 40, // 400
  };

  const result = WalletCalculator.calculatePartialDeliveryTransaction(
    financials,
    PaymentMode.PRE_PAID,
    "TEST-007B"
  );

  // CRITICAL: Should use vendorCut (440) NOT vendorPayout (400)
  // Expected: 440 / 2 = 220
  assertEquals(result.credit, 220, "Credit should be 220 (vendor_price/2, NOT affected by discount)");
  assertEquals(result.debit, 0, "Debit should be 0");
  assertEquals(result.margin, 60, "Margin should be 60");
  assertEquals(result.vendorCut, 220, "Vendor cut should be 220 (half of vendor_price 440, NOT vendorPayout)");
});

// ============================================================================
// WALLET ADJUSTMENT CALCULATIONS
// ============================================================================
testCase("Wallet Adjustment: Delivered to Cancelled", () => {
  // Previously: credit=440, debit=0 (PrePaid delivered)
  // Now: credit=0, debit=0 (cancelled)
  const adjustment = WalletCalculator.calculateWalletAdjustment(440, 0, 0, 0);
  assertEquals(adjustment, -440, "Adjustment should be -440 (reverse the credit)");
});

testCase("Wallet Adjustment: Delivered to Undelivered", () => {
  // Previously: credit=440, debit=0 (PrePaid delivered)
  // Now: credit=0, debit=100 (penalty)
  const adjustment = WalletCalculator.calculateWalletAdjustment(440, 0, 0, 100);
  assertEquals(adjustment, -540, "Adjustment should be -540 (reverse credit + apply penalty)");
});

testCase("Wallet Adjustment: Undelivered to Delivered", () => {
  // Previously: credit=0, debit=100 (penalty)
  // Now: credit=440, debit=0 (delivered prepaid)
  const adjustment = WalletCalculator.calculateWalletAdjustment(0, 100, 440, 0);
  assertEquals(adjustment, 540, "Adjustment should be 540 (reverse penalty + apply credit)");
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================
testCase("Validation: Negative Gross Amount", () => {
  const financials: OrderFinancials = {
    grossAmount: -100,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 0,
    vendorPayout: VENDOR_PRICE,
  };

  const validation = WalletCalculator.validateOrderFinancials(financials);
  assertEquals(validation.isValid, false, "Should be invalid");
});

testCase("Validation: Discount Exceeds Gross Amount", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 600, // More than gross amount
    vendorPayout: VENDOR_PRICE - 600,
  };

  const validation = WalletCalculator.validateOrderFinancials(financials);
  assertEquals(validation.isValid, false, "Should be invalid");
});

testCase("Validation: Negative Margin", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: 600, // More than gross amount
    totalMargin: -100,
    discount: 0,
    vendorPayout: 600,
  };

  const validation = WalletCalculator.validateOrderFinancials(financials);
  assertEquals(validation.isValid, false, "Should be invalid");
});

testCase("Validation: Valid Financials", () => {
  const financials: OrderFinancials = {
    grossAmount: ORDER_VALUE,
    vendorCut: VENDOR_PRICE,
    totalMargin: MARGIN,
    discount: 0,
    vendorPayout: VENDOR_PRICE,
  };

  const validation = WalletCalculator.validateOrderFinancials(financials);
  assertEquals(validation.isValid, true, "Should be valid");
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log("\n" + "=".repeat(70));
console.log("TEST SUMMARY");
console.log("=".repeat(70));
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`${RED}Failed: ${testsFailed}${RESET}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log(`\n${GREEN}✓ All tests passed!${RESET}\n`);
  process.exit(0);
} else {
  console.log(`\n${RED}✗ Some tests failed!${RESET}\n`);
  process.exit(1);
}
